from datetime import date, timedelta

# Scheduling horizon — how far ahead managers can plan
FREE_ADVANCE_DAYS  = 31   # 1 month
PAID_ADVANCE_DAYS  = 62   # ~2 months (publish schedule ≥2 weeks before it starts)

# Monthly auto-schedule quota
FREE_MONTHLY_SOLVES = 5
# Pro plan has no quota limit


def max_advance_days(plan: str) -> int:
    return PAID_ADVANCE_DAYS if plan == "paid" else FREE_ADVANCE_DAYS


def max_shift_date(plan: str) -> date:
    return date.today() + timedelta(days=max_advance_days(plan))
