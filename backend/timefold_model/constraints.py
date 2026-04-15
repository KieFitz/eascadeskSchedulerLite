"""Timefold constraint definitions for shift scheduling.

DESIGN RULES to avoid JPyInterpreter PythonCell cast errors:
  - NO generator expressions or any()/all() with generators in constraint lambdas
  - NO nested functions (closures) inside constraint functions
  - Only use flat lambda expressions in filter/reward/penalize
  - Shift.start_time / end_time are ints (minutes since midnight), not time objects

Thread-safety:
  Constraints that depend on country config (min rest, weekly max) receive their
  values via `build_constraint_provider()` parameters, captured as plain Python
  ints in closures at *provider creation time* — not read from shared globals at
  solve time.  This means concurrent solves for different countries are safe
  even when using a shared SolverManager thread pool.
"""

from timefold.solver.score import (
    ConstraintCollectors,
    ConstraintFactory,
    HardSoftScore,
    Joiners,
    constraint_provider,
)

from timefold_model.domain import ShiftAssignment


def build_constraint_provider(min_rest_mins: int, max_weekly_mins: int):
    """Return a Timefold constraint provider with config baked in.

    Called once per country at SolverManager creation time so there is no
    shared mutable state between concurrent solves.

    Parameters
    ----------
    min_rest_mins:
        Minimum rest between consecutive shifts in minutes (e.g. 660 = 11 h).
    max_weekly_mins:
        Legal weekly hours cap in minutes (e.g. 2880 = 48 h).
    """
    # Balance threshold: 80 % of weekly max.
    # E.g. for 48 h max → 38.4 h threshold.  The solver starts nudging towards
    # more even distribution before anyone actually hits the legal limit.
    balance_threshold = max_weekly_mins * 4 // 5

    @constraint_provider
    def _define_constraints(factory: ConstraintFactory):
        return [
            # ── Hard constraints ──────────────────────────────────────────
            _unassigned_shift(factory),
            _skills_mismatch(factory),
            _overlapping_shifts(factory),
            _unavailable_shift(factory),
            _minimum_rest(factory, min_rest_mins),
            # ── Soft constraints ──────────────────────────────────────────
            _preferred_shift(factory),
            _unpreferred_shift(factory),
            _spread_workload(factory),
            _weekly_overtime(factory, max_weekly_mins),
            _balance_workload(factory, balance_threshold),
        ]

    return _define_constraints


# ── Hard constraints ──────────────────────────────────────────────────────────

def _unassigned_shift(factory: ConstraintFactory):
    """Every shift slot must be filled."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is None)
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Unassigned shift")
    )


def _skills_mismatch(factory: ConstraintFactory):
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


def _overlapping_shifts(factory: ConstraintFactory):
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


def _unavailable_shift(factory: ConstraintFactory):
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

    if end_a <= start_a:
        end_a = end_a + 1440
    if end_b <= start_b:
        end_b = end_b + 1440

    if end_a <= start_b:
        return start_b - end_a
    if end_b <= start_a:
        return start_a - end_b
    return 0


def _minimum_rest(factory: ConstraintFactory, min_rest_mins: int):
    """Enforce minimum rest between consecutive shifts (country labour law)."""
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


# ── Soft constraints ──────────────────────────────────────────────────────────

def _preferred_shift(factory: ConstraintFactory):
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


def _unpreferred_shift(factory: ConstraintFactory):
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


def _spread_workload(factory: ConstraintFactory):
    """Reward all filled assignments — general pressure to assign all shifts."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is not None)
        .reward(HardSoftScore.ONE_SOFT)
        .as_constraint("Reward filled shifts")
    )


def _weekly_overtime(factory: ConstraintFactory, limit: int):
    """Soft-penalise each hour an employee works over the weekly maximum.

    Uses pre-computed iso_week and duration_mins on Shift (flat attribute access —
    no arithmetic inside the JVM transpiler).  Penalises proportionally: 1 soft
    point per hour over the limit, per employee per week.
    """
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is not None and a.shift is not None)
        .group_by(
            lambda a: a.employee.id + "|" + a.shift.iso_week,
            ConstraintCollectors.sum(lambda a: a.shift.duration_mins),
        )
        .filter(lambda _key, total: total > limit)
        .penalize(HardSoftScore.ONE_SOFT, lambda _key, total: (total - limit) // 60)
        .as_constraint("Weekly overtime")
    )


def _balance_workload(factory: ConstraintFactory, threshold: int):
    """Soft-penalise hours above the balance threshold (80 % of weekly max).

    Nudges the solver to distribute work before anyone approaches the hard
    legal limit, reducing the chance that one employee ends up with all shifts.
    """
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is not None and a.shift is not None)
        .group_by(
            lambda a: a.employee.id + "|" + a.shift.iso_week,
            ConstraintCollectors.sum(lambda a: a.shift.duration_mins),
        )
        .filter(lambda _key, total: total > threshold)
        .penalize(HardSoftScore.ONE_SOFT, lambda _key, total: (total - threshold) // 60)
        .as_constraint("Workload balance")
    )
