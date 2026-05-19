"""Add optional NIF column to employees table

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-19

NIF is an optional national identification number (string, to support alphanumeric
formats). Required for Spanish labour-law compliance when generating clock-event reports.
"""

from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("nif", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("employees", "nif")
