"""Timefold constraint definitions for shift scheduling."""

from timefold.solver.score import (
    ConstraintFactory,
    HardSoftScore,
    Joiners,
    constraint_provider,
)

from timefold_model.domain import ShiftAssignment


@constraint_provider
def define_constraints(factory: ConstraintFactory):
    return [
        # ── Hard constraints ──────────────────────────────────────────────────
        unassigned_shift(factory),
        role_mismatch(factory),
        skills_mismatch(factory),
        overlapping_shifts(factory),
        # ── Soft constraints ──────────────────────────────────────────────────
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


def role_mismatch(factory: ConstraintFactory):
    """Employee role must match the shift's required role."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: (
            a.employee is not None
            and a.shift is not None
            and a.employee.role != a.shift.required_role
        ))
        .penalize(HardSoftScore.ONE_HARD)
        .as_constraint("Role mismatch")
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


def spread_workload(factory: ConstraintFactory):
    """Prefer distributing hours evenly — reward assignments to penalise gaps."""
    return (
        factory.for_each(ShiftAssignment)
        .filter(lambda a: a.employee is not None)
        .reward(HardSoftScore.ONE_SOFT)
        .as_constraint("Reward filled shifts")
    )
