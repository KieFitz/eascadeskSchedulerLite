"""shift-linked clock events: is_estimated, reminder_sent_at, auto source

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-13
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE clock_event_source_enum ADD VALUE IF NOT EXISTS 'auto'")
    op.execute(
        "ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE shift_assignments DROP COLUMN IF EXISTS reminder_sent_at")
    op.execute("ALTER TABLE clock_events DROP COLUMN IF EXISTS is_estimated")
    # Postgres cannot remove enum values; leave clock_event_source_enum as-is
