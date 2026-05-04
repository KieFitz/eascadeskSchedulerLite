import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# E.164: leading +, 8–15 digits.
PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")

AvailabilityType = Literal["preferred", "unpreferred", "unavailable"]


def _validate_phone(v: str) -> str:
    v = v.strip().replace(" ", "").replace("-", "")
    if not PHONE_RE.match(v):
        raise ValueError("Phone must be in E.164 format, e.g. +353871234567")
    return v


class AvailabilityIn(BaseModel):
    type: AvailabilityType
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    specific_date: date | None = None
    start_min: int = Field(ge=0, le=1440)
    end_min: int = Field(ge=0, le=1440)

    @field_validator("end_min")
    @classmethod
    def _end_after_start(cls, v: int, info):
        start = info.data.get("start_min")
        if start is not None and v <= start:
            raise ValueError("end_min must be greater than start_min")
        return v


class AvailabilityOut(AvailabilityIn):
    id: str

    model_config = {"from_attributes": True}


class EmployeeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str
    skills: list[str] = []
    min_hours_week: int = Field(default=0, ge=0, le=168)
    cost_per_hour: float = Field(default=0.0, ge=0)
    is_active: bool = True

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _validate_phone(v)


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = None
    skills: list[str] | None = None
    min_hours_week: int | None = Field(default=None, ge=0, le=168)
    cost_per_hour: float | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return _validate_phone(v) if v is not None else None


class EmployeeOut(BaseModel):
    id: str
    name: str
    phone: str
    skills: list[str]
    min_hours_week: int
    cost_per_hour: float
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
