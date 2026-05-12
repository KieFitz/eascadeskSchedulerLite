"""whatsapp_sessions: add language column for en/es support

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-12
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS language VARCHAR(2) NOT NULL DEFAULT 'en'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS language")
