from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.schedule import ScheduleRun
from app.models.user import User
from app.schemas.schedule import AssignmentUpdateRequest, ScheduleRunOut, ValidateRequest
from app.services.plan_limits import FREE_MONTHLY_SOLVES

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("/usage")
async def get_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current month's solve usage for the authenticated user.

    Always returned regardless of plan so the frontend can conditionally render
    the counter for free users without a separate plan check.
    """
    today = date.today()
    count_result = await db.execute(
        select(func.count(ScheduleRun.id)).where(
            ScheduleRun.user_id == current_user.id,
            ScheduleRun.status == "completed",
            func.extract("year",  ScheduleRun.created_at) == today.year,
            func.extract("month", ScheduleRun.created_at) == today.month,
        )
    )
    solves_used = count_result.scalar_one()
    return {
        "plan":         current_user.plan,
        "solves_used":  solves_used,
        "solves_limit": FREE_MONTHLY_SOLVES if current_user.plan == "free" else None,
    }


@router.get("/", response_model=list[ScheduleRunOut])
async def list_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScheduleRun)
        .where(ScheduleRun.user_id == current_user.id)
        .order_by(ScheduleRun.created_at.desc())
        .limit(20)
    )
    return result.scalars().all()


@router.get("/{run_id}", response_model=ScheduleRunOut)
async def get_schedule(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == run_id, ScheduleRun.user_id == current_user.id
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return run


@router.delete("/{run_id}", status_code=204)
async def delete_schedule(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == run_id, ScheduleRun.user_id == current_user.id
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(run)
    await db.commit()


@router.patch("/{run_id}/assignments", response_model=ScheduleRunOut)
async def update_assignments(
    run_id: str,
    body: AssignmentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist manual edits (reassignments, new/deleted shifts) made in the UI.

    Stores the updated assignments in result_data so:
    - The export endpoint can produce an Excel without re-solving.
    - The solver warm-starts from these assignments on the next re-solve.
    """
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == run_id, ScheduleRun.user_id == current_user.id
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Merge assignments into result_data, preserving any other keys (e.g. "score")
    run.result_data = {**(run.result_data or {}), "assignments": body.assignments}

    # If the manager added / removed shifts, persist the updated shift list too
    if body.shifts is not None:
        run.shifts_data = body.shifts

    # Clear the solver score — it's no longer accurate after manual edits
    run.score_info = None
    # Mark completed so the export endpoint accepts it
    run.status = "completed"

    await db.commit()
    await db.refresh(run)
    return run


@router.post("/{run_id}/validate")
async def validate_schedule(
    run_id: str,
    body: ValidateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check hard constraints on the current (possibly manually edited) schedule.

    Returns instantly — uses a pure-Python constraint mirror, no Timefold/JVM.
    """
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == run_id, ScheduleRun.user_id == current_user.id
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")

    employees = body.employees or run.employees_data or []
    shifts = body.shifts or run.shifts_data or []

    from app.services.scheduler import check_constraints  # noqa: PLC0415

    violations = check_constraints(
        employees_data=employees,
        shifts_data=shifts,
        assignments_data=body.assignments,
        country=current_user.country,
    )
    return {"violations": violations}
