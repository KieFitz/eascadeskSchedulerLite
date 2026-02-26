"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE plan_enum AS ENUM ('free', 'paid')")
    op.execute("CREATE TYPE run_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed')")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "plan",
            sa.Enum("free", "paid", name="plan_enum", create_type=False),
            nullable=False,
            server_default="free",
        ),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "schedule_runs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "processing", "completed", "failed", name="run_status_enum", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("employees_data", postgresql.JSON(), nullable=True),
        sa.Column("shifts_data", postgresql.JSON(), nullable=True),
        sa.Column("result_data", postgresql.JSON(), nullable=True),
        sa.Column("score_info", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_schedule_runs_user_id", "schedule_runs", ["user_id"])


def downgrade() -> None:
    op.drop_table("schedule_runs")
    op.drop_table("users")
    op.execute("DROP TYPE run_status_enum")
    op.execute("DROP TYPE plan_enum")
