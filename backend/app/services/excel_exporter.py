"""Export a solved schedule result to an Excel workbook."""

from io import BytesIO

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


HEADER_FILL = PatternFill("solid", fgColor="4D3DB7")
HEADER_FONT = Font(bold=True, color="FFFFFF")
ALT_FILL = PatternFill("solid", fgColor="E8DDFF")


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

    headers = ["Date", "Start Time", "End Time", "Required Role", "Slot", "Assigned Employee", "Employee Email"]
    ws_sched.append(headers)
    _style_header(ws_sched, 1, len(headers))

    for i, a in enumerate(sorted(assignments, key=lambda x: (x.get("date", ""), x.get("start_time", ""), x.get("slot_index", 0)))):
        row = [
            a.get("date", ""),
            a.get("start_time", ""),
            a.get("end_time", ""),
            a.get("required_role", ""),
            a.get("slot_index", 0) + 1,
            a.get("employee_name", "UNASSIGNED"),
            a.get("employee_id", ""),
        ]
        ws_sched.append(row)
        if i % 2 == 0:
            for col in range(1, len(headers) + 1):
                ws_sched.cell(row=i + 2, column=col).fill = ALT_FILL

    for col in range(1, len(headers) + 1):
        ws_sched.column_dimensions[get_column_letter(col)].width = 18

    # ── Sheet 2: Employees ────────────────────────────────────────────────────
    ws_emp = wb.create_sheet("Employees")
    emp_headers = ["Name", "Email", "Role", "Max Hours/Week", "Skills"]
    ws_emp.append(emp_headers)
    _style_header(ws_emp, 1, len(emp_headers))

    for e in employees:
        ws_emp.append([
            e.get("name", ""),
            e.get("email", ""),
            e.get("role", ""),
            e.get("max_hours_week", 40),
            ", ".join(e.get("skills", [])),
        ])

    for col in range(1, len(emp_headers) + 1):
        ws_emp.column_dimensions[get_column_letter(col)].width = 20

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
