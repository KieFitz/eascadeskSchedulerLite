"""Timefold solver service — runs in a thread pool executor."""

import asyncio
from datetime import date, time

from timefold.solver import SolverFactory
from timefold.solver.config import (
    Duration,
    SolverConfig,
    ScoreDirectorFactoryConfig,
    TerminationConfig,
)

from app.core.config import settings
from timefold_model.domain import Employee, ScheduleSolution, Shift, ShiftAssignment
from timefold_model.constraints import define_constraints


def _build_solver():
    config = SolverConfig(
        solution_class=ScheduleSolution,
        entity_class_list=[ShiftAssignment],
        score_director_factory_config=ScoreDirectorFactoryConfig(
            constraint_provider_function=define_constraints
        ),
        termination_config=TerminationConfig(
            spent_limit=Duration(seconds=settings.SOLVER_TIMEOUT_SECONDS)
        ),
    )
    return SolverFactory.create(config).build_solver()


def _solve_sync(employees_data: list[dict], shifts_data: list[dict]) -> dict:
    employees = [
        Employee(
            id=e["id"],
            name=e["name"],
            min_hours_week=e.get("min_hours_week", 0),
            cost_per_hour=e.get("cost_per_hour", 0.0),
            skills=e.get("skills", []),
            preferred_spans=e.get("preferred_spans", []),
            unpreferred_spans=e.get("unpreferred_spans", []),
            unavailable_spans=e.get("unavailable_spans", []),
        )
        for e in employees_data
    ]

    assignments = []
    for s in shifts_data:
        shift = Shift(
            id=s["id"],
            date=date.fromisoformat(s["date"]),
            start_time=time.fromisoformat(s["start_time"]),
            end_time=time.fromisoformat(s["end_time"]),
            required_skills=s.get("required_skills", []),
            slot_index=s["slot_index"],
        )
        assignments.append(ShiftAssignment(id=s["id"], shift=shift))

    problem = ScheduleSolution(employees=employees, shift_assignments=assignments)
    solver = _build_solver()
    solution: ScheduleSolution = solver.solve(problem)

    result_assignments = []
    for a in solution.shift_assignments:
        result_assignments.append({
            "shift_id": a.shift.id if a.shift else None,
            "date": str(a.shift.date) if a.shift else None,
            "start_time": str(a.shift.start_time) if a.shift else None,
            "end_time": str(a.shift.end_time) if a.shift else None,
            "required_skills": a.shift.required_skills if a.shift else [],
            "slot_index": a.shift.slot_index if a.shift else None,
            "employee_id": a.employee.id if a.employee else None,
            "employee_name": a.employee.name if a.employee else None,
        })

    score_str = str(solution.score) if solution.score else "unknown"
    return {"assignments": result_assignments, "score": score_str}


async def solve_async(employees_data: list[dict], shifts_data: list[dict]) -> dict:
    """Run the solver in a thread-pool so it doesn't block the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _solve_sync, employees_data, shifts_data)
