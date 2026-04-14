from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.schedule import ScheduleRun
from app.models.user import User
from app.services.excel_parser import parse_excel

router = APIRouter(tags=["upload"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/upload")
async def upload_excel(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    try:
        parsed = parse_excel(content, current_user.plan)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Derive date range from the uploaded shifts
    shift_dates = [s["date"] for s in parsed["shifts"] if s.get("date")]
    date_from = date.fromisoformat(min(shift_dates)) if shift_dates else None
    date_to   = date.fromisoformat(max(shift_dates)) if shift_dates else None

    today = date.today()
    run = ScheduleRun(
        user_id=current_user.id,
        status="pending",
        year=today.year,
        month=today.month,
        date_from=date_from,
        date_to=date_to,
        employees_data=parsed["employees"],
        shifts_data=parsed["shifts"],
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return {
        "run_id":          run.id,
        "employees":       parsed["employees"],
        "shifts":          parsed["shifts"],
        "employee_count":  len(parsed["employees"]),
        "shift_slot_count": len(parsed["shifts"]),
        "date_from":       str(date_from) if date_from else None,
        "date_to":         str(date_to)   if date_to   else None,
    }
