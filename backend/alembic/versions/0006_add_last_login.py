"""add last_login_at to users

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-18

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS last_login_at")
