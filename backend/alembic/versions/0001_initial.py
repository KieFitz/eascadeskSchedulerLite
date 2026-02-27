"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enum types — idempotent so a retry after a partial failure is safe
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE plan_enum AS ENUM ('free', 'paid');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE run_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Use raw SQL so SQLAlchemy's Enum machinery never fires a second CREATE TYPE
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          UUID         PRIMARY KEY,
            email       VARCHAR(255) NOT NULL UNIQUE,
            username    VARCHAR(100) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL,
            is_active   BOOLEAN      NOT NULL DEFAULT true,
            plan        plan_enum    NOT NULL DEFAULT 'free',
            stripe_customer_id      VARCHAR(255),
            stripe_subscription_id  VARCHAR(255),
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_email    ON users(email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_username ON users(username)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS schedule_runs (
            id              UUID             PRIMARY KEY,
            user_id         UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status          run_status_enum  NOT NULL DEFAULT 'pending',
            year            INTEGER          NOT NULL,
            month           INTEGER          NOT NULL,
            employees_data  JSON,
            shifts_data     JSON,
            result_data     JSON,
            score_info      VARCHAR(100),
            error_message   TEXT,
            created_at      TIMESTAMPTZ      NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_schedule_runs_user_id ON schedule_runs(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS schedule_runs")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TYPE IF EXISTS run_status_enum")
    op.execute("DROP TYPE IF EXISTS plan_enum")
