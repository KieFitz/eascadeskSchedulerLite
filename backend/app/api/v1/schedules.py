from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.schedule import ScheduleRun
from app.models.user import User
from app.schemas.schedule import ScheduleRunOut

router = APIRouter(prefix="/schedules", tags=["schedules"])


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
