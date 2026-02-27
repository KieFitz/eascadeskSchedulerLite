"""Timefold planning domain for employee shift scheduling."""

from dataclasses import dataclass, field
from datetime import date, time
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

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _span_overlaps_shift(span: dict, shift_date: date, shift_start: time, shift_end: time) -> bool:
    """Return True if an availability span overlaps with the given shift."""
    day = str(span.get("day", ""))
    if "-" in day:
        # Specific date span
        if str(shift_date) != day:
            return False
    else:
        # Weekday span
        if WEEKDAY_NAMES[shift_date.weekday()] != day:
            return False

    span_start_str = span.get("start")
    span_end_str = span.get("end")

    # All-day rule
    if not span_start_str or not span_end_str:
        return True

    span_start = time.fromisoformat(span_start_str)
    span_end = time.fromisoformat(span_end_str)

    # Intervals overlap when neither ends before the other starts
    return not (shift_end <= span_start or span_end <= shift_start)


@dataclass
class Employee:
    id: str
    name: str
    min_hours_week: int
    cost_per_hour: float
    skills: list[str]
    preferred_spans: list[dict] = field(default_factory=list)
    unpreferred_spans: list[dict] = field(default_factory=list)
    unavailable_spans: list[dict] = field(default_factory=list)

    def has_skills(self, required: list[str]) -> bool:
        return all(s in self.skills for s in required)

    def is_available(self, shift_date: date, shift_start: time, shift_end: time) -> bool:
        return not any(
            _span_overlaps_shift(s, shift_date, shift_start, shift_end)
            for s in self.unavailable_spans
        )

    def prefers(self, shift_date: date, shift_start: time, shift_end: time) -> bool:
        return any(
            _span_overlaps_shift(s, shift_date, shift_start, shift_end)
            for s in self.preferred_spans
        )

    def unprefers(self, shift_date: date, shift_start: time, shift_end: time) -> bool:
        return any(
            _span_overlaps_shift(s, shift_date, shift_start, shift_end)
            for s in self.unpreferred_spans
        )


@dataclass
class Shift:
    id: str
    date: date
    start_time: time
    end_time: time
    required_skills: list[str]
    slot_index: int

    def duration_hours(self) -> float:
        start_mins = self.start_time.hour * 60 + self.start_time.minute
        end_mins = self.end_time.hour * 60 + self.end_time.minute
        if end_mins <= start_mins:
            end_mins += 24 * 60  # overnight shift
        return (end_mins - start_mins) / 60

    def overlaps(self, other: "Shift") -> bool:
        if self.date != other.date:
            return False
        start_a = self.start_time.hour * 60 + self.start_time.minute
        end_a = self.end_time.hour * 60 + self.end_time.minute
        start_b = other.start_time.hour * 60 + other.start_time.minute
        end_b = other.end_time.hour * 60 + other.end_time.minute
        return start_a < end_b and start_b < end_a


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
