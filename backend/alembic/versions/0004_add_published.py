"""add is_published to schedule_runs

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE schedule_runs ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE schedule_runs ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE schedule_runs DROP COLUMN IF EXISTS published_at")
    op.execute("ALTER TABLE schedule_runs DROP COLUMN IF EXISTS is_published")
