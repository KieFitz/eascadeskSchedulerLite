"""Make employee phone optional (WhatsApp bot is opt-in)

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-29
"""

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Phone is only needed for the WhatsApp clock in/out bot. Drop NOT NULL.
    # The UNIQUE constraint stays — Postgres allows multiple NULLs under it.
    op.execute("ALTER TABLE employees ALTER COLUMN phone DROP NOT NULL")


def downgrade() -> None:
    # Rows with a NULL phone must be backfilled before re-applying NOT NULL.
    op.execute("ALTER TABLE employees ALTER COLUMN phone SET NOT NULL")
