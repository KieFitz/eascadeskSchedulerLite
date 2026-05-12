"""
Twilio WhatsApp inbound webhook.

Public endpoint — no auth. Twilio calls this with a form-encoded POST for every
inbound WhatsApp message sent to TWILIO_WHATSAPP_FROM.

Conversation flow:
  Any message  →  Main Menu   [Fichar | Schedule | More]
  Fichar        →  Fichar Menu [Clock In | Clock Out | Break]
  Break         →  Break Menu  [Start Break | End Break | Back]
  More          →  More Menu   [Hours | Availability | Back]
  Hours         →  Hours Menu  [This Week | This Month | Back]

Shortcuts (bypass menus entirely):
  "in"  → clock in immediately (guard: warns if already clocked in)
  "out" → clock out immediately (guard: warns if not clocked in)

Language support:
  Default language is English. Detected from Spanish trigger words ("hola", etc.)
  or explicit keywords "english"/"español". Stored per-session in DB.
"""

import datetime
import uuid

import httpx
from fastapi import APIRouter, Request, Response
from sqlalchemy import select
from twilio.request_validator import RequestValidator

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.clock_event import ClockEvent
from app.models.employee import Employee
from app.models.shift_assignment import ShiftAssignment
from app.models.whatsapp_session import WhatsAppSession

router = APIRouter()

# ── Internal routing IDs ──────────────────────────────────────────────────────
ID_FICHAR = "fichar"
ID_SCHEDULE = "schedule"
ID_MORE = "more"
ID_CLOCK_IN = "clock_in"
ID_CLOCK_OUT = "clock_out"
ID_BREAK = "break"
ID_BREAK_START = "break_start"
ID_BREAK_END = "break_end"
ID_HOURS = "hours"
ID_AVAILABILITY = "availability"
ID_HOURS_WEEK = "hours_week"
ID_HOURS_MONTH = "hours_month"
ID_BACK = "back"

SESSION_TTL_MINUTES = 30

# ── Localised strings ─────────────────────────────────────────────────────────
STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "not_registered": "Your number is not registered. Contact your manager.",
        "clocked_in": "Clocked in at {time}. Have a great shift, {name}!",
        "already_clocked_in": "You appear to already be clocked in since {time}. Did you mean to clock out? Reply *yes* or *no*.",
        "clocked_out": "Clocked out at {time}. See you next time, {name}!",
        "not_clocked_in": "You don't appear to be clocked in. Would you like to clock in instead? Reply *yes* or *no*.",
        "break_started": "Break started at {time}. Enjoy!",
        "break_ended": "Break ended at {time}. Back to it!",
        "no_shifts": "You have no upcoming shifts scheduled.",
        "shifts_header": "Your next shifts:",
        "hours_worked": "You've worked {hours}h {mins}m {period}, {name}.",
        "this_week": "this week",
        "this_month": "this month",
        "availability_soon": "Availability management via WhatsApp is coming soon. Visit the app to update your availability.",
        "lang_switch_hint": "_Escribe *hola* para español_",
        "main_menu_body": "Hi {name}! What would you like to do?",
        "main_menu_btn": "View options",
        "fichar_body": "What would you like to do?",
        "fichar_btn": "Select",
        "break_body": "Break options:",
        "break_btn": "Select",
        "more_body": "More options:",
        "more_btn": "Select",
        "hours_body": "Which period?",
        "hours_btn": "Select",
        "opt_fichar": "Fichar",
        "opt_fichar_desc": "Clock in, clock out or break",
        "opt_schedule": "Schedule",
        "opt_schedule_desc": "View your upcoming shifts",
        "opt_more": "More",
        "opt_more_desc": "Hours worked & availability",
        "opt_clock_in": "Clock In",
        "opt_clock_in_desc": "Start your shift",
        "opt_clock_out": "Clock Out",
        "opt_clock_out_desc": "End your shift",
        "opt_break": "Break",
        "opt_break_desc": "Manage a break",
        "opt_start_break": "Start Break",
        "opt_start_break_desc": "Begin your break",
        "opt_end_break": "End Break",
        "opt_end_break_desc": "Finish your break",
        "opt_back": "Back",
        "opt_back_desc": "Return to previous menu",
        "opt_hours": "Hours",
        "opt_hours_desc": "See hours worked",
        "opt_availability": "Availability",
        "opt_availability_desc": "Update your availability",
        "opt_this_week": "This Week",
        "opt_this_week_desc": "Hours worked since Monday",
        "opt_this_month": "This Month",
        "opt_this_month_desc": "Hours worked this month",
        "confirm_yes": "yes",
        "confirm_no": "no",
        "cancelled": "OK, no changes made.",
    },
    "es": {
        "not_registered": "Tu número no está registrado. Contacta con tu responsable.",
        "clocked_in": "Fichaje de entrada a las {time}. ¡Que tengas un buen turno, {name}!",
        "already_clocked_in": "Parece que ya fichaste entrada a las {time}. ¿Querías fichar salida? Responde *sí* o *no*.",
        "clocked_out": "Fichaje de salida a las {time}. ¡Hasta pronto, {name}!",
        "not_clocked_in": "No parece que hayas fichado entrada. ¿Quieres fichar entrada ahora? Responde *sí* o *no*.",
        "break_started": "Descanso iniciado a las {time}. ¡Disfruta!",
        "break_ended": "Descanso terminado a las {time}. ¡De vuelta al trabajo!",
        "no_shifts": "No tienes turnos próximos programados.",
        "shifts_header": "Tus próximos turnos:",
        "hours_worked": "Has trabajado {hours}h {mins}m {period}, {name}.",
        "this_week": "esta semana",
        "this_month": "este mes",
        "availability_soon": "La gestión de disponibilidad por WhatsApp estará disponible pronto. Visita la app para actualizar tu disponibilidad.",
        "lang_switch_hint": "_Type *hi* for English_",
        "main_menu_body": "¡Hola {name}! ¿Qué quieres hacer?",
        "main_menu_btn": "Ver opciones",
        "fichar_body": "¿Qué quieres hacer?",
        "fichar_btn": "Seleccionar",
        "break_body": "Opciones de descanso:",
        "break_btn": "Seleccionar",
        "more_body": "Más opciones:",
        "more_btn": "Seleccionar",
        "hours_body": "¿Qué período?",
        "hours_btn": "Seleccionar",
        "opt_fichar": "Fichar",
        "opt_fichar_desc": "Entrada, salida o descanso",
        "opt_schedule": "Horario",
        "opt_schedule_desc": "Ver tus próximos turnos",
        "opt_more": "Más",
        "opt_more_desc": "Horas trabajadas y disponibilidad",
        "opt_clock_in": "Entrada",
        "opt_clock_in_desc": "Iniciar turno",
        "opt_clock_out": "Salida",
        "opt_clock_out_desc": "Finalizar turno",
        "opt_break": "Descanso",
        "opt_break_desc": "Gestionar descanso",
        "opt_start_break": "Iniciar Descanso",
        "opt_start_break_desc": "Comenzar el descanso",
        "opt_end_break": "Finalizar Descanso",
        "opt_end_break_desc": "Terminar el descanso",
        "opt_back": "Volver",
        "opt_back_desc": "Volver al menú anterior",
        "opt_hours": "Horas",
        "opt_hours_desc": "Ver horas trabajadas",
        "opt_availability": "Disponibilidad",
        "opt_availability_desc": "Actualizar tu disponibilidad",
        "opt_this_week": "Esta Semana",
        "opt_this_week_desc": "Horas desde el lunes",
        "opt_this_month": "Este Mes",
        "opt_this_month_desc": "Horas este mes",
        "confirm_yes": "sí",
        "confirm_no": "no",
        "cancelled": "De acuerdo, sin cambios.",
    },
}

# Spanish trigger words — any of these in the body switches to Spanish
_ES_TRIGGERS = {"hola", "fichar", "horario", "semana", "mes", "turno", "horas", "entrada", "entrar", "salida", "salir", "descanso", "español", "espanol"}
# English trigger words — switches back to English
_EN_TRIGGERS = {"hi", "hello", "menu", "english"}


def _t(lang: str, key: str, **kwargs: object) -> str:
    return STRINGS[lang][key].format(**kwargs)  # type: ignore[arg-type]


# ── Twilio REST helpers ───────────────────────────────────────────────────────

def _twilio_url(path: str) -> str:
    return f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/{path}"


def _twilio_post(path: str, data: dict) -> None:
    with httpx.Client() as client:
        r = client.post(
            _twilio_url(path),
            data=data,
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Twilio API error {r.status_code}: {r.text}")


def _send_text(to: str, body: str) -> None:
    _twilio_post("Messages.json", {
        "From": settings.TWILIO_WHATSAPP_FROM,
        "To": to,
        "Body": body,
    })


def _send_list_message(to: str, body: str, button_label: str, sections: list[dict]) -> None:
    """
    Send a WhatsApp interactive list message via Twilio Content API (inline).
    Creates a transient twilio/list-picker content object and immediately sends it.
    Works on sandbox without template approval.
    """
    content_payload = {
        "friendly_name": f"list_{uuid.uuid4().hex[:8]}",
        "language": "en",
        "types": {
            "twilio/list-picker": {
                "body": body,
                "button": button_label,
                "items": [
                    {
                        "id": row["id"],
                        "item": row["title"],
                        "description": row.get("description", ""),
                    }
                    for section in sections
                    for row in section["rows"]
                ],
            }
        },
    }
    with httpx.Client() as client:
        r = client.post(
            "https://content.twilio.com/v1/Content",
            json=content_payload,
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Twilio Content API error {r.status_code}: {r.text}")
    content_sid = r.json()["sid"]

    _twilio_post("Messages.json", {
        "From": settings.TWILIO_WHATSAPP_FROM,
        "To": to,
        "ContentSid": content_sid,
    })


# ── Menu senders ──────────────────────────────────────────────────────────────

def _send_main_menu(to: str, name: str, lang: str) -> None:
    s = STRINGS[lang]
    body = s["main_menu_body"].format(name=name)
    hint = s["lang_switch_hint"]
    _send_list_message(
        to,
        body=f"{body}\n\n{hint}",
        button_label=s["main_menu_btn"],
        sections=[{
            "title": "Options",
            "rows": [
                {"id": ID_FICHAR,   "title": s["opt_fichar"],   "description": s["opt_fichar_desc"]},
                {"id": ID_SCHEDULE, "title": s["opt_schedule"],  "description": s["opt_schedule_desc"]},
                {"id": ID_MORE,     "title": s["opt_more"],      "description": s["opt_more_desc"]},
            ],
        }],
    )


def _send_fichar_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_list_message(
        to,
        body=s["fichar_body"],
        button_label=s["fichar_btn"],
        sections=[{
            "title": s["opt_fichar"],
            "rows": [
                {"id": ID_CLOCK_IN,  "title": s["opt_clock_in"],  "description": s["opt_clock_in_desc"]},
                {"id": ID_CLOCK_OUT, "title": s["opt_clock_out"], "description": s["opt_clock_out_desc"]},
                {"id": ID_BREAK,     "title": s["opt_break"],     "description": s["opt_break_desc"]},
            ],
        }],
    )


def _send_break_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_list_message(
        to,
        body=s["break_body"],
        button_label=s["break_btn"],
        sections=[{
            "title": s["opt_break"],
            "rows": [
                {"id": ID_BREAK_START, "title": s["opt_start_break"], "description": s["opt_start_break_desc"]},
                {"id": ID_BREAK_END,   "title": s["opt_end_break"],   "description": s["opt_end_break_desc"]},
                {"id": ID_BACK,        "title": s["opt_back"],        "description": s["opt_back_desc"]},
            ],
        }],
    )


def _send_more_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_list_message(
        to,
        body=s["more_body"],
        button_label=s["more_btn"],
        sections=[{
            "title": s["opt_more"],
            "rows": [
                {"id": ID_HOURS,        "title": s["opt_hours"],        "description": s["opt_hours_desc"]},
                {"id": ID_AVAILABILITY, "title": s["opt_availability"],  "description": s["opt_availability_desc"]},
                {"id": ID_BACK,         "title": s["opt_back"],          "description": s["opt_back_desc"]},
            ],
        }],
    )


def _send_hours_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_list_message(
        to,
        body=s["hours_body"],
        button_label=s["hours_btn"],
        sections=[{
            "title": s["opt_hours"],
            "rows": [
                {"id": ID_HOURS_WEEK,  "title": s["opt_this_week"],  "description": s["opt_this_week_desc"]},
                {"id": ID_HOURS_MONTH, "title": s["opt_this_month"], "description": s["opt_this_month_desc"]},
                {"id": ID_BACK,        "title": s["opt_back"],       "description": s["opt_back_desc"]},
            ],
        }],
    )


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
            language="en",
            updated_at=now,
        )
        db.add(session)
        await db.flush()
        return session

    # Reset stale sessions to main_menu (keep language preference)
    if session.updated_at.tzinfo is None:
        age = (now - session.updated_at.replace(tzinfo=datetime.timezone.utc)).total_seconds()
    else:
        age = (now - session.updated_at).total_seconds()

    if age > SESSION_TTL_MINUTES * 60:
        session.state = "main_menu"

    session.updated_at = now
    return session


def _detect_language(body_lower: str, current_lang: str) -> str:
    """Return "es" or "en" based on trigger words in the inbound message."""
    words = set(body_lower.split())
    if words & _ES_TRIGGERS:
        return "es"
    if words & _EN_TRIGGERS:
        return "en"
    return current_lang


# ── Clock-event helpers ───────────────────────────────────────────────────────

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


async def _last_clock_state(db, employee_id: str) -> tuple[str | None, datetime.datetime | None]:
    """
    Return (last_event_type, last_event_at) for the most recent in/out event today.
    Returns (None, None) if no events today.
    """
    today_start = datetime.datetime.now(datetime.timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    result = await db.execute(
        select(ClockEvent)
        .where(
            ClockEvent.employee_id == employee_id,
            ClockEvent.event_type.in_(["in", "out"]),
            ClockEvent.event_at >= today_start,
        )
        .order_by(ClockEvent.event_at.desc())
        .limit(1)
    )
    ev = result.scalar_one_or_none()
    if ev is None:
        return None, None
    return ev.event_type, ev.event_at


# ── Feature handlers ──────────────────────────────────────────────────────────

async def _handle_direct_clock(
    effective: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
) -> None:
    """
    Handle "in" / "out" shortcuts directly, bypassing menus.
    Includes guard logic: warns if already clocked in (for "in") or not clocked in (for "out").
    """
    lang = session.language
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M")
    last_type, last_at = await _last_clock_state(db, employee.id)

    if effective == ID_CLOCK_IN:
        if last_type == "in":
            # Already clocked in — ask if they meant to clock out
            since = last_at.strftime("%H:%M") if last_at else "?"
            _send_text(to, _t(lang, "already_clocked_in", time=since))
            session.state = "confirm_clock_out"
        else:
            await _write_clock_event(db, employee.id, "in", raw)
            _send_text(to, _t(lang, "clocked_in", time=now_str, name=employee.name))
            session.state = "main_menu"

    elif effective == ID_CLOCK_OUT:
        if last_type != "in":
            # Not clocked in — ask if they meant to clock in
            _send_text(to, _t(lang, "not_clocked_in"))
            session.state = "confirm_clock_in"
        else:
            await _write_clock_event(db, employee.id, "out", raw)
            _send_text(to, _t(lang, "clocked_out", time=now_str, name=employee.name))
            session.state = "main_menu"


async def _handle_confirm(
    body_lower: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
) -> None:
    """Handle yes/no confirmation for mismatched clock in/out."""
    lang = session.language
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M")
    # Accept "yes"/"sí"/"si" as affirmative
    is_yes = body_lower in ("yes", "sí", "si", "y", "s")
    is_no = body_lower in ("no", "n")

    if session.state == "confirm_clock_in":
        if is_yes:
            await _write_clock_event(db, employee.id, "in", raw)
            _send_text(to, _t(lang, "clocked_in", time=now_str, name=employee.name))
        elif is_no:
            _send_text(to, _t(lang, "cancelled"))
        else:
            # Unrecognised — re-prompt
            _send_text(to, _t(lang, "not_clocked_in"))
            return
        session.state = "main_menu"

    elif session.state == "confirm_clock_out":
        if is_yes:
            await _write_clock_event(db, employee.id, "out", raw)
            _send_text(to, _t(lang, "clocked_out", time=now_str, name=employee.name))
        elif is_no:
            _send_text(to, _t(lang, "cancelled"))
        else:
            last_type, last_at = await _last_clock_state(db, employee.id)
            since = last_at.strftime("%H:%M") if last_at else "?"
            _send_text(to, _t(lang, "already_clocked_in", time=since))
            return
        session.state = "main_menu"


async def _handle_clock(
    payload: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
) -> None:
    """Handle clock actions from the Fichar sub-menu."""
    lang = session.language
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M")

    if payload == ID_CLOCK_IN:
        await _write_clock_event(db, employee.id, "in", raw)
        _send_text(to, _t(lang, "clocked_in", time=now_str, name=employee.name))
        session.state = "main_menu"
    elif payload == ID_CLOCK_OUT:
        await _write_clock_event(db, employee.id, "out", raw)
        _send_text(to, _t(lang, "clocked_out", time=now_str, name=employee.name))
        session.state = "main_menu"
    elif payload == ID_BREAK:
        _send_break_menu(to, lang)
        session.state = "break"
    else:
        _send_fichar_menu(to, lang)


async def _handle_break(
    payload: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
) -> None:
    lang = session.language
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M")

    if payload == ID_BREAK_START:
        await _write_clock_event(db, employee.id, "break_start", raw)
        _send_text(to, _t(lang, "break_started", time=now_str))
        session.state = "main_menu"
    elif payload == ID_BREAK_END:
        await _write_clock_event(db, employee.id, "break_end", raw)
        _send_text(to, _t(lang, "break_ended", time=now_str))
        session.state = "main_menu"
    elif payload == ID_BACK:
        _send_fichar_menu(to, lang)
        session.state = "fichar"
    else:
        _send_break_menu(to, lang)


async def _handle_schedule(db, employee: Employee, to: str, lang: str) -> None:
    today = datetime.date.today()
    result = await db.execute(
        select(ShiftAssignment)
        .where(ShiftAssignment.employee_id == employee.id, ShiftAssignment.date >= today)
        .order_by(ShiftAssignment.date, ShiftAssignment.start_min)
        .limit(5)
    )
    assignments = result.scalars().all()

    if not assignments:
        _send_text(to, _t(lang, "no_shifts"))
        return

    lines = [_t(lang, "shifts_header")]
    for a in assignments:
        start_h, start_m = divmod(a.start_min, 60)
        end_h, end_m = divmod(a.end_min, 60)
        lines.append(f"• {a.date.strftime('%a %d %b')}  {start_h:02d}:{start_m:02d}–{end_h:02d}:{end_m:02d}")
    _send_text(to, "\n".join(lines))


async def _handle_hours(
    payload: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    to: str,
) -> None:
    lang = session.language
    now = datetime.datetime.now(datetime.timezone.utc)

    if payload == ID_HOURS_WEEK:
        monday = now.date() - datetime.timedelta(days=now.weekday())
        period_start = datetime.datetime(monday.year, monday.month, monday.day, tzinfo=datetime.timezone.utc)
        label = _t(lang, "this_week")
    elif payload == ID_HOURS_MONTH:
        period_start = datetime.datetime(now.year, now.month, 1, tzinfo=datetime.timezone.utc)
        label = _t(lang, "this_month")
    elif payload == ID_BACK:
        _send_more_menu(to, lang)
        session.state = "more"
        return
    else:
        _send_hours_menu(to, lang)
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
    _send_text(to, _t(lang, "hours_worked", hours=total_hours, mins=total_mins, period=label, name=employee.name))
    session.state = "main_menu"


# ── Main webhook ──────────────────────────────────────────────────────────────

@router.post("/webhook")
async def whatsapp_webhook(request: Request) -> Response:
    form = await request.form()
    form_dict = dict(form)

    # Validate Twilio signature — skip in local dev by setting TWILIO_SKIP_SIGNATURE=true
    if settings.TWILIO_AUTH_TOKEN and settings.TWILIO_SKIP_SIGNATURE.lower() != "true":
        validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
        signature = request.headers.get("X-Twilio-Signature", "")
        url = str(request.url)
        if not validator.validate(url, form_dict, signature):
            return Response(content="Forbidden", status_code=403)

    from_field: str = form_dict.get("From", "")
    phone = from_field.replace("whatsapp:", "")
    body_text: str = form_dict.get("Body", "").strip()
    body_lower = body_text.lower()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Employee).where(Employee.phone == phone, Employee.is_active == True)  # noqa: E712
        )
        employee = result.scalar_one_or_none()

        if not employee:
            # Use English for unregistered users — no session to check
            _send_text(from_field, STRINGS["en"]["not_registered"])
            return Response(status_code=204)

        session = await _get_or_create_session(db, employee.id)

        # Detect language from inbound message (always runs so user can switch at any time)
        session.language = _detect_language(body_lower, session.language)
        lang = session.language

        effective = _body_to_id(body_text)
        state = session.state

        # ── Confirmation states (yes/no responses) ────────────────────────────
        if state in ("confirm_clock_in", "confirm_clock_out"):
            await _handle_confirm(body_lower, db, employee, session, form_dict, from_field)

        # ── Direct shortcuts — bypass menus regardless of state ───────────────
        elif effective in (ID_CLOCK_IN, ID_CLOCK_OUT):
            await _handle_direct_clock(effective, db, employee, session, form_dict, from_field)

        elif effective == ID_SCHEDULE:
            await _handle_schedule(db, employee, from_field, lang)
            session.state = "main_menu"

        # ── Top-level menu navigation ─────────────────────────────────────────
        elif effective == ID_FICHAR:
            _send_fichar_menu(from_field, lang)
            session.state = "fichar"

        elif effective == ID_MORE:
            _send_more_menu(from_field, lang)
            session.state = "more"

        elif effective == ID_BREAK and state != "break":
            _send_break_menu(from_field, lang)
            session.state = "break"

        elif effective == ID_HOURS:
            _send_hours_menu(from_field, lang)
            session.state = "hours"

        # ── State-machine sub-menu handling ───────────────────────────────────
        elif state == "fichar":
            await _handle_clock(effective, db, employee, session, form_dict, from_field)

        elif state == "break":
            await _handle_break(effective, db, employee, session, form_dict, from_field)

        elif state == "more":
            if effective == ID_AVAILABILITY:
                _send_text(from_field, _t(lang, "availability_soon"))
                session.state = "main_menu"
            elif effective == ID_BACK:
                _send_main_menu(from_field, employee.name, lang)
                session.state = "main_menu"
            else:
                _send_more_menu(from_field, lang)

        elif state == "hours":
            await _handle_hours(effective, db, employee, session, from_field)

        else:
            # First contact, "hi", "hola", or anything unrecognised → main menu
            _send_main_menu(from_field, employee.name, lang)
            session.state = "main_menu"

        await db.commit()

    return Response(status_code=204)


def _body_to_id(text: str) -> str:
    """
    Map inbound Body text to an internal ID.
    List message selections send the row title as Body; we also accept
    common free-text shorthands so the bot still works without the list UI.
    Includes Spanish menu title aliases.
    """
    mapping = {
        # Raw IDs
        "fichar":       ID_FICHAR,
        "schedule":     ID_SCHEDULE,
        "more":         ID_MORE,
        "clock_in":     ID_CLOCK_IN,
        "clock_out":    ID_CLOCK_OUT,
        "break":        ID_BREAK,
        "break_start":  ID_BREAK_START,
        "break_end":    ID_BREAK_END,
        "hours":        ID_HOURS,
        "availability": ID_AVAILABILITY,
        "hours_week":   ID_HOURS_WEEK,
        "hours_month":  ID_HOURS_MONTH,
        "back":         ID_BACK,
        # English display titles
        "clock in":     ID_CLOCK_IN,
        "clock out":    ID_CLOCK_OUT,
        "start break":  ID_BREAK_START,
        "end break":    ID_BREAK_END,
        "this week":    ID_HOURS_WEEK,
        "this month":   ID_HOURS_MONTH,
        # Spanish display titles
        "horario":           ID_SCHEDULE,
        "más":               ID_MORE,
        "mas":               ID_MORE,
        "entrada":           ID_CLOCK_IN,
        "entrar":            ID_CLOCK_IN,
        "salida":            ID_CLOCK_OUT,
        "salir":             ID_CLOCK_OUT,
        "descanso":          ID_BREAK,
        "iniciar descanso":  ID_BREAK_START,
        "finalizar descanso": ID_BREAK_END,
        "horas":             ID_HOURS,
        "disponibilidad":    ID_AVAILABILITY,
        "esta semana":       ID_HOURS_WEEK,
        "este mes":          ID_HOURS_MONTH,
        "volver":            ID_BACK,
        # Free-text shorthands (both languages)
        "in":    ID_CLOCK_IN,
        "out":   ID_CLOCK_OUT,
        "week":  ID_HOURS_WEEK,
        "month": ID_HOURS_MONTH,
        "1":     ID_FICHAR,
        "2":     ID_SCHEDULE,
        "3":     ID_MORE,
    }
    return mapping.get(text.lower(), "")
