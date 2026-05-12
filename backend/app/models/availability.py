import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EmployeeAvailability(Base):
    __tablename__ = "employee_availability"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    employee_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        Enum("preferred", "unpreferred", "unavailable", name="availability_type_enum"),
        nullable=False,
    )
    # recurrence='none' → use day_of_week or specific_date (exactly one must be set).
    # recurrence in {weekdays, weekends, every_day} → day_of_week and specific_date are NULL.
    recurrence: Mapped[str] = mapped_column(
        Enum("none", "weekdays", "weekends", "every_day", name="availability_recurrence_enum"),
        nullable=False,
        default="none",
        server_default="none",
    )
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specific_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Minutes since midnight (matches scheduler convention — see CLAUDE.md JVM constraints).
    start_min: Mapped[int] = mapped_column(Integer, nullable=False)
    end_min: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
