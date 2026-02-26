from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.schedule import ScheduleRun
from app.models.user import User
from app.services.excel_exporter import build_schedule_excel

router = APIRouter(tags=["export"])


@router.get("/export/{run_id}")
async def export_schedule(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScheduleRun).where(
            ScheduleRun.id == run_id,
            ScheduleRun.user_id == current_user.id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if run.status != "completed" or not run.result_data:
        raise HTTPException(status_code=400, detail="Schedule has not been solved yet")

    xlsx_bytes = build_schedule_excel(
        employees=run.employees_data or [],
        shifts=run.shifts_data or [],
        assignments=run.result_data.get("assignments", []),
    )

    filename = f"schedule_{run.year}_{run.month:02d}_{run_id[:8]}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
