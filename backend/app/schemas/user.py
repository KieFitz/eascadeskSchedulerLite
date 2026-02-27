from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr

SUPPORTED_COUNTRIES = Literal["IE", "GB", "ES"]


class UserOut(BaseModel):
    id: str
    username: str
    email: EmailStr
    plan: str
    is_active: bool
    country: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UpdateSettingsRequest(BaseModel):
    country: SUPPORTED_COUNTRIES | None = None
