"""whatsapp bot: sessions table + extend clock_event_type_enum with break events

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend clock_event_type_enum — ADD VALUE is transactional in Postgres 12+
    # but must be outside a transaction block; op.execute handles this.
    op.execute("ALTER TYPE clock_event_type_enum ADD VALUE IF NOT EXISTS 'break_start'")
    op.execute("ALTER TYPE clock_event_type_enum ADD VALUE IF NOT EXISTS 'break_end'")

    op.execute("""
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id           UUID         PRIMARY KEY,
            employee_id  UUID         NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
            state        VARCHAR(40)  NOT NULL DEFAULT 'main_menu',
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_whatsapp_sessions_employee_id ON whatsapp_sessions(employee_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS whatsapp_sessions")
    # Postgres does not support removing enum values; downgrade leaves the enum as-is.
