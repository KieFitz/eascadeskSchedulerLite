from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ScheduleRunOut(BaseModel):
    id: str
    status: str
    year: int
    month: int
    score_info: str | None
    error_message: str | None
    created_at: datetime
    employees_data: Any | None = None
    shifts_data: Any | None = None
    result_data: Any | None = None

    model_config = {"from_attributes": True}


class SolveRequest(BaseModel):
    run_id: str
    # Override the default SOLVER_TIMEOUT_SECONDS for this solve only.
    # Useful for re-scheduling: pass a higher value to search longer.
    timeout_seconds: int | None = None


class AssignmentUpdateRequest(BaseModel):
    """Body for PATCH /schedules/{run_id}/assignments — persist manual edits."""
    assignments: list[dict]
    # If shifts were added or removed by the manager, send the updated list here.
    shifts: list[dict] | None = None


class ValidateRequest(BaseModel):
    """Body for POST /schedules/{run_id}/validate — check hard constraints."""
    assignments: list[dict]
    # Optional overrides — if omitted the server uses the stored run data.
    employees: list[dict] | None = None
    shifts: list[dict] | None = None
