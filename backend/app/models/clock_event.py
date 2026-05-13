import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ClockEvent(Base):
    __tablename__ = "clock_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    employee_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_assignment_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("shift_assignments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        Enum("in", "out", "break_start", "break_end", name="clock_event_type_enum"), nullable=False
    )
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str] = mapped_column(
        Enum("whatsapp", "manual", "auto", name="clock_event_source_enum"),
        nullable=False,
        default="whatsapp",
        server_default="whatsapp",
    )
    # True when event_at was inferred from the scheduled shift time, not an actual clock action.
    # Managers should review and correct these.
    is_estimated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Soft delete — Spanish digital clocking compliance requires audit trail, never hard delete
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    delete_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class ClockEventAuditLog(Base):
    """Immutable record of every create, edit, or delete on a clock event.

    Required for Spanish digital clocking compliance (Real Decreto-ley 8/2019):
    any correction must be traceable to a manager with a timestamp.
    """
    __tablename__ = "clock_event_audit_log"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    clock_event_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        # No FK cascade — keep log rows even if the clock event is later purged
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(
        Enum("create", "edit", "delete", name="audit_action_enum"), nullable=False
    )
    actor_user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # "system" when the action was triggered by APScheduler (auto clock-out)
    actor_label: Mapped[str] = mapped_column(String(100), nullable=False, default="system")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Snapshot of the event fields at the time of the action
    snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
