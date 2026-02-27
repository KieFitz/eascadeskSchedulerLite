"""Parse uploaded Excel files into structured dicts for Timefold."""

from datetime import date, time
from io import BytesIO
from typing import Any

import openpyxl

from app.services.plan_limits import max_shift_date

EMPLOYEE_REQUIRED_COLS = {"Name", "Skills"}
SHIFT_REQUIRED_COLS = {"Date", "Start Time", "End Time", "Min Staff"}
AVAILABILITY_REQUIRED_COLS = {"Employee", "Type", "Day / Date"}
VALID_AVAIL_TYPES = {"Preferred", "Unpreferred", "Unavailable"}
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _to_time_str(val: Any) -> str:
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
    from datetime import datetime
    return datetime.strptime(str(val).strip(), "%Y-%m-%d").date()


def _row_idx(headers: list[str]) -> dict[str, int]:
    return {h: i for i, h in enumerate(headers)}


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

    # Parse availability first so we can attach it to employees by name
    availability: dict[str, dict] = {}  # name.lower() → {preferred, unpreferred, unavailable}
    if "Availability" in wb.sheetnames:
        availability = _parse_availability(wb["Availability"])

    employees = _parse_employees(wb["Employees"], availability)
    shifts = _parse_shifts(wb["Shifts"], plan)

    if not employees:
        raise ValueError("No employees found in the Employees sheet")
    if not shifts:
        raise ValueError("No shifts found in the Shifts sheet")

    return {"employees": employees, "shifts": shifts}


def _parse_employees(ws, availability: dict) -> list[dict]:
    rows = list(ws.iter_rows(values_only=True))
    # Skip hint rows (rows after header where first cell is italic hint text or empty)
    if not rows:
        raise ValueError("Employees sheet is empty")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    missing = EMPLOYEE_REQUIRED_COLS - set(headers)
    if missing:
        raise ValueError(f"Employees sheet missing required columns: {missing}")

    idx = _row_idx(headers)
    employees = []
    for i, row in enumerate(rows[1:], start=2):
        name = row[idx["Name"]]
        if not name or str(name).strip().startswith("Full name"):
            continue  # skip hint rows and empty rows

        name_str = str(name).strip()
        name_key = name_str.lower()

        skills_raw = row[idx["Skills"]] if "Skills" in idx else ""
        skills = [s.strip() for s in str(skills_raw or "").split(",") if s.strip()]

        min_hours = 0
        if "Min Hours/Week" in idx and row[idx["Min Hours/Week"]]:
            try:
                min_hours = int(row[idx["Min Hours/Week"]])
            except (ValueError, TypeError):
                pass

        cost_per_hour = 0.0
        if "Cost Per Hour" in idx and row[idx["Cost Per Hour"]]:
            try:
                cost_per_hour = float(row[idx["Cost Per Hour"]])
            except (ValueError, TypeError):
                pass

        av = availability.get(name_key, {})

        employees.append({
            "id": name_key.replace(" ", "_"),
            "name": name_str,
            "min_hours_week": min_hours,
            "cost_per_hour": cost_per_hour,
            "skills": skills,
            "preferred_spans": av.get("preferred", []),
            "unpreferred_spans": av.get("unpreferred", []),
            "unavailable_spans": av.get("unavailable", []),
        })
    return employees


def _parse_availability(ws) -> dict:
    """
    Returns a dict keyed by lowercase employee name:
    {
        "alice johnson": {
            "preferred": [{"day": "Monday", "start": "08:00", "end": "14:00"}, ...],
            "unpreferred": [...],
            "unavailable": [...],
        }
    }
    """
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return {}

    headers = [str(h).strip() if h else "" for h in rows[0]]
    missing = AVAILABILITY_REQUIRED_COLS - set(headers)
    if missing:
        raise ValueError(f"Availability sheet missing required columns: {missing}")

    idx = _row_idx(headers)
    result: dict[str, dict] = {}

    for i, row in enumerate(rows[1:], start=2):
        employee = row[idx["Employee"]]
        av_type = row[idx["Type"]]
        day_or_date = row[idx["Day / Date"]]

        if not employee or not av_type or not day_or_date:
            continue  # skip empty / hint rows

        employee_str = str(employee).strip()
        # Skip the hint row
        if employee_str.lower().startswith("must match"):
            continue

        av_type_str = str(av_type).strip()
        if av_type_str not in VALID_AVAIL_TYPES:
            raise ValueError(
                f"Availability row {i}: Type must be one of {VALID_AVAIL_TYPES}, got '{av_type_str}'"
            )

        day_str = str(day_or_date).strip()
        # Validate day/date value
        if day_str not in WEEKDAY_NAMES and not _is_date_string(day_str):
            raise ValueError(
                f"Availability row {i}: Day/Date '{day_str}' must be a weekday name "
                f"(e.g. 'Monday') or a date in YYYY-MM-DD format."
            )

        start_str = None
        end_str = None
        if "Start Time" in idx and row[idx["Start Time"]]:
            start_str = _to_time_str(row[idx["Start Time"]])
        if "End Time" in idx and row[idx["End Time"]]:
            end_str = _to_time_str(row[idx["End Time"]])

        span = {"day": day_str, "start": start_str, "end": end_str}

        key = employee_str.lower()
        if key not in result:
            result[key] = {"preferred": [], "unpreferred": [], "unavailable": []}

        type_key = av_type_str.lower()
        if type_key == "preferred":
            result[key]["preferred"].append(span)
        elif type_key == "unpreferred":
            result[key]["unpreferred"].append(span)
        else:
            result[key]["unavailable"].append(span)

    return result


def _is_date_string(s: str) -> bool:
    try:
        from datetime import datetime
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _parse_shifts(ws, plan: str) -> list[dict]:
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Shifts sheet is empty")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    missing = SHIFT_REQUIRED_COLS - set(headers)
    if missing:
        raise ValueError(f"Shifts sheet missing required columns: {missing}")

    idx = _row_idx(headers)
    cutoff = max_shift_date(plan)
    shifts = []

    for i, row in enumerate(rows[1:], start=2):
        raw_date = row[idx["Date"]]
        raw_start = row[idx["Start Time"]]
        raw_end = row[idx["End Time"]]

        if not raw_date or not raw_start or not raw_end:
            continue
        # Skip hint rows
        if str(raw_date).strip().upper().startswith("YYYY"):
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

        min_staff = 1
        if row[idx["Min Staff"]]:
            try:
                min_staff = int(row[idx["Min Staff"]])
            except (ValueError, TypeError):
                pass

        required_skills_raw = ""
        if "Required Skills" in idx:
            required_skills_raw = str(row[idx["Required Skills"]] or "")
        required_skills = [s.strip() for s in required_skills_raw.split(",") if s.strip()]

        start_str = _to_time_str(raw_start)
        end_str = _to_time_str(raw_end)
        base_id = f"{shift_date}_{start_str}"

        for slot in range(min_staff):
            shift_id = f"{base_id}_slot{slot}"
            shifts.append({
                "id": shift_id,
                "date": str(shift_date),
                "start_time": start_str,
                "end_time": end_str,
                "required_skills": required_skills,
                "slot_index": slot,
            })

    return shifts
