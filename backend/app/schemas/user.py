from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: str
    username: str
    email: EmailStr
    plan: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
