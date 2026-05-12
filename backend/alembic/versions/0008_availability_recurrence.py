"""employee_availability: add recurrence column

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'availability_recurrence_enum'
            ) THEN
                CREATE TYPE availability_recurrence_enum
                    AS ENUM ('none', 'weekdays', 'weekends', 'every_day');
            END IF;
        END$$;
    """)

    op.execute("""
        ALTER TABLE employee_availability
            ADD COLUMN IF NOT EXISTS recurrence availability_recurrence_enum
                NOT NULL DEFAULT 'none';
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE employee_availability DROP COLUMN IF EXISTS recurrence;")
    op.execute("DROP TYPE IF EXISTS availability_recurrence_enum;")
