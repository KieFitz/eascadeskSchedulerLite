from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.schedule import ScheduleRun
from app.models.user import User
from app.schemas.schedule import ScheduleRunOut, SolveRequest
from app.services.plan_limits import FREE_MONTHLY_SOLVES
from app.services.scheduler import solve_async

router = APIRouter(tags=["solve"])


@router.post("/solve", response_model=ScheduleRunOut)
async def solve(
    body: SolveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch the run
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == body.run_id,
            ScheduleRun.user_id == current_user.id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    # A run currently being processed cannot be re-triggered
    if run.status == "processing":
        raise HTTPException(status_code=409, detail="This schedule is already being solved")

    # Track whether this is a fresh solve or a re-solve of an already-completed run.
    # Re-solving a previously completed run does NOT count against the free-tier limit
    # (it was already counted the first time it completed).
    is_resolving = run.status == "completed"

    # Enforce free-tier monthly limit for new solves only
    if current_user.plan == "free" and not is_resolving:
        today = date.today()
        count_result = await db.execute(
            select(func.count(ScheduleRun.id)).where(
                ScheduleRun.user_id == current_user.id,
                ScheduleRun.status == "completed",
                func.extract("year", ScheduleRun.created_at) == today.year,
                func.extract("month", ScheduleRun.created_at) == today.month,
            )
        )
        solves_this_month = count_result.scalar_one()
        if solves_this_month >= FREE_MONTHLY_SOLVES:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Free plan allows {FREE_MONTHLY_SOLVES} auto-schedule per month. "
                    "Upgrade to Pro for unlimited scheduling."
                ),
            )

    # Mark as processing and clear any previous result
    run.status = "processing"
    run.error_message = None
    await db.commit()

    try:
        result_data = await solve_async(
            run.employees_data,
            run.shifts_data,
            country=current_user.country,
            timeout_seconds=body.timeout_seconds,
        )
        run.status = "completed"
        run.result_data = result_data
        run.score_info = result_data.get("score", "")
    except Exception as exc:
        run.status = "failed"
        run.error_message = str(exc)

    await db.commit()
    await db.refresh(run)
    return run
