"""Widen whatsapp_sessions.state from VARCHAR(40) to VARCHAR(100)

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-13

edit_confirm_{uuid} states are 49 characters, exceeding the old VARCHAR(40) limit.
"""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE whatsapp_sessions ALTER COLUMN state TYPE VARCHAR(100)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE whatsapp_sessions ALTER COLUMN state TYPE VARCHAR(40)"
    )
