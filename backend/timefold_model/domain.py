"""Timefold planning domain for employee shift scheduling."""

from dataclasses import dataclass, field
from datetime import date, time
from typing import Annotated, Optional

from timefold.solver.domain import (
    PlanningEntity,
    PlanningId,
    PlanningScore,
    PlanningSolution,
    PlanningVariable,
    PlanningEntityCollectionProperty,
    ValueRangeProvider,
)
from timefold.solver.score import HardSoftScore


@dataclass
class Employee:
    id: str
    name: str
    role: str
    max_hours_week: int
    skills: list[str]

    def has_skills(self, required: list[str]) -> bool:
        return all(s in self.skills for s in required)


@dataclass
class Shift:
    id: str
    date: date
    start_time: time
    end_time: time
    required_role: str
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


@PlanningEntity
@dataclass
class ShiftAssignment:
    id: str = field(default="")
    shift: Optional[Shift] = field(default=None)
    employee: Annotated[Optional[Employee], PlanningVariable] = field(default=None)

    @PlanningId
    def get_id(self) -> str:
        return self.id


@PlanningSolution
@dataclass
class ScheduleSolution:
    employees: Annotated[list[Employee], ValueRangeProvider] = field(default_factory=list)
    shift_assignments: Annotated[
        list[ShiftAssignment], PlanningEntityCollectionProperty
    ] = field(default_factory=list)
    score: Annotated[Optional[HardSoftScore], PlanningScore] = field(default=None)
