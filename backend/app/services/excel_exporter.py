"""Export a solved schedule result to a user-friendly Excel workbook.

Three sheets:
  1. Employee Schedule — one row per employee, one column per date (Gantt-like)
  2. Shift Schedule   — grouped by date, each shift row shows assigned employee
  3. All Assignments  — flat editable table (designed for manual tweaks)
"""

from collections import defaultdict
from io import BytesIO

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# ── Brand colours ────────────────────────────────────────────────────────────
PURPLE       = "4D3DB7"
TEAL         = "33D3CF"
DARK         = "14162B"
LAVENDER     = "E8DDFF"
LIGHT_TEAL   = "D4F5F4"
AMBER_LIGHT  = "FEF3C7"
RED_LIGHT    = "FEE2E2"
WHITE        = "FFFFFF"
GREY_LIGHT   = "F3F4F6"

# ── Reusable styles ──────────────────────────────────────────────────────────
HEADER_FILL  = PatternFill("solid", fgColor=PURPLE)
HEADER_FONT  = Font(bold=True, color=WHITE, size=11)
DATE_FILL    = PatternFill("solid", fgColor=DARK)
DATE_FONT    = Font(bold=True, color=WHITE, size=10)
EMP_NAME_FONT = Font(bold=True, size=10)
ASSIGNED_FILL = PatternFill("solid", fgColor=LIGHT_TEAL)
UNASSIGNED_FILL = PatternFill("solid", fgColor=RED_LIGHT)
ZEBRA_FILL   = PatternFill("solid", fgColor=GREY_LIGHT)
THIN_BORDER  = Border(
    left=Side(style="thin", color="D1D5DB"),
    right=Side(style="thin", color="D1D5DB"),
    top=Side(style="thin", color="D1D5DB"),
    bottom=Side(style="thin", color="D1D5DB"),
)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT   = Alignment(horizontal="left", vertical="center", wrap_text=True)


def _apply_header(ws, row: int, num_cols: int):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
        cell.border = THIN_BORDER


def _apply_date_banner(ws, row: int, num_cols: int):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = DATE_FILL
        cell.font = DATE_FONT
        cell.alignment = LEFT
        cell.border = THIN_BORDER


def _auto_width(ws, col: int, min_w: float = 10, max_w: float = 28):
    """Set column width based on max content length (capped)."""
    letter = get_column_letter(col)
    best = min_w
    for row in ws.iter_rows(min_col=col, max_col=col, values_only=False):
        cell = row[0]
        if cell.value:
            best = max(best, min(len(str(cell.value)) + 3, max_w))
    ws.column_dimensions[letter].width = best


# ─────────────────────────────────────────────────────────────────────────────
#  PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def build_schedule_excel(
    employees: list[dict],
    shifts: list[dict],
    assignments: list[dict],
) -> bytes:
    wb = openpyxl.Workbook()

    _build_employee_schedule(wb, employees, assignments)
    _build_shift_schedule(wb, assignments)
    _build_all_assignments(wb, employees, assignments)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
#  SHEET 1 — Employee Schedule (Gantt-like)
# ─────────────────────────────────────────────────────────────────────────────

def _build_employee_schedule(wb, employees: list[dict], assignments: list[dict]):
    ws = wb.active
    ws.title = "Employee Schedule"

    # Build lookup: employee_name → {date → [shift strings]}
    emp_shifts: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    all_dates: set[str] = set()

    for a in assignments:
        name = a.get("employee_name") or "UNASSIGNED"
        d = a.get("date", "")
        start = a.get("start_time", "")
        end = a.get("end_time", "")
        all_dates.add(d)
        emp_shifts[name][d].append(f"{start}–{end}")

    sorted_dates = sorted(all_dates)
    emp_names = [e.get("name", "") for e in employees]

    # Header row
    ws.cell(row=1, column=1, value="Employee")
    for j, d in enumerate(sorted_dates, start=2):
        ws.cell(row=1, column=j, value=d)
    _apply_header(ws, 1, 1 + len(sorted_dates))

    # Employee rows
    for i, name in enumerate(emp_names, start=2):
        ws.cell(row=i, column=1, value=name)
        ws.cell(row=i, column=1).font = EMP_NAME_FONT
        ws.cell(row=i, column=1).alignment = LEFT
        ws.cell(row=i, column=1).border = THIN_BORDER

        for j, d in enumerate(sorted_dates, start=2):
            cell = ws.cell(row=i, column=j)
            shift_list = emp_shifts.get(name, {}).get(d, [])
            if shift_list:
                cell.value = "\n".join(shift_list)
                cell.fill = ASSIGNED_FILL
            cell.alignment = CENTER
            cell.border = THIN_BORDER

        # Zebra stripe for even rows
        if i % 2 == 0:
            for j in range(1, 2 + len(sorted_dates)):
                c = ws.cell(row=i, column=j)
                if not c.fill or c.fill.fgColor.rgb == "00000000":
                    c.fill = ZEBRA_FILL

    # Unassigned row (if any)
    unassigned_shifts = emp_shifts.get("UNASSIGNED", {})
    if unassigned_shifts:
        r = len(emp_names) + 2
        ws.cell(row=r, column=1, value="UNASSIGNED")
        ws.cell(row=r, column=1).font = Font(bold=True, color="DC2626", size=10)
        ws.cell(row=r, column=1).border = THIN_BORDER
        for j, d in enumerate(sorted_dates, start=2):
            cell = ws.cell(row=r, column=j)
            shift_list = unassigned_shifts.get(d, [])
            if shift_list:
                cell.value = "\n".join(shift_list)
                cell.fill = UNASSIGNED_FILL
            cell.alignment = CENTER
            cell.border = THIN_BORDER

    # Column widths
    ws.column_dimensions["A"].width = 22
    for j in range(2, 2 + len(sorted_dates)):
        ws.column_dimensions[get_column_letter(j)].width = 16

    # Freeze first column + header row
    ws.freeze_panes = "B2"


# ─────────────────────────────────────────────────────────────────────────────
#  SHEET 2 — Shift Schedule (grouped by date)
# ─────────────────────────────────────────────────────────────────────────────

def _build_shift_schedule(wb, assignments: list[dict]):
    ws = wb.create_sheet("Shift Schedule")

    # Group assignments by date
    by_date: dict[str, list[dict]] = defaultdict(list)
    for a in assignments:
        by_date[a.get("date", "")].append(a)

    sorted_dates = sorted(by_date.keys())

    cols = ["Start", "End", "Skills", "Employee", "Cost/hr", "Shift Cost"]
    num_cols = len(cols)

    row_idx = 1
    for d in sorted_dates:
        # Date banner row
        ws.cell(row=row_idx, column=1, value=d)
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=num_cols)
        _apply_date_banner(ws, row_idx, num_cols)
        row_idx += 1

        # Column headers under each date group
        for c, h in enumerate(cols, start=1):
            ws.cell(row=row_idx, column=c, value=h)
        _apply_header(ws, row_idx, num_cols)
        row_idx += 1

        # Sort shifts by start_time, then slot_index
        day_shifts = sorted(
            by_date[d],
            key=lambda x: (x.get("start_time", ""), x.get("slot_index", 0)),
        )

        for a in day_shifts:
            skills = a.get("required_skills", [])
            skills_str = ", ".join(skills) if isinstance(skills, list) else str(skills)
            emp_name = a.get("employee_name") or "UNASSIGNED"
            cost_h = a.get("cost_per_hour", 0)
            shift_cost = a.get("shift_cost", 0)

            row_data = [
                a.get("start_time", ""),
                a.get("end_time", ""),
                skills_str,
                emp_name,
                f"€{cost_h:.2f}" if cost_h else "",
                f"€{shift_cost:.2f}" if shift_cost else "",
            ]
            for c, val in enumerate(row_data, start=1):
                cell = ws.cell(row=row_idx, column=c, value=val)
                cell.alignment = CENTER
                cell.border = THIN_BORDER

            # Highlight unassigned shifts
            if emp_name == "UNASSIGNED":
                for c in range(1, num_cols + 1):
                    ws.cell(row=row_idx, column=c).fill = UNASSIGNED_FILL
            elif row_idx % 2 == 0:
                for c in range(1, num_cols + 1):
                    ws.cell(row=row_idx, column=c).fill = ZEBRA_FILL

            row_idx += 1

        # Blank spacer row between dates
        row_idx += 1

    # Column widths
    widths = [10, 10, 30, 22, 12, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ─────────────────────────────────────────────────────────────────────────────
#  SHEET 3 — All Assignments (flat, editable)
# ─────────────────────────────────────────────────────────────────────────────

def _build_all_assignments(wb, employees: list[dict], assignments: list[dict]):
    ws = wb.create_sheet("All Assignments")

    headers = [
        "Date", "Start Time", "End Time", "Required Skills",
        "Slot #", "Assigned Employee", "Cost/hr", "Shift Cost",
    ]
    ws.append(headers)
    _apply_header(ws, 1, len(headers))

    # Build employee name list for data validation dropdown
    emp_names = sorted({e.get("name", "") for e in employees})
    emp_list_str = ",".join(emp_names) if emp_names else ""

    sorted_assignments = sorted(
        assignments,
        key=lambda x: (x.get("date", ""), x.get("start_time", ""), x.get("slot_index", 0)),
    )

    for i, a in enumerate(sorted_assignments):
        skills = a.get("required_skills", [])
        skills_str = ", ".join(skills) if isinstance(skills, list) else str(skills)
        emp_name = a.get("employee_name") or "UNASSIGNED"
        cost_h = a.get("cost_per_hour", 0)
        shift_cost = a.get("shift_cost", 0)

        row = [
            a.get("date", ""),
            a.get("start_time", ""),
            a.get("end_time", ""),
            skills_str,
            (a.get("slot_index") or 0) + 1,
            emp_name,
            cost_h,
            shift_cost,
        ]
        ws.append(row)
        r = ws.max_row

        # Style
        for c in range(1, len(headers) + 1):
            cell = ws.cell(row=r, column=c)
            cell.alignment = CENTER
            cell.border = THIN_BORDER

        if emp_name == "UNASSIGNED":
            for c in range(1, len(headers) + 1):
                ws.cell(row=r, column=c).fill = UNASSIGNED_FILL
        elif i % 2 == 0:
            for c in range(1, len(headers) + 1):
                ws.cell(row=r, column=c).fill = ZEBRA_FILL

    # Data validation dropdown on the "Assigned Employee" column (F)
    if emp_list_str and len(sorted_assignments) > 0:
        from openpyxl.worksheet.datavalidation import DataValidation
        dv = DataValidation(
            type="list",
            formula1=f'"{emp_list_str}"',
            allow_blank=True,
            showDropDown=False,
        )
        dv.error = "Please select an employee from the list"
        dv.errorTitle = "Invalid Employee"
        dv.prompt = "Pick an employee or leave as UNASSIGNED"
        dv.promptTitle = "Employee"
        last_row = 1 + len(sorted_assignments)
        dv.add(f"F2:F{last_row}")
        ws.add_data_validation(dv)

    # Column widths
    widths = [14, 13, 13, 30, 8, 24, 12, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Freeze header row
    ws.freeze_panes = "A2"
