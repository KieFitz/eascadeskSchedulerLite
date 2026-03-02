"""Timefold constraint definitions for shift scheduling.

DESIGN RULES to avoid JPyInterpreter PythonCell cast errors:
  - NO generator expressions or any()/all() with generators in constraint lambdas
  - NO nested functions (closures) inside constraint functions
  - Only use flat lambda expressions in filter/reward/penalize
  - Shift.start_time / end_time are ints (minutes since midnight), not time objects
"""

from timefold.solver.score import (
    ConstraintFactory,
    HardSoftScore,
    Joiners,
    constraint_provider,
)

from timefold_model.domain import ShiftAssignment

# ── Country labour-law config ─────────────────────────────────────────────────
# Set by the scheduler before each solve via set_country_config().
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


def _rest_gap_mins(shift_a: ShiftAssignment, shift_b: ShiftAssignment) -> int:
    """
    Compute the rest gap in minutes between two assigned shifts.
    Shift times are ints (minutes since midnight).  Uses date ordinal for
    cross-day arithmetic.  Returns 0 if shifts overlap.
    No nested functions — avoids JPyInterpreter closure issues.
    """
    day_a = shift_a.shift.date.toordinal() * 1440
    day_b = shift_b.shift.date.toordinal() * 1440

    start_a = day_a + shift_a.shift.start_time
    end_a   = day_a + shift_a.shift.end_time
    start_b = day_b + shift_b.shift.start_time
    end_b   = day_b + shift_b.shift.end_time

    # Handle overnight shifts
    if end_a <= start_a:
        end_a = end_a + 1440
    if end_b <= start_b:
        end_b = end_b + 1440

    if end_a <= start_b:
        return start_b - end_a
    if end_b <= start_a:
        return start_a - end_b
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
            and not a.employee.is_available_for(a.shift.id)
        ))
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Employee unavailable")
    )


def minimum_rest_between_shifts(factory: ConstraintFactory):
    """
    Enforce the minimum rest period between consecutive shifts (labour law).
    IE / GB: 11 h min rest   |   ES: 12 h min rest
    """
    min_rest_mins = _active_config["min_rest_hours"] * 60

    return (
        factory.for_each_unique_pair(
            ShiftAssignment,
            Joiners.equal(lambda a: a.employee),
        )
        .filter(lambda a, b: (
            a.employee is not None
            and a.shift is not None
            and b.shift is not None
            and not a.shift.overlaps(b.shift)
            and _rest_gap_mins(a, b) < min_rest_mins
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
            and a.employee.prefers_shift(a.shift.id)
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
            and a.employee.unprefers_shift(a.shift.id)
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
