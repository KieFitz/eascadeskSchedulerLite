"""Timefold constraint definitions for shift scheduling."""

from datetime import datetime, timedelta

from timefold.solver.score import (
    ConstraintFactory,
    HardSoftScore,
    Joiners,
    constraint_provider,
)

from timefold_model.domain import Shift, ShiftAssignment

# ── Country labour-law config ─────────────────────────────────────────────
# Set by the scheduler before each solve via set_country_config().
# Keys: min_rest_hours (hard), max_weekly_hours (hard)
_COUNTRY_CONFIGS: dict[str, dict] = {
    "IE": {"min_rest_hours": 11, "max_weekly_hours": 48},
    "GB": {"min_rest_hours": 11, "max_weekly_hours": 48},
    "ES": {"min_rest_hours": 12, "max_weekly_hours": 40},
}
_DEFAULT_CONFIG = {"min_rest_hours": 11, "max_weekly_hours": 48}

# Mutable module-level config — replaced before each solve call
_active_config: dict = dict(_DEFAULT_CONFIG)


def set_country_config(country: str | None) -> None:
    """Called by the scheduler before solving to activate the right rule set."""
    global _active_config
    _active_config = dict(_COUNTRY_CONFIGS.get(country or "", _DEFAULT_CONFIG))


def _gap_minutes(shift_a: Shift, shift_b: Shift) -> int:
    """
    Return the rest gap in minutes between two shifts assigned to the same employee.
    Returns 0 if the shifts overlap (the overlapping_shifts constraint covers that).
    """
    def to_dt(s: Shift, end: bool) -> datetime:
        t = s.end_time if end else s.start_time
        dt = datetime(s.date.year, s.date.month, s.date.day, t.hour, t.minute)
        return dt

    end_a   = to_dt(shift_a, end=True)
    start_a = to_dt(shift_a, end=False)
    end_b   = to_dt(shift_b, end=True)
    start_b = to_dt(shift_b, end=False)

    # Handle overnight shifts
    if end_a <= start_a:
        end_a += timedelta(days=1)
    if end_b <= start_b:
        end_b += timedelta(days=1)

    if end_a <= start_b:
        return int((start_b - end_a).total_seconds() / 60)
    if end_b <= start_a:
        return int((start_a - end_b).total_seconds() / 60)
    return 0  # overlapping — handled by overlapping_shifts


@constraint_provider
def define_constraints(factory: ConstraintFactory):
    return [
        # ── Hard constraints ──────────────────────────────────────────────────
        unassigned_shift(factory),
        skills_mismatch(factory),
        overlapping_shifts(factory),
        unavailable_shift(factory),
        minimum_rest_between_shifts(factory),
        # ── Soft constraints ──────────────────────────────────────────────────
        preferred_shift(factory),
        unpreferred_shift(factory),
        spread_workload(factory),
    ]


def unassigned_shift(factory: ConstraintFactory):
    """Every shift slot must be filled."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is None)
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Unassigned shift")
    )


def skills_mismatch(factory: ConstraintFactory):
    """Employee must have all skills required by the shift."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: (
            a.employee is not None
            and a.shift is not None
            and not a.employee.has_skills(a.shift.required_skills)
        ))
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Missing required skills")
    )


def overlapping_shifts(factory: ConstraintFactory):
    """An employee cannot be assigned to two overlapping shifts."""
    return (
        factory.for_each_unique_pair(
            ShiftAssignment,
            Joiners.equal(lambda a: a.employee),
        )
        .filter(lambda a, b: (
            a.employee is not None
            and a.shift is not None
            and b.shift is not None
            and a.shift.overlaps(b.shift)
        ))
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Overlapping shifts")
    )


def unavailable_shift(factory: ConstraintFactory):
    """Employee must not be assigned during their unavailable windows."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: (
            a.employee is not None
            and a.shift is not None
            and not a.employee.is_available(a.shift.date, a.shift.start_time, a.shift.end_time)
        ))
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Employee unavailable")
    )


def minimum_rest_between_shifts(factory: ConstraintFactory):
    """
    Enforce the minimum rest period between consecutive shifts (labour law).
    The required rest is read from _active_config at solve time.
    Ireland / UK: 11 h   |   Spain: 12 h
    """
    min_rest = _active_config["min_rest_hours"] * 60  # capture value at definition time

    return (
        factory.for_each_unique_pair(
            ShiftAssignment,
            Joiners.equal(lambda a: a.employee),
        )
        .filter(lambda a, b: (
            a.employee is not None
            and a.shift is not None
            and b.shift is not None
            and not a.shift.overlaps(b.shift)          # overlaps already covered above
            and _gap_minutes(a.shift, b.shift) < min_rest
        ))
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Insufficient rest between shifts")
    )


def preferred_shift(factory: ConstraintFactory):
    """Reward assigning employees to their preferred time windows."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: (
            a.employee is not None
            and a.shift is not None
            and a.employee.prefers(a.shift.date, a.shift.start_time, a.shift.end_time)
        ))
        .reward(HardSoftScore.ONE_SOFT)
        .as_constraint("Preferred time slot")
    )


def unpreferred_shift(factory: ConstraintFactory):
    """Penalise assigning employees to their unpreferred time windows."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: (
            a.employee is not None
            and a.shift is not None
            and a.employee.unprefers(a.shift.date, a.shift.start_time, a.shift.end_time)
        ))
        .penalize(HardSoftScore.ONE_SOFT)
        .as_constraint("Unpreferred time slot")
    )


def spread_workload(factory: ConstraintFactory):
    """Prefer distributing hours evenly — reward all filled assignments."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is not None)
        .reward(HardSoftScore.ONE_SOFT)
        .as_constraint("Reward filled shifts")
    )
