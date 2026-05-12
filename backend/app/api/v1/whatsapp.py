"""
Twilio WhatsApp inbound webhook.

Public endpoint — no auth. Twilio calls this with a form-encoded POST for every
inbound WhatsApp message sent to TWILIO_WHATSAPP_FROM.

Conversation flow:
  Any message  →  Main Menu   [Fichar] [Schedule] [More]
  Fichar        →  Fichar Menu [Clock In] [Clock Out] [Break]
  Break         →  Break Menu  [Start Break] [End Break] [Back]
  More          →  More Menu   [Hours] [Availability] [Back]
  Hours         →  Hours Menu  [This Week] [This Month] [Back]

Button taps arrive as ButtonPayload; the IDs below are the canonical values.
"""

import datetime
import uuid
from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import select
from twilio.request_validator import RequestValidator
from twilio.rest import Client

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.clock_event import ClockEvent
from app.models.employee import Employee
from app.models.shift_assignment import ShiftAssignment
from app.models.whatsapp_session import WhatsAppSession

router = APIRouter()

# ── Button payload IDs ────────────────────────────────────────────────────────
# These must match the `id` field set when creating the Content templates.
BTN_FICHAR = "fichar"
BTN_SCHEDULE = "schedule"
BTN_MORE = "more"
BTN_CLOCK_IN = "clock_in"
BTN_CLOCK_OUT = "clock_out"
BTN_BREAK = "break"
BTN_BREAK_START = "break_start"
BTN_BREAK_END = "break_end"
BTN_HOURS = "hours"
BTN_AVAILABILITY = "availability"
BTN_HOURS_WEEK = "hours_week"
BTN_HOURS_MONTH = "hours_month"
BTN_BACK = "back"

SESSION_TTL_MINUTES = 30


# ── Twilio helpers ────────────────────────────────────────────────────────────

def _twilio_client() -> Client:
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def _send_text(to: str, body: str) -> None:
    _twilio_client().messages.create(
        from_=settings.TWILIO_WHATSAPP_FROM,
        to=to,
        body=body,
    )


def _send_template(to: str, content_sid: str, variables: dict[str, str] | None = None) -> None:
    kwargs: dict[str, Any] = {
        "from_": settings.TWILIO_WHATSAPP_FROM,
        "to": to,
        "content_sid": content_sid,
    }
    if variables:
        import json
        kwargs["content_variables"] = json.dumps(variables)
    _twilio_client().messages.create(**kwargs)


# ── Menu senders ──────────────────────────────────────────────────────────────

def _send_main_menu(to: str, name: str) -> None:
    if settings.TWILIO_TMPL_MAIN_MENU:
        _send_template(to, settings.TWILIO_TMPL_MAIN_MENU, {"1": name})
    else:
        _send_text(to, f"Hi {name}! Reply:\n1. Fichar (clock in/out)\n2. Schedule\n3. More")


def _send_fichar_menu(to: str) -> None:
    if settings.TWILIO_TMPL_FICHAR_MENU:
        _send_template(to, settings.TWILIO_TMPL_FICHAR_MENU)
    else:
        _send_text(to, "Clock in/out or take a break?\nReply: IN, OUT, or BREAK")


def _send_break_menu(to: str) -> None:
    if settings.TWILIO_TMPL_BREAK_MENU:
        _send_template(to, settings.TWILIO_TMPL_BREAK_MENU)
    else:
        _send_text(to, "Break action?\nReply: START BREAK, END BREAK, or BACK")


def _send_more_menu(to: str) -> None:
    if settings.TWILIO_TMPL_MORE_MENU:
        _send_template(to, settings.TWILIO_TMPL_MORE_MENU)
    else:
        _send_text(to, "More options:\nReply: HOURS, AVAILABILITY, or BACK")


def _send_hours_menu(to: str) -> None:
    if settings.TWILIO_TMPL_HOURS_MENU:
        _send_template(to, settings.TWILIO_TMPL_HOURS_MENU)
    else:
        _send_text(to, "Which period?\nReply: WEEK, MONTH, or BACK")


# ── Session helpers ───────────────────────────────────────────────────────────

async def _get_or_create_session(db, employee_id: str) -> WhatsAppSession:
    result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.employee_id == employee_id)
    )
    session = result.scalar_one_or_none()

    now = datetime.datetime.now(datetime.timezone.utc)

    if session is None:
        session = WhatsAppSession(
            id=str(uuid.uuid4()),
            employee_id=employee_id,
            state="main_menu",
            updated_at=now,
        )
        db.add(session)
        await db.flush()
        return session

    # Reset stale sessions to main_menu
    if session.updated_at.tzinfo is None:
        age = (now - session.updated_at.replace(tzinfo=datetime.timezone.utc)).total_seconds()
    else:
        age = (now - session.updated_at).total_seconds()

    if age > SESSION_TTL_MINUTES * 60:
        session.state = "main_menu"

    session.updated_at = now
    return session


# ── Clock-event writer ────────────────────────────────────────────────────────

async def _write_clock_event(db, employee_id: str, event_type: str, raw: dict) -> None:
    event = ClockEvent(
        id=str(uuid.uuid4()),
        employee_id=employee_id,
        event_type=event_type,
        event_at=datetime.datetime.now(datetime.timezone.utc),
        source="whatsapp",
        raw_payload=raw,
    )
    db.add(event)


# ── Feature handlers ──────────────────────────────────────────────────────────

async def _handle_clock(payload: str, db, employee: Employee, session: WhatsAppSession, raw: dict, to: str) -> None:
    if payload == BTN_CLOCK_IN:
        await _write_clock_event(db, employee.id, "in", raw)
        _send_text(to, f"Clocked in at {datetime.datetime.now(datetime.timezone.utc).strftime('%H:%M')}. Have a great shift, {employee.name}!")
        session.state = "main_menu"
    elif payload == BTN_CLOCK_OUT:
        await _write_clock_event(db, employee.id, "out", raw)
        _send_text(to, f"Clocked out at {datetime.datetime.now(datetime.timezone.utc).strftime('%H:%M')}. See you next time, {employee.name}!")
        session.state = "main_menu"
    elif payload == BTN_BREAK:
        _send_break_menu(to)
        session.state = "break"
    else:
        _send_fichar_menu(to)


async def _handle_break(payload: str, db, employee: Employee, session: WhatsAppSession, raw: dict, to: str) -> None:
    if payload == BTN_BREAK_START:
        await _write_clock_event(db, employee.id, "break_start", raw)
        _send_text(to, f"Break started at {datetime.datetime.now(datetime.timezone.utc).strftime('%H:%M')}. Enjoy!")
        session.state = "main_menu"
    elif payload == BTN_BREAK_END:
        await _write_clock_event(db, employee.id, "break_end", raw)
        _send_text(to, f"Break ended at {datetime.datetime.now(datetime.timezone.utc).strftime('%H:%M')}. Back to it!")
        session.state = "main_menu"
    elif payload == BTN_BACK:
        _send_fichar_menu(to)
        session.state = "fichar"
    else:
        _send_break_menu(to)


async def _handle_schedule(db, employee: Employee, to: str) -> None:
    today = datetime.date.today()
    result = await db.execute(
        select(ShiftAssignment)
        .where(ShiftAssignment.employee_id == employee.id, ShiftAssignment.date >= today)
        .order_by(ShiftAssignment.date, ShiftAssignment.start_min)
        .limit(5)
    )
    assignments = result.scalars().all()

    if not assignments:
        _send_text(to, "You have no upcoming shifts scheduled.")
        return

    lines = ["Your next shifts:"]
    for a in assignments:
        start_h, start_m = divmod(a.start_min, 60)
        end_h, end_m = divmod(a.end_min, 60)
        lines.append(f"• {a.date.strftime('%a %d %b')}  {start_h:02d}:{start_m:02d}–{end_h:02d}:{end_m:02d}")
    _send_text(to, "\n".join(lines))


async def _handle_hours(payload: str, db, employee: Employee, session: WhatsAppSession, to: str) -> None:
    now = datetime.datetime.now(datetime.timezone.utc)

    if payload == BTN_HOURS_WEEK:
        # Monday of the current week
        monday = now.date() - datetime.timedelta(days=now.weekday())
        period_start = datetime.datetime(monday.year, monday.month, monday.day, tzinfo=datetime.timezone.utc)
        label = "this week"
    elif payload == BTN_HOURS_MONTH:
        period_start = datetime.datetime(now.year, now.month, 1, tzinfo=datetime.timezone.utc)
        label = "this month"
    elif payload == BTN_BACK:
        _send_more_menu(to)
        session.state = "more"
        return
    else:
        _send_hours_menu(to)
        return

    result = await db.execute(
        select(ClockEvent)
        .where(
            ClockEvent.employee_id == employee.id,
            ClockEvent.event_type.in_(["in", "out"]),
            ClockEvent.event_at >= period_start,
        )
        .order_by(ClockEvent.event_at)
    )
    events = result.scalars().all()

    total_seconds = 0
    last_in: datetime.datetime | None = None
    for ev in events:
        if ev.event_type == "in":
            last_in = ev.event_at
        elif ev.event_type == "out" and last_in is not None:
            total_seconds += (ev.event_at - last_in).total_seconds()
            last_in = None

    total_hours = int(total_seconds // 3600)
    total_mins = int((total_seconds % 3600) // 60)
    _send_text(to, f"You've worked {total_hours}h {total_mins}m {label}, {employee.name}.")
    session.state = "main_menu"


# ── Main webhook ──────────────────────────────────────────────────────────────

@router.post("/webhook")
async def whatsapp_webhook(request: Request) -> Response:
    form = await request.form()
    form_dict = dict(form)

    # Validate Twilio signature in production (skip when auth token not configured)
    if settings.TWILIO_AUTH_TOKEN:
        validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
        signature = request.headers.get("X-Twilio-Signature", "")
        url = str(request.url)
        if not validator.validate(url, form_dict, signature):
            return Response(content="Forbidden", status_code=403)

    from_field: str = form_dict.get("From", "")
    phone = from_field.replace("whatsapp:", "")
    button_payload: str = form_dict.get("ButtonPayload", "").strip().lower()
    body_text: str = form_dict.get("Body", "").strip().upper()

    async with AsyncSessionLocal() as db:
        # Look up active employee by phone
        result = await db.execute(
            select(Employee).where(Employee.phone == phone, Employee.is_active == True)  # noqa: E712
        )
        employee = result.scalar_one_or_none()

        if not employee:
            _send_text(from_field, "Your number is not registered. Contact your manager.")
            return Response(status_code=204)

        session = await _get_or_create_session(db, employee.id)

        # ── Route: button payload takes priority, then free-text shorthand ──
        effective = button_payload or _text_to_payload(body_text, session.state)
        state = session.state

        if effective == BTN_FICHAR:
            _send_fichar_menu(from_field)
            session.state = "fichar"

        elif effective == BTN_SCHEDULE:
            await _handle_schedule(db, employee, from_field)
            session.state = "main_menu"

        elif effective == BTN_MORE:
            _send_more_menu(from_field)
            session.state = "more"

        elif effective == BTN_BREAK and state != "break":
            # "Break" button inside Fichar menu — open the break sub-menu
            _send_break_menu(from_field)
            session.state = "break"

        elif effective == BTN_HOURS:
            _send_hours_menu(from_field)
            session.state = "hours"

        elif state == "fichar":
            await _handle_clock(effective, db, employee, session, form_dict, from_field)

        elif state == "break":
            await _handle_break(effective, db, employee, session, form_dict, from_field)

        elif state == "more":
            if effective == BTN_AVAILABILITY:
                _send_text(from_field, "Availability management via WhatsApp is coming soon. Visit the app to update your availability.")
                session.state = "main_menu"
            elif effective == BTN_BACK:
                _send_main_menu(from_field, employee.name)
                session.state = "main_menu"
            else:
                _send_more_menu(from_field)

        elif state == "hours":
            await _handle_hours(effective, db, employee, session, from_field)

        else:
            # First contact, "hi", "menu", or anything unrecognised → main menu
            _send_main_menu(from_field, employee.name)
            session.state = "main_menu"

        await db.commit()

    return Response(status_code=204)


def _text_to_payload(text: str, state: str) -> str:
    """Map common free-text shorthands to button payload IDs."""
    mapping = {
        "IN": BTN_CLOCK_IN,
        "OUT": BTN_CLOCK_OUT,
        "BREAK": BTN_BREAK,
        "START BREAK": BTN_BREAK_START,
        "END BREAK": BTN_BREAK_END,
        "SCHEDULE": BTN_SCHEDULE,
        "HOURS": BTN_HOURS,
        "WEEK": BTN_HOURS_WEEK,
        "THIS WEEK": BTN_HOURS_WEEK,
        "MONTH": BTN_HOURS_MONTH,
        "THIS MONTH": BTN_HOURS_MONTH,
        "MORE": BTN_MORE,
        "BACK": BTN_BACK,
        "FICHAR": BTN_FICHAR,
        "AVAILABILITY": BTN_AVAILABILITY,
        "1": BTN_FICHAR,
        "2": BTN_SCHEDULE,
        "3": BTN_MORE,
    }
    return mapping.get(text, "")
