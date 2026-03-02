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
