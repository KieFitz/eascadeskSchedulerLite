"""Clock event edit requests — manager proposes time correction, employee approves via WhatsApp

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-13
"""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE edit_request_status_enum AS ENUM ('pending', 'approved', 'rejected', 'cancelled')")

    op.execute("""
        CREATE TABLE IF NOT EXISTS clock_event_edit_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            clock_event_id UUID NOT NULL REFERENCES clock_events(id) ON DELETE CASCADE,
            proposed_event_at TIMESTAMPTZ NOT NULL,
            approval_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
            status edit_request_status_enum NOT NULL DEFAULT 'pending',
            requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved_at TIMESTAMPTZ
        )
    """)

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_clock_event_edit_requests_clock_event_id ON clock_event_edit_requests (clock_event_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_clock_event_edit_requests_approval_token ON clock_event_edit_requests (approval_token)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS clock_event_edit_requests")
    op.execute("DROP TYPE IF EXISTS edit_request_status_enum")
