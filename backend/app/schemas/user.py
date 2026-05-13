from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SUPPORTED_COUNTRIES = Literal["IE", "GB", "ES"]


class UserOut(BaseModel):
    id: str
    username: str
    email: EmailStr
    plan: str
    is_active: bool
    country: str | None
    timezone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UpdateSettingsRequest(BaseModel):
    country: SUPPORTED_COUNTRIES | None = None
    timezone: str | None = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, KeyError):
            raise ValueError(f"Unknown timezone: {v!r}")
        return v
