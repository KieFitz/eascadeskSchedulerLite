"""add name, date_from, date_to, solving_started_at to schedule_runs

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE schedule_runs ADD COLUMN IF NOT EXISTS name VARCHAR(120)")
    op.execute("ALTER TABLE schedule_runs ADD COLUMN IF NOT EXISTS date_from DATE")
    op.execute("ALTER TABLE schedule_runs ADD COLUMN IF NOT EXISTS date_to DATE")
    op.execute("ALTER TABLE schedule_runs ADD COLUMN IF NOT EXISTS solving_started_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE schedule_runs DROP COLUMN IF EXISTS solving_started_at")
    op.execute("ALTER TABLE schedule_runs DROP COLUMN IF EXISTS date_to")
    op.execute("ALTER TABLE schedule_runs DROP COLUMN IF EXISTS date_from")
    op.execute("ALTER TABLE schedule_runs DROP COLUMN IF EXISTS name")
