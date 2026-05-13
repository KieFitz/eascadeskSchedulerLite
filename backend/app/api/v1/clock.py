import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_pro_plan
from app.models.clock_event import ClockEvent, ClockEventAuditLog, ClockEventEditRequest
from app.models.employee import Employee
from app.models.user import User
from app.models.whatsapp_session import WhatsAppSession

router = APIRouter(prefix="/clock", tags=["clock"])


def _event_snapshot(e: ClockEvent) -> dict:
    return {
        "employee_id":         e.employee_id,
        "shift_assignment_id": e.shift_assignment_id,
        "event_type":          e.event_type,
        "event_at":            e.event_at.isoformat(),
        "source":              e.source,
        "is_estimated":        e.is_estimated,
    }


async def _write_audit(
    db: AsyncSession,
    *,
    clock_event_id: str,
    action: str,
    actor_user: User | None,
    reason: str | None,
    snapshot: dict | None,
) -> None:
    log = ClockEventAuditLog(
        clock_event_id=clock_event_id,
        action=action,
        actor_user_id=actor_user.id if actor_user else None,
        actor_label=actor_user.email if actor_user else "system",
        reason=reason,
        snapshot=snapshot,
    )
    db.add(log)


async def _load_owned_employee(db: AsyncSession, employee_id: str, user: User) -> Employee:
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.user_id == user.id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


async def _build_emp_map(db: AsyncSession, user_id: str):
    emp_result = await db.execute(
        select(Employee.id, Employee.name, Employee.phone).where(
            Employee.user_id == user_id
        )
    )
    emp_rows = emp_result.all()
    emp_ids = {row.id for row in emp_rows}
    emp_map = {row.id: {"name": row.name, "phone": row.phone} for row in emp_rows}
    return emp_ids, emp_map


async def _pending_edit_for(db: AsyncSession, event_id: str) -> ClockEventEditRequest | None:
    result = await db.execute(
        select(ClockEventEditRequest).where(
            ClockEventEditRequest.clock_event_id == event_id,
            ClockEventEditRequest.status == "pending",
        ).order_by(ClockEventEditRequest.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


def _serialize_event(e: ClockEvent, emp_map: dict, pending_edit: ClockEventEditRequest | None = None) -> dict:
    return {
        "id":                  e.id,
        "employee_id":         e.employee_id,
        "employee_name":       emp_map.get(e.employee_id, {}).get("name", "Unknown"),
        "employee_phone":      emp_map.get(e.employee_id, {}).get("phone", ""),
        "shift_assignment_id": e.shift_assignment_id,
        "event_type":          e.event_type,
        "event_at":            e.event_at.isoformat(),
        "source":              e.source,
        "is_estimated":        e.is_estimated,
        "created_at":          e.created_at.isoformat(),
        "deleted_at":          e.deleted_at.isoformat() if e.deleted_at else None,
        "delete_reason":       e.delete_reason,
        "pending_edit":        {
            "id":                  pending_edit.id,
            "proposed_event_at":   pending_edit.proposed_event_at.isoformat(),
            "reason":              pending_edit.reason,
            "created_at":          pending_edit.created_at.isoformat(),
        } if pending_edit else None,
    }


async def _send_edit_whatsapp(employee: Employee, event: ClockEvent, edit_req: ClockEventEditRequest, db: AsyncSession) -> None:
    """Send the employee a WhatsApp message asking them to approve the edit."""
    from app.api.v1.whatsapp import STRINGS, _send_text, _to_local, _tz
    from app.models.user import User as UserModel

    user = await db.get(UserModel, employee.user_id)
    tz_name = user.timezone if user else None

    sess_result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.employee_id == employee.id)
    )
    wa_session = sess_result.scalar_one_or_none()
    lang = wa_session.language if wa_session else "en"

    old_time = _to_local(event.event_at, tz_name).strftime("%H:%M %d/%m/%Y")
    new_time = _to_local(edit_req.proposed_event_at, tz_name).strftime("%H:%M %d/%m/%Y")
    event_label = STRINGS[lang].get(f"opt_clock_{event.event_type}", event.event_type)

    strings = STRINGS[lang]
    msg = strings.get("edit_request", (
        "⚠️ Your manager has proposed a correction to your {type} record:\n"
        "• Was: {old}\n• Now: {new}\n"
        "{reason_line}"
        "Reply *yes* to approve or *no* to reject."
    )).format(
        type=event_label,
        old=old_time,
        new=new_time,
        reason_line=f"Reason: {edit_req.reason}\n" if edit_req.reason else "",
    )

    # Store the approval token on the session so the bot can resolve it on next message
    if wa_session:
        wa_session.state = f"edit_confirm_{edit_req.approval_token}"
        await db.flush()

    to = f"whatsapp:{employee.phone}"
    _send_text(to, msg)


@router.get("/events")
async def list_clock_events(
    employee_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_deleted: bool = Query(default=False),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """List clock events. Deleted events hidden by default."""
    emp_ids, emp_map = await _build_emp_map(db, current_user.id)

    if not emp_ids:
        return []

    if employee_id:
        if employee_id not in emp_ids:
            raise HTTPException(status_code=404, detail="Employee not found")
        filter_ids = {employee_id}
    else:
        filter_ids = emp_ids

    query = select(ClockEvent).where(ClockEvent.employee_id.in_(filter_ids))

    if not include_deleted:
        query = query.where(ClockEvent.deleted_at.is_(None))

    if date_from:
        query = query.where(
            ClockEvent.event_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
        )
    if date_to:
        query = query.where(
            ClockEvent.event_at < datetime(date_to.year, date_to.month, date_to.day + 1, tzinfo=timezone.utc)
        )

    query = query.order_by(ClockEvent.event_at.desc())
    result = await db.execute(query)
    events = result.scalars().all()

    rows = []
    for e in events:
        pending = await _pending_edit_for(db, e.id)
        rows.append(_serialize_event(e, emp_map, pending))
    return rows


@router.get("/events/export.csv")
async def export_clock_events_csv(
    employee_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_deleted: bool = Query(default=False),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Download all clock events as a CSV file."""
    events = await list_clock_events(
        employee_id=employee_id,
        date_from=date_from,
        date_to=date_to,
        include_deleted=include_deleted,
        current_user=current_user,
        db=db,
    )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id", "employee_name", "employee_phone",
            "event_type", "event_at", "source", "is_estimated", "shift_assignment_id",
            "deleted_at", "delete_reason", "pending_edit_proposed_at",
        ],
    )
    writer.writeheader()
    for e in events:
        writer.writerow({
            "id":                       e["id"],
            "employee_name":            e["employee_name"],
            "employee_phone":           e["employee_phone"],
            "event_type":               e["event_type"],
            "event_at":                 e["event_at"],
            "source":                   e["source"],
            "is_estimated":             e["is_estimated"],
            "shift_assignment_id":      e["shift_assignment_id"] or "",
            "deleted_at":               e["deleted_at"] or "",
            "delete_reason":            e["delete_reason"] or "",
            "pending_edit_proposed_at": e["pending_edit"]["proposed_event_at"] if e["pending_edit"] else "",
        })

    output.seek(0)
    filename = f"clock_events_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/events/{event_id}/audit")
async def get_clock_event_audit(
    event_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Return the full audit trail for a single clock event."""
    emp_ids, _ = await _build_emp_map(db, current_user.id)

    result = await db.execute(select(ClockEvent).where(ClockEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event or event.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Event not found")

    log_result = await db.execute(
        select(ClockEventAuditLog)
        .where(ClockEventAuditLog.clock_event_id == event_id)
        .order_by(ClockEventAuditLog.created_at.asc())
    )
    logs = log_result.scalars().all()

    edit_result = await db.execute(
        select(ClockEventEditRequest)
        .where(ClockEventEditRequest.clock_event_id == event_id)
        .order_by(ClockEventEditRequest.created_at.asc())
    )
    edits = edit_result.scalars().all()

    return {
        "audit_log": [
            {
                "id":          l.id,
                "action":      l.action,
                "actor_label": l.actor_label,
                "reason":      l.reason,
                "snapshot":    l.snapshot,
                "created_at":  l.created_at.isoformat(),
            }
            for l in logs
        ],
        "edit_requests": [
            {
                "id":                 r.id,
                "proposed_event_at":  r.proposed_event_at.isoformat(),
                "status":             r.status,
                "reason":             r.reason,
                "created_at":         r.created_at.isoformat(),
                "resolved_at":        r.resolved_at.isoformat() if r.resolved_at else None,
            }
            for r in edits
        ],
    }


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_clock_event_manual(
    employee_id: str,
    event_type: str = Query(..., pattern="^(in|out)$"),
    event_at: datetime | None = None,
    reason: str | None = Query(default=None),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Manually record a clock-in or clock-out event for an employee."""
    await _load_owned_employee(db, employee_id, current_user)
    event = ClockEvent(
        employee_id=employee_id,
        event_type=event_type,
        event_at=event_at or datetime.now(timezone.utc),
        source="manual",
    )
    db.add(event)
    await db.flush()

    await _write_audit(
        db,
        clock_event_id=event.id,
        action="create",
        actor_user=current_user,
        reason=reason,
        snapshot=_event_snapshot(event),
    )

    await db.commit()
    await db.refresh(event)
    return {
        "id":          event.id,
        "employee_id": event.employee_id,
        "event_type":  event.event_type,
        "event_at":    event.event_at.isoformat(),
        "source":      event.source,
    }


@router.patch("/events/{event_id}")
async def request_clock_event_edit(
    event_id: str,
    proposed_event_at: datetime = Query(...),
    reason: str | None = Query(default=None),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Propose a time correction for a clock event.

    Creates a ClockEventEditRequest with status=pending and sends the employee
    a WhatsApp message asking them to approve or reject the change.
    The original event_at is unchanged until the employee approves.
    """
    emp_ids, emp_map = await _build_emp_map(db, current_user.id)

    result = await db.execute(select(ClockEvent).where(ClockEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event or event.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Cannot edit a deleted event")

    # Cancel any existing pending request for this event before creating a new one
    existing = await _pending_edit_for(db, event_id)
    if existing:
        existing.status = "cancelled"
        existing.resolved_at = datetime.now(timezone.utc)

    edit_req = ClockEventEditRequest(
        clock_event_id=event_id,
        proposed_event_at=proposed_event_at,
        reason=reason,
        requested_by_user_id=current_user.id,
    )
    db.add(edit_req)
    await db.flush()

    await _write_audit(
        db,
        clock_event_id=event_id,
        action="edit",
        actor_user=current_user,
        reason=f"Edit requested — proposed time: {proposed_event_at.isoformat()}" + (f" | {reason}" if reason else ""),
        snapshot={**_event_snapshot(event), "proposed_event_at": proposed_event_at.isoformat()},
    )

    # Load employee to send WhatsApp message
    emp_result = await db.execute(select(Employee).where(Employee.id == event.employee_id))
    employee = emp_result.scalar_one_or_none()
    if employee and employee.phone:
        await _send_edit_whatsapp(employee, event, edit_req, db)

    await db.commit()

    return {
        "edit_request_id":   edit_req.id,
        "status":            "pending",
        "proposed_event_at": proposed_event_at.isoformat(),
    }


@router.post("/events/edit-confirm/{token}", status_code=status.HTTP_200_OK)
async def resolve_clock_event_edit(
    token: str,
    approved: bool = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Resolve an edit request — called by the WhatsApp webhook when employee replies yes/no.

    This endpoint is internal (called server-side from whatsapp.py), not directly by
    the browser, so it has no JWT auth — the token itself is the credential.
    """
    result = await db.execute(
        select(ClockEventEditRequest).where(
            ClockEventEditRequest.approval_token == token,
            ClockEventEditRequest.status == "pending",
        )
    )
    edit_req = result.scalar_one_or_none()
    if not edit_req:
        raise HTTPException(status_code=404, detail="Edit request not found or already resolved")

    now = datetime.now(timezone.utc)
    edit_req.status = "approved" if approved else "rejected"
    edit_req.resolved_at = now

    event_result = await db.execute(select(ClockEvent).where(ClockEvent.id == edit_req.clock_event_id))
    event = event_result.scalar_one_or_none()

    if approved and event:
        old_snapshot = _event_snapshot(event)
        event.event_at = edit_req.proposed_event_at
        event.source = "manual"  # mark as manually corrected
        await _write_audit(
            db,
            clock_event_id=event.id,
            action="edit",
            actor_user=None,
            reason=f"Employee approved edit via WhatsApp. Original: {old_snapshot['event_at']}",
            snapshot={**old_snapshot, "new_event_at": edit_req.proposed_event_at.isoformat()},
        )

    await db.commit()
    return {"status": edit_req.status}


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clock_event(
    event_id: str,
    reason: str | None = Query(default=None),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a clock event. Row kept for compliance; audit log entry written."""
    emp_ids, _ = await _build_emp_map(db, current_user.id)

    result = await db.execute(select(ClockEvent).where(ClockEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event or event.employee_id not in emp_ids:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Event already deleted")

    # Cancel any pending edit request on deletion
    pending = await _pending_edit_for(db, event_id)
    if pending:
        pending.status = "cancelled"
        pending.resolved_at = datetime.now(timezone.utc)

    event.deleted_at = datetime.now(timezone.utc)
    event.deleted_by_user_id = current_user.id
    event.delete_reason = reason

    await _write_audit(
        db,
        clock_event_id=event.id,
        action="delete",
        actor_user=current_user,
        reason=reason,
        snapshot=_event_snapshot(event),
    )

    await db.commit()
