"""pro plan: persistent employees, availability, shifts, assignments, clock events

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-04

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE availability_type_enum AS ENUM ('preferred', 'unpreferred', 'unavailable');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE clock_event_type_enum AS ENUM ('in', 'out');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE clock_event_source_enum AS ENUM ('whatsapp', 'manual');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id              UUID          PRIMARY KEY,
            user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name            VARCHAR(120)  NOT NULL,
            phone           VARCHAR(20)   NOT NULL UNIQUE,
            skills          JSON          NOT NULL DEFAULT '[]',
            min_hours_week  INTEGER       NOT NULL DEFAULT 0,
            cost_per_hour   DOUBLE PRECISION NOT NULL DEFAULT 0,
            is_active       BOOLEAN       NOT NULL DEFAULT true,
            created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_employees_user_id ON employees(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_employees_phone   ON employees(phone)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS employee_availability (
            id              UUID                    PRIMARY KEY,
            employee_id     UUID                    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            type            availability_type_enum  NOT NULL,
            day_of_week     INTEGER,
            specific_date   DATE,
            start_min       INTEGER                 NOT NULL,
            end_min         INTEGER                 NOT NULL,
            created_at      TIMESTAMPTZ             NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_availability_employee_id ON employee_availability(employee_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS shift_definitions (
            id                UUID         PRIMARY KEY,
            user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            schedule_run_id   UUID         REFERENCES schedule_runs(id) ON DELETE SET NULL,
            date              DATE         NOT NULL,
            start_min         INTEGER      NOT NULL,
            end_min           INTEGER      NOT NULL,
            required_skills   JSON         NOT NULL DEFAULT '[]',
            min_staff         INTEGER      NOT NULL DEFAULT 1,
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_definitions_user_id ON shift_definitions(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_definitions_run_id  ON shift_definitions(schedule_run_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_definitions_date    ON shift_definitions(date)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS shift_assignments (
            id                    UUID         PRIMARY KEY,
            schedule_run_id       UUID         NOT NULL REFERENCES schedule_runs(id) ON DELETE CASCADE,
            employee_id           UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            shift_definition_id   UUID         REFERENCES shift_definitions(id) ON DELETE SET NULL,
            date                  DATE         NOT NULL,
            start_min             INTEGER      NOT NULL,
            end_min               INTEGER      NOT NULL,
            created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_assignments_run_id      ON shift_assignments(schedule_run_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_assignments_employee_id ON shift_assignments(employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_assignments_date        ON shift_assignments(date)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS clock_events (
            id                    UUID                       PRIMARY KEY,
            employee_id           UUID                       NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            shift_assignment_id   UUID                       REFERENCES shift_assignments(id) ON DELETE SET NULL,
            event_type            clock_event_type_enum      NOT NULL,
            event_at              TIMESTAMPTZ                NOT NULL,
            source                clock_event_source_enum    NOT NULL DEFAULT 'whatsapp',
            raw_payload           JSON,
            created_at            TIMESTAMPTZ                NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_clock_events_employee_id          ON clock_events(employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_clock_events_shift_assignment_id  ON clock_events(shift_assignment_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_clock_events_event_at             ON clock_events(event_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS clock_events")
    op.execute("DROP TABLE IF EXISTS shift_assignments")
    op.execute("DROP TABLE IF EXISTS shift_definitions")
    op.execute("DROP TABLE IF EXISTS employee_availability")
    op.execute("DROP TABLE IF EXISTS employees")
    op.execute("DROP TYPE IF EXISTS clock_event_source_enum")
    op.execute("DROP TYPE IF EXISTS clock_event_type_enum")
    op.execute("DROP TYPE IF EXISTS availability_type_enum")
