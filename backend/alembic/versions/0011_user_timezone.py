"""users: add timezone column

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-12
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50)")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS timezone")
