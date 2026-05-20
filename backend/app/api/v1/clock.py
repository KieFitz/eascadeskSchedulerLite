import calendar
import csv
import io
from collections import defaultdict
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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

    _send_text(employee.phone, msg)


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
    month: str | None = Query(default=None, description="YYYY-MM — filter to a calendar month"),
    employee_id: str | None = Query(default=None),
    audit: bool = Query(default=False, description="Include original timestamps and edit trail columns"),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """
    Compliance CSV export — one row per employee per day worked, including soft-deleted
    events and monthly summary rows.  Accepts ?audit=true for full edit-trail columns
    (required for Spanish Real Decreto-ley 8/2019 labour inspection submissions).
    """
    # ------------------------------------------------------------------ scope
    emp_result = await db.execute(
        select(Employee).where(Employee.user_id == current_user.id)
    )
    all_emps = emp_result.scalars().all()
    emp_info: dict[str, dict] = {
        e.id: {
            "name":          e.name,
            "nif":           e.nif or "",
            "min_hours_week": e.min_hours_week,
        }
        for e in all_emps
    }
    all_emp_ids = set(emp_info)

    if not all_emp_ids:
        raise HTTPException(status_code=404, detail="No employees found")

    if employee_id:
        if employee_id not in all_emp_ids:
            raise HTTPException(status_code=404, detail="Employee not found")
        filter_ids = {employee_id}
    else:
        filter_ids = all_emp_ids

    # ----------------------------------------------------------- date window
    tz_name = getattr(current_user, "timezone", None) or None
    try:
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except ZoneInfoNotFoundError:
        tz = timezone.utc

    utc_from: datetime | None = None
    utc_to:   datetime | None = None
    month_label = month or "all"

    if month:
        try:
            y, m = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            raise HTTPException(status_code=422, detail="month must be YYYY-MM")
        # First moment of month in local tz → UTC
        local_start = datetime(y, m, 1, 0, 0, 0, tzinfo=tz)
        last_day    = calendar.monthrange(y, m)[1]
        local_end   = datetime(y, m, last_day, 23, 59, 59, 999999, tzinfo=tz)
        utc_from = local_start.astimezone(timezone.utc)
        utc_to   = local_end.astimezone(timezone.utc)

    # -------------------------------------------------------- fetch events
    # Include ALL events — soft-deleted rows are required by the regulation
    query = select(ClockEvent).where(ClockEvent.employee_id.in_(filter_ids))
    if utc_from:
        query = query.where(ClockEvent.event_at >= utc_from)
    if utc_to:
        query = query.where(ClockEvent.event_at <= utc_to)
    query = query.order_by(ClockEvent.employee_id, ClockEvent.event_at.asc())

    result = await db.execute(query)
    events: list[ClockEvent] = result.scalars().all()

    # ------------------------------------------------- audit data (optional)
    # Map: event_id → list[ClockEventAuditLog] and event_id → list[ClockEventEditRequest]
    audit_logs:   dict[str, list[ClockEventAuditLog]]     = defaultdict(list)
    edit_reqs:    dict[str, list[ClockEventEditRequest]]   = defaultdict(list)

    if audit and events:
        event_ids = [e.id for e in events]
        al_result = await db.execute(
            select(ClockEventAuditLog)
            .where(ClockEventAuditLog.clock_event_id.in_(event_ids))
            .order_by(ClockEventAuditLog.created_at.asc())
        )
        for log in al_result.scalars().all():
            audit_logs[log.clock_event_id].append(log)

        er_result = await db.execute(
            select(ClockEventEditRequest)
            .where(ClockEventEditRequest.clock_event_id.in_(event_ids))
            .order_by(ClockEventEditRequest.created_at.asc())
        )
        for req in er_result.scalars().all():
            edit_reqs[req.clock_event_id].append(req)

    # ------------------------------------------ group events → local date
    def _local(dt: datetime) -> datetime:
        # Ensure the datetime is tz-aware before converting (DB may return naive UTC)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(tz)

    def _fmt_time(dt: datetime | None) -> str:
        """HH:MM:SS in local tz."""
        return _local(dt).strftime("%H:%M:%S") if dt else ""

    def _fmt_dt(dt: datetime | None) -> str:
        """YYYY-MM-DD HH:MM:SS in local tz."""
        return _local(dt).strftime("%Y-%m-%d %H:%M:%S") if dt else ""

    def _parse_snap_time(iso: str | None) -> str:
        """Parse an ISO timestamp from an audit snapshot and format as HH:MM:SS local."""
        if not iso:
            return ""
        try:
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return _local(dt).strftime("%H:%M:%S")
        except (ValueError, TypeError):
            return iso  # return raw if unparseable

    # {emp_id: {local_date: [ClockEvent, ...]}}
    by_emp_date: dict[str, dict[date, list[ClockEvent]]] = defaultdict(lambda: defaultdict(list))
    for ev in events:
        local_date = _local(ev.event_at).date()
        by_emp_date[ev.employee_id][local_date].append(ev)

    # ------------------------------------------------- build CSV rows
    STANDARD_FIELDS = [
        "record_id",
        "employee_nif", "employee_name",
        "date",
        "clock_in_time",  "clock_in_source",  "clock_in_is_estimated",
        "clock_out_time", "clock_out_source", "clock_out_is_estimated",
        "break_duration_minutes",
        "effective_work_time",
        "ordinary_hours", "overtime_hours", "overtime_type",
        "record_status", "adjustment_reason",
        "deleted", "deleted_at", "deleted_by", "deletion_reason",
    ]
    AUDIT_FIELDS = [
        "original_clock_in_time",
        "original_clock_out_time",
        "edited_at",
        "edited_by_manager",
        "edit_approved_by_employee",
    ]
    fieldnames = STANDARD_FIELDS + (AUDIT_FIELDS if audit else [])

    detail_rows: list[dict] = []

    for emp_id in sorted(by_emp_date):
        info = emp_info.get(emp_id, {})
        emp_name     = info.get("name", "Unknown")
        emp_nif      = info.get("nif") or emp_id[:8]
        min_hrs_week = info.get("min_hours_week") or 0
        # Daily contracted hours: min_hours_week / 5 days, default 8 h if not set
        contracted_day_hrs = (min_hrs_week / 5.0) if min_hrs_week else 8.0

        date_map = by_emp_date[emp_id]

        for work_date in sorted(date_map):
            day_evs = sorted(date_map[work_date], key=lambda e: e.event_at)

            # Split into live (non-deleted) and all events.
            # Hours are computed from live events only — deleted records don't count.
            # But if the whole day's clock-in was deleted we still emit a row
            # (regulation requires deleted records to appear with deleted=yes).
            live = [e for e in day_evs if e.deleted_at is None]

            ins_live  = [e for e in live if e.event_type == "in"]
            outs_live = [e for e in live if e.event_type == "out"]
            b_starts  = [e for e in live if e.event_type == "break_start"]
            b_ends    = [e for e in live if e.event_type == "break_end"]

            # Anchor clock-in: prefer live, fall back to first deleted in event
            all_ins = [e for e in day_evs if e.event_type == "in"]
            if not all_ins:
                continue  # no clock-in at all on this date — skip

            ci_ev = ins_live[0] if ins_live else all_ins[0]
            co_ev = outs_live[-1] if outs_live else None

            # Break minutes: pair break_start → next break_end chronologically
            break_minutes = 0
            be_iter = iter(b_ends)
            be_next = next(be_iter, None)
            for bs in b_starts:
                while be_next and be_next.event_at <= bs.event_at:
                    be_next = next(be_iter, None)
                if be_next:
                    diff = (be_next.event_at - bs.event_at).total_seconds() / 60
                    if diff > 0:
                        break_minutes += int(diff)
                    be_next = next(be_iter, None)

            if co_ev:
                raw_min  = (co_ev.event_at - ci_ev.event_at).total_seconds() / 60
                eff_min  = max(0, int(raw_min) - break_minutes)
            else:
                eff_min  = 0

            eff_hrs  = eff_min / 60.0
            ord_hrs  = min(eff_hrs, contracted_day_hrs)
            ot_hrs   = max(0.0, eff_hrs - contracted_day_hrs)

            # Effective work time as HH:MM
            eff_hh, eff_mm = divmod(eff_min, 60)
            eff_str = f"{eff_hh:02d}:{eff_mm:02d}"

            # Record status — inspects all events on the day (including deleted)
            any_estimated = any(e.is_estimated for e in day_evs)
            any_adjusted  = any(e.source == "manual" for e in day_evs)
            if any_estimated:
                record_status = "estimated"
            elif any_adjusted:
                record_status = "manually_adjusted"
            else:
                record_status = "original"

            # Deleted flags — report on the clock-in event as the anchor record.
            # deleted_by always populated from audit log (not audit-mode-only).
            deleted_flag  = "yes" if ci_ev.deleted_at else "no"
            deleted_at_s  = _fmt_dt(ci_ev.deleted_at) if ci_ev.deleted_at else ""
            deletion_rsn  = ci_ev.delete_reason or ""
            deleted_by_s  = ""
            if ci_ev.deleted_at:
                for log in audit_logs.get(ci_ev.id, []):
                    if log.action == "delete":
                        deleted_by_s = log.actor_label
                        break

            row: dict = {
                "record_id":               ci_ev.id,
                "employee_nif":            emp_nif,
                "employee_name":           emp_name,
                "date":                    work_date.isoformat(),
                "clock_in_time":           _fmt_time(ci_ev.event_at),
                "clock_in_source":         ci_ev.source,
                "clock_in_is_estimated":   "yes" if ci_ev.is_estimated else "no",
                "clock_out_time":          _fmt_time(co_ev.event_at) if co_ev else "",
                "clock_out_source":        co_ev.source if co_ev else "",
                "clock_out_is_estimated":  "yes" if (co_ev and co_ev.is_estimated) else "no",
                "break_duration_minutes":  break_minutes,
                "effective_work_time":     eff_str,
                "ordinary_hours":          round(ord_hrs, 2),
                "overtime_hours":          round(ot_hrs, 2),
                "overtime_type":           "paid" if ot_hrs > 0 else "",
                "record_status":           record_status,
                "adjustment_reason":       "",
                "deleted":                 deleted_flag,
                "deleted_at":              deleted_at_s,
                "deleted_by":              deleted_by_s,
                "deletion_reason":         deletion_rsn,
            }

            if audit:
                # Original times from the first "create" audit log snapshot
                orig_ci = ""
                orig_co = ""
                for log in audit_logs.get(ci_ev.id, []):
                    if log.action == "create" and log.snapshot:
                        orig_ci = _parse_snap_time(log.snapshot.get("event_at"))
                        break
                if co_ev:
                    for log in audit_logs.get(co_ev.id, []):
                        if log.action == "create" and log.snapshot:
                            orig_co = _parse_snap_time(log.snapshot.get("event_at"))
                            break

                # Most recent approved edit request across the day's events
                edited_at_s   = ""
                edited_by_s   = ""
                approved_by_s = ""
                for ev in day_evs:
                    for req in edit_reqs.get(ev.id, []):
                        if req.status == "approved" and req.resolved_at:
                            if not edited_at_s or req.resolved_at.isoformat() > edited_at_s:
                                edited_at_s   = _fmt_dt(req.resolved_at)
                                # manager who proposed
                                for log in audit_logs.get(ev.id, []):
                                    if log.action == "edit" and log.actor_label != "system":
                                        edited_by_s = log.actor_label
                                        break
                                approved_by_s = "yes"
                        elif req.status == "rejected" and req.resolved_at:
                            approved_by_s = "no"

                # adjustment_reason: use the manager-supplied reason from edit requests only,
                # not the auto-generated audit log entries (which are verbose system text).
                reasons = []
                for ev in day_evs:
                    for req in edit_reqs.get(ev.id, []):
                        if req.reason and req.reason not in reasons:
                            reasons.append(req.reason)
                row["adjustment_reason"] = "; ".join(reasons)

                row["original_clock_in_time"]    = orig_ci
                row["original_clock_out_time"]   = orig_co
                row["edited_at"]                 = edited_at_s
                row["edited_by_manager"]          = edited_by_s
                row["edit_approved_by_employee"]  = approved_by_s

            detail_rows.append({
                **row,
                "_emp_id":    emp_id,
                "_emp_name":  emp_name,
                "_emp_nif":   emp_nif,
                "_work_date": work_date,
                "_ord_hrs":   round(ord_hrs, 2),
                "_ot_hrs":    round(ot_hrs, 2),
            })

    # ------------------------------------------- monthly summary rows
    # One ordinary-hours total + one overtime-hours total per employee
    summary_rows: list[dict] = []
    # Group detail rows by (emp_id, YYYY-MM)
    by_emp_month: dict[tuple, dict] = defaultdict(lambda: {"ord": 0.0, "ot": 0.0})
    for r in detail_rows:
        key = (r["_emp_id"], r["_work_date"].strftime("%Y-%m"))
        by_emp_month[key]["ord"] += r["_ord_hrs"]
        by_emp_month[key]["ot"]  += r["_ot_hrs"]
        by_emp_month[key]["emp_nif"]  = r["_emp_nif"]
        by_emp_month[key]["emp_name"] = r["_emp_name"]

    for (emp_id, ym), totals in sorted(by_emp_month.items()):
        blank: dict = {f: "" for f in fieldnames}
        summary_rows.append({
            **blank,
            "_emp_id":    emp_id,
            "_emp_name":  totals["emp_name"],
            "_emp_nif":   totals["emp_nif"],
            "_work_date": date.fromisoformat(f"{ym}-01"),
            "_ord_hrs":   0.0,
            "_ot_hrs":    0.0,
            "employee_nif":   totals["emp_nif"],
            "employee_name":  totals["emp_name"],
            "date":           f"{ym} - monthly total: ordinary hours",
            "ordinary_hours": round(totals["ord"], 2),
            "record_status":  "summary",
        })
        summary_rows.append({
            **blank,
            "_emp_id":    emp_id,
            "_emp_name":  totals["emp_name"],
            "_emp_nif":   totals["emp_nif"],
            "_work_date": date.fromisoformat(f"{ym}-01"),
            "_ord_hrs":   0.0,
            "_ot_hrs":    0.0,
            "employee_nif":   totals["emp_nif"],
            "employee_name":  totals["emp_name"],
            "date":           f"{ym} - monthly total: overtime hours",
            "overtime_hours": round(totals["ot"], 2),
            "record_status":  "summary",
        })

    # Sort: all rows together, employee name → date → summary last
    all_rows = detail_rows + summary_rows
    all_rows.sort(key=lambda r: (
        r["_emp_name"],
        r["_work_date"],
        1 if r["record_status"] == "summary" else 0,
    ))

    # ------------------------------------------------- render CSV
    # UTF-8 BOM (﻿) ensures Excel opens the file correctly without encoding prompts.
    output = io.StringIO()
    output.write("﻿")
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(all_rows)

    output.seek(0)
    exported_at = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"eascadesk_clock_{month_label.replace('-', '_')}_{exported_at}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
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
