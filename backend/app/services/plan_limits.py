from datetime import date, timedelta

FREE_ADVANCE_DAYS = 14
PAID_ADVANCE_DAYS = 31
FREE_MONTHLY_SOLVES = 1


def max_advance_days(plan: str) -> int:
    return PAID_ADVANCE_DAYS if plan == "paid" else FREE_ADVANCE_DAYS


def max_shift_date(plan: str) -> date:
    return date.today() + timedelta(days=max_advance_days(plan))
