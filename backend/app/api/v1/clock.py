import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_pro_plan
from app.models.clock_event import ClockEvent
from app.models.employee import Employee
from app.models.user import User

router = APIRouter(prefix="/clock", tags=["clock"])


async def _load_owned_employee(db: AsyncSession, employee_id: str, user: User) -> Employee:
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.user_id == user.id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.get("/events")
async def list_clock_events(
    employee_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """List clock events for all employees belonging to the current user.
    Optionally filter by employee or date range.
    """
    # All employee IDs that belong to this user
    emp_result = await db.execute(
        select(Employee.id, Employee.name, Employee.phone).where(
            Employee.user_id == current_user.id
        )
    )
    emp_rows = emp_result.all()
    emp_ids = {row.id for row in emp_rows}
    emp_map = {row.id: {"name": row.name, "phone": row.phone} for row in emp_rows}

    if not emp_ids:
        return []

    if employee_id:
        if employee_id not in emp_ids:
            raise HTTPException(status_code=404, detail="Employee not found")
        filter_ids = {employee_id}
    else:
        filter_ids = emp_ids

    query = select(ClockEvent).where(ClockEvent.employee_id.in_(filter_ids))

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

    return [
        {
            "id":                  e.id,
            "employee_id":         e.employee_id,
            "employee_name":       emp_map.get(e.employee_id, {}).get("name", "Unknown"),
            "employee_phone":      emp_map.get(e.employee_id, {}).get("phone", ""),
            "shift_assignment_id": e.shift_assignment_id,
            "event_type":          e.event_type,
            "event_at":            e.event_at.isoformat(),
            "source":              e.source,
            "created_at":          e.created_at.isoformat(),
        }
        for e in events
    ]


@router.get("/events/export.csv")
async def export_clock_events_csv(
    employee_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Download all clock events as a CSV file."""
    events = await list_clock_events(
        employee_id=employee_id,
        date_from=date_from,
        date_to=date_to,
        current_user=current_user,
        db=db,
    )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id", "employee_name", "employee_phone",
            "event_type", "event_at", "source", "shift_assignment_id",
        ],
    )
    writer.writeheader()
    for e in events:
        writer.writerow({
            "id":                  e["id"],
            "employee_name":       e["employee_name"],
            "employee_phone":      e["employee_phone"],
            "event_type":          e["event_type"],
            "event_at":            e["event_at"],
            "source":              e["source"],
            "shift_assignment_id": e["shift_assignment_id"] or "",
        })

    output.seek(0)
    filename = f"clock_events_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_clock_event_manual(
    employee_id: str,
    event_type: str = Query(..., pattern="^(in|out)$"),
    event_at: datetime | None = None,
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
    await db.commit()
    await db.refresh(event)
    return {
        "id":         event.id,
        "employee_id": event.employee_id,
        "event_type": event.event_type,
        "event_at":   event.event_at.isoformat(),
        "source":     event.source,
    }


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clock_event(
    event_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Delete a clock event (manager correction)."""
    emp_result = await db.execute(
        select(Employee.id).where(Employee.user_id == current_user.id)
    )
    user_emp_ids = {row[0] for row in emp_result.all()}

    result = await db.execute(select(ClockEvent).where(ClockEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event or event.employee_id not in user_emp_ids:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.delete(event)
    await db.commit()
