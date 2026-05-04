import asyncio
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.deps import get_current_user, get_db
from app.models.availability import EmployeeAvailability
from app.models.employee import Employee as EmployeeModel
from app.models.schedule import ScheduleRun
from app.models.user import User
from app.schemas.schedule import SolveRequest
from app.services.plan_limits import FREE_MONTHLY_SOLVES
from app.services.scheduler import solve_async

router = APIRouter(tags=["solve"])

_DOW_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _mins_to_hhmm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


async def _merge_db_availability(employees_data: list[dict], user_id: str, db: AsyncSession) -> list[dict]:
    """For Pro users: fetch EmployeeAvailability rows from DB and inject them
    as unavailable_spans / preferred_spans / unpreferred_spans into employees_data,
    matching by employee name (since Excel-sourced employees have no DB id yet).
    DB rules take precedence over any spans from the Excel upload.
    """
    # Build name → DB employee map for this user
    emp_result = await db.execute(
        select(EmployeeModel).where(EmployeeModel.user_id == user_id)
    )
    db_employees = {e.name.strip().lower(): e for e in emp_result.scalars().all()}

    if not db_employees:
        return employees_data

    # Fetch all availability rules for these employees in one query
    db_emp_ids = [e.id for e in db_employees.values()]
    avail_result = await db.execute(
        select(EmployeeAvailability).where(EmployeeAvailability.employee_id.in_(db_emp_ids))
    )
    avail_rows = avail_result.scalars().all()

    # Group by employee_id
    avail_by_emp: dict[str, list[EmployeeAvailability]] = {}
    for row in avail_rows:
        avail_by_emp.setdefault(row.employee_id, []).append(row)

    merged = []
    for emp in employees_data:
        db_emp = db_employees.get(emp.get("name", "").strip().lower())
        if not db_emp:
            merged.append(emp)
            continue

        rules = avail_by_emp.get(db_emp.id, [])
        if not rules:
            merged.append(emp)
            continue

        unavailable_spans = []
        preferred_spans = []
        unpreferred_spans = []

        for r in rules:
            if r.specific_date is not None:
                day_str = r.specific_date.isoformat()
            else:
                day_str = _DOW_NAMES[r.day_of_week]

            span = {
                "day":   day_str,
                "start": _mins_to_hhmm(r.start_min),
                "end":   _mins_to_hhmm(r.end_min),
            }
            if r.type == "unavailable":
                unavailable_spans.append(span)
            elif r.type == "preferred":
                preferred_spans.append(span)
            else:
                unpreferred_spans.append(span)

        merged.append({
            **emp,
            "unavailable_spans": unavailable_spans,
            "preferred_spans":   preferred_spans,
            "unpreferred_spans": unpreferred_spans,
        })

    return merged


async def _background_solve(
    run_id: str,
    employees_data: list,
    shifts_data: list,
    country: str | None,
    timeout_seconds: int | None,
    previous_assignments: list | None,
    user_id: str | None = None,
    is_pro: bool = False,
) -> None:
    """Run the solver in the background and persist the result to its own DB session."""
    async with AsyncSessionLocal() as db:
        try:
            if is_pro and user_id:
                employees_data = await _merge_db_availability(employees_data, user_id, db)

            result_data = await solve_async(
                run_id,
                employees_data,
                shifts_data,
                country=country,
                timeout_seconds=timeout_seconds,
                previous_assignments=previous_assignments,
            )
            result = await db.execute(select(ScheduleRun).where(ScheduleRun.id == run_id))
            run = result.scalar_one()
            run.status = "completed"
            run.result_data = result_data
            run.score_info = result_data.get("score", "")
        except Exception as exc:
            result = await db.execute(select(ScheduleRun).where(ScheduleRun.id == run_id))
            run = result.scalar_one()
            run.status = "failed"
            run.error_message = str(exc)
        await db.commit()


@router.post("/solve", status_code=202)
async def solve(
    body: SolveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Launch the solver as a background task and return immediately (202 Accepted).

    The client should poll GET /schedules/{run_id} every 2 s until
    status != "processing".
    """
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == body.run_id,
            ScheduleRun.user_id == current_user.id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    if run.status == "processing":
        raise HTTPException(status_code=409, detail="This schedule is already being solved")

    # Re-solving a previously completed run does NOT count against the free-tier limit
    is_resolving = run.status == "completed"

    if current_user.plan == "free" and not is_resolving:
        today = date.today()
        count_result = await db.execute(
            select(func.count(ScheduleRun.id)).where(
                ScheduleRun.user_id == current_user.id,
                ScheduleRun.status == "completed",
                func.extract("year",  ScheduleRun.created_at) == today.year,
                func.extract("month", ScheduleRun.created_at) == today.month,
            )
        )
        if count_result.scalar_one() >= FREE_MONTHLY_SOLVES:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Free plan allows {FREE_MONTHLY_SOLVES} auto-schedule per month. "
                    "Upgrade to Pro for unlimited scheduling."
                ),
            )

    previous_assignments = (
        run.result_data.get("assignments") if is_resolving and run.result_data else None
    )

    # Snapshot the data we need before the session is closed
    employees_data = run.employees_data
    shifts_data    = run.shifts_data
    run_id         = run.id

    run.status             = "processing"
    run.error_message      = None
    run.solving_started_at = datetime.now(timezone.utc)
    await db.commit()

    # Fire-and-forget — the task owns its own DB session
    asyncio.create_task(
        _background_solve(
            run_id,
            employees_data,
            shifts_data,
            country=current_user.country,
            timeout_seconds=body.timeout_seconds,
            previous_assignments=previous_assignments,
            user_id=current_user.id,
            is_pro=(current_user.plan == "paid"),
        )
    )

    return {"run_id": run_id, "status": "processing"}
