"""Timefold planning domain for employee shift scheduling.

DESIGN RULE — NO closures/generators in domain methods.
JPyInterpreter transpiles Python → Java bytecode.  Generator expressions
(e.g. `any(f(x) for x in lst)`) capture outer variables as PythonCell objects,
and the JVM bridge cannot cast PythonInteger/PythonTime/etc. to PythonCell.

Availability, preferences, and skill checks are therefore pre-computed in
`scheduler.py` (pure Python, never seen by Timefold) and stored as plain
lists of shift IDs on each Employee.  Domain methods are then trivial list
membership tests — no closures, no generators, no type marshalling issues.

Also: Python `time` objects cannot be used anywhere here either.
`Shift.start_time` / `end_time` are stored as plain ints (minutes since midnight).
`date` objects are fine.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Annotated, Optional

from timefold.solver.domain import (
    planning_entity,
    planning_solution,
    PlanningVariable,
    PlanningId,
    PlanningScore,
    PlanningEntityCollectionProperty,
    ValueRangeProvider,
)
from timefold.solver.score import HardSoftScore


@dataclass
class Employee:
    id: str
    name: str
    min_hours_week: int
    cost_per_hour: float
    skills: list[str]
    # Pre-computed in scheduler.py before Timefold sees the data.
    # These are lists of shift IDs (strings) — simple membership tests only.
    unavailable_shift_ids: list[str] = field(default_factory=list)
    preferred_shift_ids: list[str] = field(default_factory=list)
    unpreferred_shift_ids: list[str] = field(default_factory=list)

    def has_skills(self, required: list[str]) -> bool:
        """No generator — explicit for-loop avoids PythonCell closure issue."""
        for skill in required:
            if skill not in self.skills:
                return False
        return True

    def is_available_for(self, shift_id: str) -> bool:
        return shift_id not in self.unavailable_shift_ids

    def prefers_shift(self, shift_id: str) -> bool:
        return shift_id in self.preferred_shift_ids

    def unprefers_shift(self, shift_id: str) -> bool:
        return shift_id in self.unpreferred_shift_ids


@dataclass
class Shift:
    id: str
    date: date
    start_time: int  # minutes since midnight, e.g. 480 = 08:00
    end_time: int    # minutes since midnight, e.g. 960 = 16:00
    required_skills: list[str]
    slot_index: int

    def duration_hours(self) -> float:
        end = self.end_time
        if end <= self.start_time:
            end = end + 1440  # overnight shift
        return (end - self.start_time) / 60

    def overlaps(self, other: "Shift") -> bool:
        if self.date != other.date:
            return False
        return self.start_time < other.end_time and other.start_time < self.end_time


@planning_entity
@dataclass
class ShiftAssignment:
    id: Annotated[str, PlanningId] = field(default="")
    shift: Optional[Shift] = field(default=None)
    employee: Annotated[Optional[Employee], PlanningVariable] = field(default=None)


@planning_solution
@dataclass
class ScheduleSolution:
    employees: Annotated[list[Employee], ValueRangeProvider] = field(default_factory=list)
    shift_assignments: Annotated[list[ShiftAssignment], PlanningEntityCollectionProperty] = field(
        default_factory=list
    )
    score: Annotated[Optional[HardSoftScore], PlanningScore] = field(default=None)
