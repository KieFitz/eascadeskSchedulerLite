"""Parse uploaded Excel files into structured dicts for Timefold."""

from datetime import date, time
from io import BytesIO
from typing import Any

import openpyxl

from app.services.plan_limits import max_shift_date

EMPLOYEE_COLS = {"Name", "Email", "Role", "Max Hours/Week", "Skills"}
SHIFT_COLS = {"Date", "Start Time", "End Time", "Required Role", "Min Staff"}


def _to_time(val: Any) -> str:
    """Normalise an openpyxl time/string cell value to 'HH:MM'."""
    if isinstance(val, time):
        return val.strftime("%H:%M")
    if isinstance(val, str):
        return val.strip()[:5]
    return str(val)


def _to_date(val: Any) -> date:
    """Normalise an openpyxl date/string cell value to a date object."""
    if isinstance(val, date):
        return val
    # Excel sometimes stores dates as strings
    from datetime import datetime
    return datetime.strptime(str(val).strip(), "%Y-%m-%d").date()


def parse_excel(file_bytes: bytes, plan: str) -> dict:
    """
    Parse an Excel workbook and return:
    {
        "employees": [...],
        "shifts": [...],
    }
    Raises ValueError on validation errors.
    """
    wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)

    if "Employees" not in wb.sheetnames:
        raise ValueError("Missing sheet: 'Employees'")
    if "Shifts" not in wb.sheetnames:
        raise ValueError("Missing sheet: 'Shifts'")

    employees = _parse_employees(wb["Employees"])
    shifts = _parse_shifts(wb["Shifts"], plan)

    if not employees:
        raise ValueError("No employees found in the Employees sheet")
    if not shifts:
        raise ValueError("No shifts found in the Shifts sheet")

    return {"employees": employees, "shifts": shifts}


def _parse_employees(ws) -> list[dict]:
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Employees sheet is empty")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    missing = EMPLOYEE_COLS - set(headers)
    if missing:
        raise ValueError(f"Employees sheet missing columns: {missing}")

    idx = {h: i for i, h in enumerate(headers)}
    employees = []
    for i, row in enumerate(rows[1:], start=2):
        name = row[idx["Name"]]
        email = row[idx["Email"]]
        if not name or not email:
            continue  # skip empty rows

        employees.append({
            "id": str(email).strip().lower(),
            "name": str(name).strip(),
            "email": str(email).strip().lower(),
            "role": str(row[idx["Role"]] or "Staff").strip(),
            "max_hours_week": int(row[idx["Max Hours/Week"]] or 40),
            "skills": [
                s.strip()
                for s in str(row[idx["Skills"]] or "").split(",")
                if s.strip()
            ],
        })
    return employees


def _parse_shifts(ws, plan: str) -> list[dict]:
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Shifts sheet is empty")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    missing = SHIFT_COLS - set(headers)
    if missing:
        raise ValueError(f"Shifts sheet missing columns: {missing}")

    idx = {h: i for i, h in enumerate(headers)}
    cutoff = max_shift_date(plan)
    shifts = []
    slot_counters: dict[str, int] = {}

    for i, row in enumerate(rows[1:], start=2):
        raw_date = row[idx["Date"]]
        raw_start = row[idx["Start Time"]]
        raw_end = row[idx["End Time"]]
        if not raw_date or not raw_start or not raw_end:
            continue

        try:
            shift_date = _to_date(raw_date)
        except Exception:
            raise ValueError(f"Row {i}: invalid date '{raw_date}'. Use YYYY-MM-DD format.")

        if shift_date > cutoff:
            plan_label = "Pro" if plan == "paid" else "Free"
            raise ValueError(
                f"Row {i}: date {shift_date} exceeds the {plan_label} plan limit "
                f"({cutoff}). Upgrade to schedule further ahead."
            )

        required_role = str(row[idx["Required Role"]] or "Staff").strip()
        min_staff = int(row[idx["Min Staff"]] or 1)
        required_skills_raw = ""
        if "Required Skills" in idx:
            required_skills_raw = str(row[idx["Required Skills"]] or "")
        required_skills = [s.strip() for s in required_skills_raw.split(",") if s.strip()]

        base_id = f"{shift_date}_{raw_start}"
        slot_counters[base_id] = slot_counters.get(base_id, 0)

        for slot in range(min_staff):
            shift_id = f"{base_id}_slot{slot}"
            shifts.append({
                "id": shift_id,
                "date": str(shift_date),
                "start_time": _to_time(raw_start),
                "end_time": _to_time(raw_end),
                "required_role": required_role,
                "required_skills": required_skills,
                "slot_index": slot,
            })

    return shifts
