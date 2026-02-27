"""add country to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(10)")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS country")
