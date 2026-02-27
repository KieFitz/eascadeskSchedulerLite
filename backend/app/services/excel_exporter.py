"""Export a solved schedule result to an Excel workbook."""

from io import BytesIO

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


HEADER_FILL     = PatternFill("solid", fgColor="4D3DB7")
HEADER_FONT     = Font(bold=True, color="FFFFFF")
ALT_FILL        = PatternFill("solid", fgColor="E8DDFF")
UNASSIGNED_FILL = PatternFill("solid", fgColor="FEE2E2")


def _style_header(ws, row: int, num_cols: int):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")


def build_schedule_excel(
    employees: list[dict],
    shifts: list[dict],
    assignments: list[dict],
) -> bytes:
    wb = openpyxl.Workbook()

    # ── Sheet 1: Schedule ─────────────────────────────────────────────────────
    ws_sched = wb.active
    ws_sched.title = "Schedule"

    headers = ["Date", "Start Time", "End Time", "Required Skills", "Slot", "Assigned Employee"]
    ws_sched.append(headers)
    _style_header(ws_sched, 1, len(headers))

    sorted_assignments = sorted(
        assignments,
        key=lambda x: (x.get("date", ""), x.get("start_time", ""), x.get("slot_index", 0)),
    )

    for i, a in enumerate(sorted_assignments):
        skills = a.get("required_skills", [])
        skills_str = ", ".join(skills) if isinstance(skills, list) else str(skills)
        employee_name = a.get("employee_name") or "UNASSIGNED"
        row = [
            a.get("date", ""),
            a.get("start_time", ""),
            a.get("end_time", ""),
            skills_str,
            (a.get("slot_index") or 0) + 1,
            employee_name,
        ]
        ws_sched.append(row)
        r = ws_sched.max_row
        if employee_name == "UNASSIGNED":
            for c in range(1, len(headers) + 1):
                ws_sched.cell(row=r, column=c).fill = UNASSIGNED_FILL
        elif i % 2 == 0:
            for c in range(1, len(headers) + 1):
                ws_sched.cell(row=r, column=c).fill = ALT_FILL

    sched_col_widths = [14, 13, 13, 36, 7, 24]
    for i, w in enumerate(sched_col_widths, 1):
        ws_sched.column_dimensions[get_column_letter(i)].width = w

    # ── Sheet 2: Employees ────────────────────────────────────────────────────
    ws_emp = wb.create_sheet("Employees")
    emp_headers = ["Name", "Skills", "Min Hours/Week", "Cost Per Hour"]
    ws_emp.append(emp_headers)
    _style_header(ws_emp, 1, len(emp_headers))

    for e in employees:
        skills = e.get("skills", [])
        ws_emp.append([
            e.get("name", ""),
            ", ".join(skills) if isinstance(skills, list) else str(skills),
            e.get("min_hours_week") or "",
            e.get("cost_per_hour") or "",
        ])

    emp_col_widths = [24, 40, 18, 16]
    for i, w in enumerate(emp_col_widths, 1):
        ws_emp.column_dimensions[get_column_letter(i)].width = w

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
