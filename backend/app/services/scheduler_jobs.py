"""
APScheduler background jobs for shift-linked clock event automation.

Two jobs run every minute inside the FastAPI process:

1. check_missed_clockins  — fires a WhatsApp reminder 5 min after a shift starts
                            if the employee has not clocked in.
2. check_missed_clockouts — 60 min after a shift ends with no clock-out, creates a
                            synthetic "out" event (source="auto", is_estimated=True)
                            and notifies the employee.
"""

import datetime
import uuid

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.api.v1.whatsapp import STRINGS, _send_text, _t, _to_local, _tz
from app.core.database import AsyncSessionLocal
from app.models.clock_event import ClockEvent, ClockEventAuditLog
from app.models.employee import Employee
from app.models.shift_assignment import ShiftAssignment
from app.models.user import User
from app.models.whatsapp_session import WhatsAppSession

_scheduler = AsyncIOScheduler()

REMINDER_DELAY_MIN = 5     # send reminder this many minutes after shift start
AUTO_CLOSE_GRACE_MIN = 60  # auto-close this many minutes after shift end


def _employee_tz(user: User | None) -> str | None:
    return user.timezone if user else None


def _lang_for(session: WhatsAppSession | None) -> str:
    return session.language if session else "en"


def _shift_start_utc(sa: ShiftAssignment, tz_name: str | None) -> datetime.datetime:
    tz = _tz(tz_name)
    midnight_local = datetime.datetime(sa.date.year, sa.date.month, sa.date.day, tzinfo=tz)
    return (midnight_local + datetime.timedelta(minutes=sa.start_min)).astimezone(datetime.timezone.utc)


def _shift_end_utc(sa: ShiftAssignment, tz_name: str | None) -> datetime.datetime:
    tz = _tz(tz_name)
    midnight_local = datetime.datetime(sa.date.year, sa.date.month, sa.date.day, tzinfo=tz)
    return (midnight_local + datetime.timedelta(minutes=sa.end_min)).astimezone(datetime.timezone.utc)


async def check_missed_clockins() -> None:
    """
    Find shifts that started between REMINDER_DELAY_MIN and REMINDER_DELAY_MIN+1 minutes ago
    where no clock-in event exists and no reminder has been sent yet. Send a WhatsApp reminder.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    async with AsyncSessionLocal() as db:
        # Load all active employees with their user (for timezone)
        emp_result = await db.execute(
            select(Employee).where(Employee.is_active == True)  # noqa: E712
        )
        employees = emp_result.scalars().all()

        for employee in employees:
            user = await db.get(User, employee.user_id)
            tz_name = _employee_tz(user)

            # Find today's shifts for this employee that haven't had a reminder sent
            local_today = datetime.datetime.now(_tz(tz_name)).date()
            sa_result = await db.execute(
                select(ShiftAssignment).where(
                    ShiftAssignment.employee_id == employee.id,
                    ShiftAssignment.date == local_today,
                    ShiftAssignment.reminder_sent_at == None,  # noqa: E711
                )
            )
            assignments = sa_result.scalars().all()

            for sa in assignments:
                start_utc = _shift_start_utc(sa, tz_name)
                elapsed = (now - start_utc).total_seconds() / 60

                # Only act in the [REMINDER_DELAY_MIN, REMINDER_DELAY_MIN+1) window
                if not (REMINDER_DELAY_MIN <= elapsed < REMINDER_DELAY_MIN + 1):
                    continue

                # Check if employee already has a clock-in event for this shift today
                ci_result = await db.execute(
                    select(ClockEvent).where(
                        ClockEvent.employee_id == employee.id,
                        ClockEvent.event_type == "in",
                        ClockEvent.event_at >= start_utc - datetime.timedelta(minutes=30),
                    ).limit(1)
                )
                if ci_result.scalar_one_or_none():
                    continue  # already clocked in

                # Look up language preference
                sess_result = await db.execute(
                    select(WhatsAppSession).where(WhatsAppSession.employee_id == employee.id)
                )
                wa_session = sess_result.scalar_one_or_none()
                lang = _lang_for(wa_session)

                # Format shift start in employee's local timezone
                start_local = _to_local(start_utc, tz_name)
                time_str = start_local.strftime("%H:%M")

                to = f"whatsapp:{employee.phone}"
                _send_text(to, _t(lang, "reminder_clockin", time=time_str))

                sa.reminder_sent_at = now
                await db.commit()


async def check_missed_clockouts() -> None:
    """
    Find shifts that ended more than AUTO_CLOSE_GRACE_MIN minutes ago where:
    - a clock-in event exists (employee actually started the shift)
    - no clock-out event exists
    Create a synthetic "out" event at the scheduled shift end time and notify the employee.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    async with AsyncSessionLocal() as db:
        emp_result = await db.execute(
            select(Employee).where(Employee.is_active == True)  # noqa: E712
        )
        employees = emp_result.scalars().all()

        for employee in employees:
            user = await db.get(User, employee.user_id)
            tz_name = _employee_tz(user)

            local_today = datetime.datetime.now(_tz(tz_name)).date()
            # Also check yesterday in case shift ended after midnight
            local_yesterday = local_today - datetime.timedelta(days=1)

            for check_date in (local_today, local_yesterday):
                sa_result = await db.execute(
                    select(ShiftAssignment).where(
                        ShiftAssignment.employee_id == employee.id,
                        ShiftAssignment.date == check_date,
                    )
                )
                assignments = sa_result.scalars().all()

                for sa in assignments:
                    end_utc = _shift_end_utc(sa, tz_name)
                    elapsed_after_end = (now - end_utc).total_seconds() / 60

                    # Only act once the grace period has passed
                    if elapsed_after_end < AUTO_CLOSE_GRACE_MIN:
                        continue

                    start_utc = _shift_start_utc(sa, tz_name)

                    # Check for an existing clock-in after shift start (±30 min)
                    ci_result = await db.execute(
                        select(ClockEvent).where(
                            ClockEvent.employee_id == employee.id,
                            ClockEvent.event_type == "in",
                            ClockEvent.event_at >= start_utc - datetime.timedelta(minutes=30),
                            ClockEvent.event_at <= end_utc + datetime.timedelta(minutes=AUTO_CLOSE_GRACE_MIN),
                        ).limit(1)
                    )
                    if not ci_result.scalar_one_or_none():
                        continue  # never clocked in — nothing to auto-close

                    # Check if a clock-out already exists after the clock-in
                    co_result = await db.execute(
                        select(ClockEvent).where(
                            ClockEvent.employee_id == employee.id,
                            ClockEvent.event_type == "out",
                            ClockEvent.event_at >= start_utc - datetime.timedelta(minutes=30),
                        ).limit(1)
                    )
                    if co_result.scalar_one_or_none():
                        continue  # already clocked out (or already auto-closed)

                    # Create synthetic clock-out at scheduled shift end
                    sess_result = await db.execute(
                        select(WhatsAppSession).where(WhatsAppSession.employee_id == employee.id)
                    )
                    wa_session = sess_result.scalar_one_or_none()
                    lang = _lang_for(wa_session)

                    end_local = _to_local(end_utc, tz_name)
                    time_str = end_local.strftime("%H:%M")

                    auto_event = ClockEvent(
                        id=str(uuid.uuid4()),
                        employee_id=employee.id,
                        shift_assignment_id=sa.id,
                        event_type="out",
                        event_at=end_utc,
                        source="auto",
                        is_estimated=True,
                        raw_payload=None,
                    )
                    db.add(auto_event)
                    await db.flush()

                    audit = ClockEventAuditLog(
                        clock_event_id=auto_event.id,
                        action="create",
                        actor_user_id=None,
                        actor_label="system",
                        reason="Auto clock-out: no clock-out recorded within grace period after shift end",
                        snapshot={
                            "employee_id":         employee.id,
                            "shift_assignment_id": sa.id,
                            "event_type":          "out",
                            "event_at":            end_utc.isoformat(),
                            "source":              "auto",
                            "is_estimated":        True,
                        },
                    )
                    db.add(audit)

                    to = f"whatsapp:{employee.phone}"
                    _send_text(to, _t(lang, "auto_clockout", time=time_str))

                    await db.commit()


def start_scheduler() -> None:
    _scheduler.add_job(check_missed_clockins, "interval", minutes=1, id="missed_clockins", replace_existing=True)
    _scheduler.add_job(check_missed_clockouts, "interval", minutes=1, id="missed_clockouts", replace_existing=True)
    _scheduler.start()


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
