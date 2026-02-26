"""
Run this script once to generate the sample Excel template.
Output: frontend/public/schedule_template.xlsx
"""
from datetime import date, timedelta
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill("solid", fgColor="4D3DB7")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def style_header(ws, row: int, num_cols: int):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")


def create_template():
    wb = openpyxl.Workbook()

    # ── Employees sheet ───────────────────────────────────────────────────────
    ws_emp = wb.active
    ws_emp.title = "Employees"

    emp_headers = ["Name", "Email", "Role", "Max Hours/Week", "Skills"]
    ws_emp.append(emp_headers)
    style_header(ws_emp, 1, len(emp_headers))

    sample_employees = [
        ["Alice Johnson", "alice@example.com", "Manager", 40, "first_aid,cash_handling"],
        ["Bob Smith", "bob@example.com", "Staff", 35, "customer_service"],
        ["Carol White", "carol@example.com", "Staff", 35, "customer_service,first_aid"],
        ["David Brown", "david@example.com", "Staff", 30, "customer_service"],
        ["Eve Davis", "eve@example.com", "Manager", 40, "first_aid,cash_handling,customer_service"],
    ]

    for row in sample_employees:
        ws_emp.append(row)

    for col in range(1, len(emp_headers) + 1):
        ws_emp.column_dimensions[get_column_letter(col)].width = 22

    # ── Shifts sheet ──────────────────────────────────────────────────────────
    ws_shifts = wb.create_sheet("Shifts")

    shift_headers = ["Date", "Start Time", "End Time", "Required Role", "Min Staff", "Required Skills"]
    ws_shifts.append(shift_headers)
    style_header(ws_shifts, 1, len(shift_headers))

    today = date.today()
    # Generate shifts for the next 7 days
    sample_shifts = []
    for i in range(7):
        d = today + timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        sample_shifts += [
            [ds, "09:00", "17:00", "Manager", 1, "cash_handling"],
            [ds, "09:00", "17:00", "Staff", 2, "customer_service"],
            [ds, "13:00", "21:00", "Staff", 2, "customer_service"],
        ]

    for row in sample_shifts:
        ws_shifts.append(row)

    for col in range(1, len(shift_headers) + 1):
        ws_shifts.column_dimensions[get_column_letter(col)].width = 20

    out = Path(__file__).parent / "frontend" / "public" / "schedule_template.xlsx"
    wb.save(out)
    print(f"Template created: {out}")


if __name__ == "__main__":
    create_template()
