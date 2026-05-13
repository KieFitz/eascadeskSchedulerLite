"""Clock event audit log + soft delete for Spanish digital clocking compliance

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-13

Spanish Real Decreto-ley 8/2019 requires that all corrections to clocking records
are traceable to a manager with a timestamp. This migration:
  - Adds soft-delete columns to clock_events (deleted_at, deleted_by_user_id, delete_reason)
  - Creates clock_event_audit_log table for immutable event history
"""

from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Soft delete columns on clock_events
    op.execute(
        "ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS delete_reason TEXT"
    )

    # Audit action enum
    op.execute("CREATE TYPE audit_action_enum AS ENUM ('create', 'edit', 'delete')")

    # Immutable audit log table
    op.execute("""
        CREATE TABLE IF NOT EXISTS clock_event_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            clock_event_id UUID NOT NULL,
            action audit_action_enum NOT NULL,
            actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_label VARCHAR(100) NOT NULL DEFAULT 'system',
            reason TEXT,
            snapshot JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_clock_event_audit_log_clock_event_id ON clock_event_audit_log (clock_event_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS clock_event_audit_log")
    op.execute("DROP TYPE IF EXISTS audit_action_enum")
    op.execute("ALTER TABLE clock_events DROP COLUMN IF EXISTS delete_reason")
    op.execute("ALTER TABLE clock_events DROP COLUMN IF EXISTS deleted_by_user_id")
    op.execute("ALTER TABLE clock_events DROP COLUMN IF EXISTS deleted_at")
