"""
Meta (WhatsApp Business) Cloud API inbound webhook.

Public endpoint — no auth. Meta calls GET /webhook to verify the endpoint
and POST /webhook for every inbound message.

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
import hashlib
import hmac
import uuid
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Query, Request, Response
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.clock_event import ClockEvent
from app.models.employee import Employee
from app.models.shift_assignment import ShiftAssignment
from app.models.user import User
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
DEFAULT_TZ = "Europe/Dublin"

# ── Timezone helpers ──────────────────────────────────────────────────────────

def _tz(tz_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or DEFAULT_TZ)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def _local_now(tz_name: str | None) -> datetime.datetime:
    return datetime.datetime.now(_tz(tz_name))


def _to_local(dt: datetime.datetime, tz_name: str | None) -> datetime.datetime:
    return dt.astimezone(_tz(tz_name))


# ── Localised strings ─────────────────────────────────────────────────────────
STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "not_registered": "⛔ Your number is not registered. Contact your manager.",
        "clocked_in": "✅ Clocked in at *{time}*. Have a great shift, {name}!\n\nYou can start a break or clock out when you're ready.",
        "already_clocked_in": "⚠️ You appear to already be clocked in since *{time}*. Did you mean to clock out? Reply *yes* or *no*.",
        "clocked_out": "👋 Clocked out at *{time}*. See you next time, {name}!\n{summary}",
        "shift_summary": "🕐 Shift: {worked} worked · ☕ Break: {break_time}",
        "shift_no_summary": "",
        "not_clocked_in": "⚠️ You don't appear to be clocked in. Would you like to clock in instead? Reply *yes* or *no*.",
        "break_started": "☕ Break started at *{time}*. Enjoy!",
        "break_ended": "✅ Break ended at *{time}*. Back to it!",
        "no_shifts": "📭 You have no upcoming shifts scheduled.",
        "shifts_header": "📅 Your next shifts:",
        "hours_worked": "🕐 You've worked *{hours}h {mins}m* {period}, {name}.",
        "this_week": "this week",
        "this_month": "this month",
        "availability_soon": "🔜 Availability management via WhatsApp is coming soon. Visit the app to update your availability.",
        "lang_switch_hint": "_Escribe *hola* para español_",
        "main_menu_body": "👋 Hi *{name}*! What would you like to do?\n\n🕐 Clock in or out\n📅 View your schedule\n➕ More options",
        "main_menu_btn": "View options",
        "fichar_body": "🕐 What would you like to do?\n\n✅ Start your shift\n👋 End your shift\n↩️ Back to main menu",
        "fichar_btn": "Select",
        "break_body": "☕ Break options:\n\n▶️ Start your break\n⏹️ End your break\n↩️ Go back",
        "break_btn": "Select",
        "more_body": "➕ More options:\n\n🕐 See hours worked\n☕ Manage a break\n↩️ Go back",
        "more_btn": "Select",
        "hours_body": "🕐 Which period?\n\n📅 Since Monday\n📆 Since 1st of the month\n↩️ Go back",
        "hours_btn": "Select",
        "opt_fichar": "Clock In/Out",
        "opt_fichar_desc": "Clock in, clock out or break",
        "opt_schedule": "My Schedule",
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
        "cancelled": "👍 OK, no changes made.",
        "reminder_clockin": "⏰ Reminder: Your shift started at *{time}*. Please clock in.",
        "auto_clockout": "🔔 Your shift ended at *{time}*. No clock-out was recorded — shift end time has been used. Contact your manager if overtime applies.",
        "edit_request": (
            "⚠️ Your manager has proposed a correction to your {type} record:\n"
            "• Was: {old}\n• Now: {new}\n"
            "{reason_line}"
            "Reply *yes* to approve or *no* to reject."
        ),
        "edit_approved": "✅ Time correction approved. Your record has been updated to *{new}*.",
        "edit_rejected": "❌ Time correction rejected. Your original record remains unchanged.",
        "edit_not_found": "⚠️ This edit request has already been resolved or is no longer valid.",
    },
    "es": {
        "not_registered": "⛔ Tu número no está registrado. Contacta con tu responsable.",
        "clocked_in": "✅ Fichaje de entrada a las *{time}*. ¡Que tengas un buen turno, {name}!\n\nPuedes iniciar un descanso o fichar salida cuando quieras.",
        "already_clocked_in": "⚠️ Parece que ya fichaste entrada a las *{time}*. ¿Querías fichar salida? Responde *sí* o *no*.",
        "clocked_out": "👋 Fichaje de salida a las *{time}*. ¡Hasta pronto, {name}!\n{summary}",
        "shift_summary": "🕐 Turno: {worked} trabajado · ☕ Descanso: {break_time}",
        "shift_no_summary": "",
        "not_clocked_in": "⚠️ No parece que hayas fichado entrada. ¿Quieres fichar entrada ahora? Responde *sí* o *no*.",
        "break_started": "☕ Descanso iniciado a las *{time}*. ¡Disfruta!",
        "break_ended": "✅ Descanso terminado a las *{time}*. ¡De vuelta al trabajo!",
        "no_shifts": "📭 No tienes turnos próximos programados.",
        "shifts_header": "📅 Tus próximos turnos:",
        "hours_worked": "🕐 Has trabajado *{hours}h {mins}m* {period}, {name}.",
        "this_week": "esta semana",
        "this_month": "este mes",
        "availability_soon": "🔜 La gestión de disponibilidad por WhatsApp estará disponible pronto. Visita la app para actualizar tu disponibilidad.",
        "lang_switch_hint": "_Type *hi* for English_",
        "main_menu_body": "👋 ¡Hola *{name}*! ¿Qué quieres hacer?\n\n🕐 Fichar entrada o salida\n📅 Ver tu horario\n➕ Más opciones",
        "main_menu_btn": "Ver opciones",
        "fichar_body": "🕐 ¿Qué quieres hacer?\n\n✅ Iniciar turno\n👋 Finalizar turno\n↩️ Volver al menú principal",
        "fichar_btn": "Seleccionar",
        "break_body": "☕ Opciones de descanso:\n\n▶️ Iniciar descanso\n⏹️ Finalizar descanso\n↩️ Volver",
        "break_btn": "Seleccionar",
        "more_body": "➕ Más opciones:\n\n🕐 Ver horas trabajadas\n☕ Gestionar descanso\n↩️ Volver",
        "more_btn": "Seleccionar",
        "hours_body": "🕐 ¿Qué período?\n\n📅 Desde el lunes\n📆 Desde el día 1 del mes\n↩️ Volver",
        "hours_btn": "Seleccionar",
        "opt_fichar": "Fichar",
        "opt_fichar_desc": "Entrada, salida o descanso",
        "opt_schedule": "Mi horario",
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
        "cancelled": "👍 De acuerdo, sin cambios.",
        "reminder_clockin": "⏰ Recordatorio: Tu turno comenzó a las *{time}*. Por favor ficha entrada.",
        "auto_clockout": "🔔 Tu turno terminó a las *{time}*. No se registró salida — se ha usado la hora de fin del turno. Contacta con tu responsable si hay horas extra.",
        "edit_request": (
            "⚠️ Tu responsable ha propuesto una corrección en tu registro de {type}:\n"
            "• Era: {old}\n• Ahora: {new}\n"
            "{reason_line}"
            "Responde *sí* para aprobar o *no* para rechazar."
        ),
        "edit_approved": "✅ Corrección aprobada. Tu registro se ha actualizado a las *{new}*.",
        "edit_rejected": "❌ Corrección rechazada. Tu registro original permanece sin cambios.",
        "edit_not_found": "⚠️ Esta solicitud de corrección ya ha sido resuelta o ya no es válida.",
    },
}

# Spanish trigger words — any of these in the body switches to Spanish
_ES_TRIGGERS = {"hola", "fichar", "horario", "semana", "mes", "turno", "horas", "entrada", "entrar", "salida", "salir", "descanso", "español", "espanol"}
# English trigger words — switches back to English
_EN_TRIGGERS = {"hi", "hello", "menu", "english"}


def _t(lang: str, key: str, **kwargs: object) -> str:
    return STRINGS[lang][key].format(**kwargs)  # type: ignore[arg-type]


# ── Meta Cloud API helpers ────────────────────────────────────────────────────

_META_BASE = "https://graph.facebook.com/v20.0"


def _meta_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.META_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }


def _send_text(to: str, body: str) -> None:
    """Send a plain-text WhatsApp message via Meta Cloud API.

    `to` is an E.164 phone number (no 'whatsapp:' prefix).
    """
    with httpx.Client() as client:
        r = client.post(
            f"{_META_BASE}/{settings.META_PHONE_NUMBER_ID}/messages",
            headers=_meta_headers(),
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "text",
                "text": {"body": body},
            },
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Meta API error {r.status_code}: {r.text}")


def _send_button_message(to: str, body: str, buttons: list[dict]) -> None:
    """Send up to 3 inline reply buttons. Each button: {"id": str, "title": str}."""
    with httpx.Client() as client:
        r = client.post(
            f"{_META_BASE}/{settings.META_PHONE_NUMBER_ID}/messages",
            headers=_meta_headers(),
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "interactive",
                "interactive": {
                    "type": "button",
                    "body": {"text": body},
                    "action": {
                        "buttons": [
                            {"type": "reply", "reply": {"id": b["id"], "title": b["title"]}}
                            for b in buttons
                        ],
                    },
                },
            },
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Meta API error {r.status_code}: {r.text}")


def _send_list_message(to: str, body: str, button_label: str, sections: list[dict]) -> None:
    """Send a WhatsApp interactive list message via Meta Cloud API."""
    meta_sections = []
    for section in sections:
        meta_sections.append({
            "title": section.get("title", ""),
            "rows": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "description": row.get("description", ""),
                }
                for row in section["rows"]
            ],
        })

    with httpx.Client() as client:
        r = client.post(
            f"{_META_BASE}/{settings.META_PHONE_NUMBER_ID}/messages",
            headers=_meta_headers(),
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "interactive",
                "interactive": {
                    "type": "list",
                    "body": {"text": body},
                    "action": {
                        "button": button_label,
                        "sections": meta_sections,
                    },
                },
            },
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Meta API error {r.status_code}: {r.text}")


# ── Menu senders ──────────────────────────────────────────────────────────────

def _send_main_menu(to: str, name: str, lang: str) -> None:
    s = STRINGS[lang]
    body = s["main_menu_body"].format(name=name)
    hint = s["lang_switch_hint"]
    _send_button_message(
        to,
        body=f"{body}\n\n{hint}",
        buttons=[
            {"id": ID_FICHAR,   "title": s["opt_fichar"]},
            {"id": ID_SCHEDULE, "title": s["opt_schedule"]},
            {"id": ID_MORE,     "title": s["opt_more"]},
        ],
    )


def _send_fichar_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_button_message(
        to,
        body=s["fichar_body"],
        buttons=[
            {"id": ID_CLOCK_IN,  "title": s["opt_clock_in"]},
            {"id": ID_CLOCK_OUT, "title": s["opt_clock_out"]},
            {"id": ID_BACK,      "title": s["opt_back"]},
        ],
    )


def _send_break_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_button_message(
        to,
        body=s["break_body"],
        buttons=[
            {"id": ID_BREAK_START, "title": s["opt_start_break"]},
            {"id": ID_BREAK_END,   "title": s["opt_end_break"]},
            {"id": ID_BACK,        "title": s["opt_back"]},
        ],
    )


def _send_more_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_button_message(
        to,
        body=s["more_body"],
        buttons=[
            {"id": ID_HOURS,  "title": s["opt_hours"]},
            {"id": ID_BREAK,  "title": s["opt_break"]},
            {"id": ID_BACK,   "title": s["opt_back"]},
        ],
    )


def _send_clocked_in_menu(to: str, lang: str, clocked_in_msg: str) -> None:
    """Send the clock-in confirmation with Break and Clock Out quick-action buttons."""
    s = STRINGS[lang]
    _send_button_message(
        to,
        body=clocked_in_msg,
        buttons=[
            {"id": ID_BREAK_START, "title": s["opt_start_break"]},
            {"id": ID_CLOCK_OUT,   "title": s["opt_clock_out"]},
            {"id": ID_BACK,        "title": s["opt_back"]},
        ],
    )


def _send_hours_menu(to: str, lang: str) -> None:
    s = STRINGS[lang]
    _send_button_message(
        to,
        body=s["hours_body"],
        buttons=[
            {"id": ID_HOURS_WEEK,  "title": s["opt_this_week"]},
            {"id": ID_HOURS_MONTH, "title": s["opt_this_month"]},
            {"id": ID_BACK,        "title": s["opt_back"]},
        ],
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
    """Return "es" or "en" based on trigger words in the inbound message.
    Skip detection for button/menu IDs — they contain Spanish words but are
    not typed by the user so should not trigger a language switch.
    """
    if _body_to_id(body_lower):
        return current_lang
    words = set(body_lower.split())
    if words & _ES_TRIGGERS:
        return "es"
    if words & _EN_TRIGGERS:
        return "en"
    return current_lang


# ── Clock-event helpers ───────────────────────────────────────────────────────

async def _find_shift_for_now(db, employee_id: str, tz_name: str | None) -> ShiftAssignment | None:
    """
    Find the ShiftAssignment for today whose start_min is closest to the current local time,
    within a ±2-hour tolerance. Used to link clock events to scheduled shifts.
    """
    local_now = _local_now(tz_name)
    today = local_now.date()
    now_min = local_now.hour * 60 + local_now.minute

    result = await db.execute(
        select(ShiftAssignment).where(
            ShiftAssignment.employee_id == employee_id,
            ShiftAssignment.date == today,
        )
    )
    assignments = result.scalars().all()
    if not assignments:
        return None

    TOLERANCE_MIN = 120
    candidates = [a for a in assignments if abs(a.start_min - now_min) <= TOLERANCE_MIN]
    if not candidates:
        return None
    return min(candidates, key=lambda a: abs(a.start_min - now_min))


async def _write_clock_event(
    db,
    employee_id: str,
    event_type: str,
    raw: dict,
    shift_assignment_id: str | None = None,
    is_estimated: bool = False,
    source: str = "whatsapp",
    event_at: datetime.datetime | None = None,
) -> None:
    event = ClockEvent(
        id=str(uuid.uuid4()),
        employee_id=employee_id,
        event_type=event_type,
        event_at=event_at or datetime.datetime.now(datetime.timezone.utc),
        source=source,
        is_estimated=is_estimated,
        shift_assignment_id=shift_assignment_id,
        raw_payload=raw,
    )
    db.add(event)


async def _last_clock_state(db, employee_id: str, tz_name: str | None) -> tuple[str | None, datetime.datetime | None]:
    """
    Return (last_event_type, last_event_at) for the most recent in/out event today
    (where "today" is defined in the business's local timezone, not UTC).
    Returns (None, None) if no events today.
    """
    local_now = _local_now(tz_name)
    today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_local.astimezone(datetime.timezone.utc)
    result = await db.execute(
        select(ClockEvent)
        .where(
            ClockEvent.employee_id == employee_id,
            ClockEvent.event_type.in_(["in", "out"]),
            ClockEvent.event_at >= today_start_utc,
        )
        .order_by(ClockEvent.event_at.desc())
        .limit(1)
    )
    ev = result.scalar_one_or_none()
    if ev is None:
        return None, None
    return ev.event_type, ev.event_at


async def _shift_summary(db, employee_id: str, tz_name: str | None, lang: str) -> str:
    """
    Return a one-line summary of today's shift: worked time and break time.
    Fetches all in/out/break_start/break_end events since local midnight.
    Returns empty string if there is no clock-in event to base a summary on.
    """
    local_now = _local_now(tz_name)
    today_start_utc = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(datetime.timezone.utc)

    result = await db.execute(
        select(ClockEvent)
        .where(
            ClockEvent.employee_id == employee_id,
            ClockEvent.event_type.in_(["in", "out", "break_start", "break_end"]),
            ClockEvent.event_at >= today_start_utc,
        )
        .order_by(ClockEvent.event_at)
    )
    events = result.scalars().all()

    clock_in_at: datetime.datetime | None = None
    break_start_at: datetime.datetime | None = None
    total_break_secs = 0

    for ev in events:
        if ev.event_type == "in":
            clock_in_at = ev.event_at
        elif ev.event_type == "break_start":
            break_start_at = ev.event_at
        elif ev.event_type == "break_end" and break_start_at is not None:
            total_break_secs += (ev.event_at - break_start_at).total_seconds()
            break_start_at = None

    if clock_in_at is None:
        return _t(lang, "shift_no_summary")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    gross_secs = (now_utc - clock_in_at).total_seconds()
    worked_secs = max(0, gross_secs - total_break_secs)

    def _fmt(secs: float) -> str:
        h = int(secs // 3600)
        m = int((secs % 3600) // 60)
        return f"{h}h {m:02d}m"

    return _t(lang, "shift_summary", worked=_fmt(worked_secs), break_time=_fmt(total_break_secs))


# ── Feature handlers ──────────────────────────────────────────────────────────

async def _handle_direct_clock(
    effective: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
    tz_name: str | None,
) -> None:
    """
    Handle "in" / "out" shortcuts directly, bypassing menus.
    Includes guard logic: warns if already clocked in (for "in") or not clocked in (for "out").
    """
    lang = session.language
    now_str = _local_now(tz_name).strftime("%H:%M")
    last_type, last_at = await _last_clock_state(db, employee.id, tz_name)

    if effective == ID_CLOCK_IN:
        if last_type == "in":
            since = _to_local(last_at, tz_name).strftime("%H:%M") if last_at else "?"
            _send_text(to, _t(lang, "already_clocked_in", time=since))
            session.state = "confirm_clock_out"
        else:
            shift = await _find_shift_for_now(db, employee.id, tz_name)
            await _write_clock_event(db, employee.id, "in", raw, shift_assignment_id=shift.id if shift else None)
            _send_clocked_in_menu(to, lang, _t(lang, "clocked_in", time=now_str, name=employee.name))
            session.state = "clocked_in"

    elif effective == ID_CLOCK_OUT:
        if last_type != "in":
            _send_text(to, _t(lang, "not_clocked_in"))
            session.state = "confirm_clock_in"
        else:
            shift = await _find_shift_for_now(db, employee.id, tz_name)
            summary = await _shift_summary(db, employee.id, tz_name, lang)
            await _write_clock_event(db, employee.id, "out", raw, shift_assignment_id=shift.id if shift else None)
            _send_text(to, _t(lang, "clocked_out", time=now_str, name=employee.name, summary=summary))
            session.state = "main_menu"


async def _handle_confirm(
    body_lower: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
    tz_name: str | None,
) -> None:
    """Handle yes/no confirmation for mismatched clock in/out."""
    lang = session.language
    now_str = _local_now(tz_name).strftime("%H:%M")
    is_yes = body_lower in ("yes", "sí", "si", "y", "s")
    is_no = body_lower in ("no", "n")

    if session.state == "confirm_clock_in":
        if is_yes:
            shift = await _find_shift_for_now(db, employee.id, tz_name)
            await _write_clock_event(db, employee.id, "in", raw, shift_assignment_id=shift.id if shift else None)
            _send_clocked_in_menu(to, lang, _t(lang, "clocked_in", time=now_str, name=employee.name))
            session.state = "clocked_in"
            return
        elif is_no:
            _send_text(to, _t(lang, "cancelled"))
        else:
            _send_text(to, _t(lang, "not_clocked_in"))
            return
        session.state = "main_menu"

    elif session.state == "confirm_clock_out":
        if is_yes:
            shift = await _find_shift_for_now(db, employee.id, tz_name)
            summary = await _shift_summary(db, employee.id, tz_name, lang)
            await _write_clock_event(db, employee.id, "out", raw, shift_assignment_id=shift.id if shift else None)
            _send_text(to, _t(lang, "clocked_out", time=now_str, name=employee.name, summary=summary))
        elif is_no:
            _send_text(to, _t(lang, "cancelled"))
        else:
            last_type, last_at = await _last_clock_state(db, employee.id, tz_name)
            since = _to_local(last_at, tz_name).strftime("%H:%M") if last_at else "?"
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
    tz_name: str | None,
) -> None:
    """Handle clock actions from the Fichar sub-menu."""
    lang = session.language
    now_str = _local_now(tz_name).strftime("%H:%M")

    if payload == ID_CLOCK_IN:
        shift = await _find_shift_for_now(db, employee.id, tz_name)
        await _write_clock_event(db, employee.id, "in", raw, shift_assignment_id=shift.id if shift else None)
        _send_clocked_in_menu(to, lang, _t(lang, "clocked_in", time=now_str, name=employee.name))
        session.state = "clocked_in"
    elif payload == ID_CLOCK_OUT:
        shift = await _find_shift_for_now(db, employee.id, tz_name)
        summary = await _shift_summary(db, employee.id, tz_name, lang)
        await _write_clock_event(db, employee.id, "out", raw, shift_assignment_id=shift.id if shift else None)
        _send_text(to, _t(lang, "clocked_out", time=now_str, name=employee.name, summary=summary))
        session.state = "main_menu"
    elif payload == ID_BACK:
        _send_main_menu(to, employee.name, lang)
        session.state = "main_menu"
    else:
        _send_fichar_menu(to, lang)


async def _handle_break(
    payload: str,
    db,
    employee: Employee,
    session: WhatsAppSession,
    raw: dict,
    to: str,
    tz_name: str | None,
) -> None:
    lang = session.language
    now_str = _local_now(tz_name).strftime("%H:%M")

    if payload == ID_BREAK_START:
        shift = await _find_shift_for_now(db, employee.id, tz_name)
        await _write_clock_event(db, employee.id, "break_start", raw, shift_assignment_id=shift.id if shift else None)
        _send_text(to, _t(lang, "break_started", time=now_str))
        session.state = "main_menu"
    elif payload == ID_BREAK_END:
        shift = await _find_shift_for_now(db, employee.id, tz_name)
        await _write_clock_event(db, employee.id, "break_end", raw, shift_assignment_id=shift.id if shift else None)
        _send_text(to, _t(lang, "break_ended", time=now_str))
        session.state = "main_menu"
    elif payload == ID_BACK:
        _send_main_menu(to, employee.name, lang)
        session.state = "main_menu"
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
    tz_name: str | None,
) -> None:
    lang = session.language
    local_now = _local_now(tz_name)

    if payload == ID_HOURS_WEEK:
        monday = local_now.date() - datetime.timedelta(days=local_now.weekday())
        period_start_local = datetime.datetime(monday.year, monday.month, monday.day, tzinfo=_tz(tz_name))
        period_start = period_start_local.astimezone(datetime.timezone.utc)
        label = _t(lang, "this_week")
    elif payload == ID_HOURS_MONTH:
        period_start_local = datetime.datetime(local_now.year, local_now.month, 1, tzinfo=_tz(tz_name))
        period_start = period_start_local.astimezone(datetime.timezone.utc)
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


# ── Edit approval handler ─────────────────────────────────────────────────────

async def _handle_edit_confirm(
    body_lower: str,
    state: str,
    session: "WhatsAppSession",
    to: str,
    lang: str,
    db,
) -> None:
    """Handle yes/no reply to a manager's proposed edit."""
    import httpx as _httpx
    from app.core.config import settings as _settings

    token = state.removeprefix("edit_confirm_")
    is_yes = body_lower in ("yes", "sí", "si", "y", "s")
    is_no  = body_lower in ("no", "n")

    if not is_yes and not is_no:
        _send_text(to, "Please reply *yes* to approve or *no* to reject the time correction.")
        return

    # Call the internal resolve endpoint
    try:
        async with _httpx.AsyncClient() as client:
            resp = await client.post(
                f"http://localhost:{_settings.PORT if hasattr(_settings, 'PORT') else 8000}"
                f"/api/v1/clock/events/edit-confirm/{token}",
                params={"approved": "true" if is_yes else "false"},
                timeout=10,
            )
        resolved_status = resp.json().get("status", "unknown") if resp.status_code == 200 else None
    except Exception:
        resolved_status = None

    if resolved_status == "approved":
        _send_text(to, STRINGS[lang].get("edit_approved", "✅ Time correction approved."))
    elif resolved_status == "rejected":
        _send_text(to, STRINGS[lang].get("edit_rejected", "❌ Time correction rejected."))
    else:
        _send_text(to, STRINGS[lang].get("edit_not_found", "This request has already been resolved."))

    session.state = "main_menu"


# ── Webhook verification (GET) ────────────────────────────────────────────────

@router.get("/webhook")
async def whatsapp_verify(
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
) -> Response:
    """Meta calls GET /webhook to verify the endpoint during setup."""
    if hub_mode == "subscribe" and hub_verify_token == settings.META_WEBHOOK_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(content="Forbidden", status_code=403)


# ── Main webhook (POST) ───────────────────────────────────────────────────────

@router.post("/webhook")
async def whatsapp_webhook(request: Request) -> Response:
    raw_body = await request.body()

    # Verify X-Hub-Signature-256 — skip in local dev by setting META_SKIP_SIGNATURE=true
    if settings.META_APP_SECRET and settings.META_SKIP_SIGNATURE.lower() != "true":
        sig_header = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(
            settings.META_APP_SECRET.encode(),
            raw_body,
            digestmod=hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig_header, expected):
            return Response(content="Forbidden", status_code=403)

    import json
    try:
        payload = json.loads(raw_body)
    except Exception:
        return Response(content="Bad Request", status_code=400)

    # Extract the first message from the webhook payload (if any)
    try:
        entry = payload["entry"][0]
        change = entry["changes"][0]["value"]
        messages = change.get("messages")
        if not messages:
            # Delivery/read receipts — acknowledge and ignore
            return Response(status_code=200)
        msg = messages[0]
    except (KeyError, IndexError):
        return Response(status_code=200)

    # Meta sends numbers without '+' prefix — normalise to E.164 (+353...)
    raw_from: str = msg.get("from", "")
    phone: str = "+" + raw_from if raw_from and not raw_from.startswith("+") else raw_from

    # Extract text: either a plain text message or an interactive list reply
    msg_type = msg.get("type", "")
    if msg_type == "text":
        body_text: str = msg.get("text", {}).get("body", "").strip()
    elif msg_type == "interactive":
        interactive = msg.get("interactive", {})
        if interactive.get("type") == "list_reply":
            body_text = interactive.get("list_reply", {}).get("id", "").strip()
        elif interactive.get("type") == "button_reply":
            body_text = interactive.get("button_reply", {}).get("id", "").strip()
        else:
            body_text = ""
    else:
        # Ignore other message types (image, audio, etc.)
        return Response(status_code=200)

    body_lower = body_text.lower()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Employee).where(Employee.phone == phone, Employee.is_active == True)  # noqa: E712
        )
        employee = result.scalar_one_or_none()

        if not employee:
            _send_text(phone, STRINGS["en"]["not_registered"])
            return Response(status_code=200)

        session = await _get_or_create_session(db, employee.id)

        # Look up the business's timezone from the owning User record
        user_result = await db.get(User, employee.user_id)
        tz_name: str | None = user_result.timezone if user_result else None

        # Detect language from inbound message (always runs so user can switch at any time)
        session.language = _detect_language(body_lower, session.language)
        lang = session.language

        effective = _body_to_id(body_text)
        state = session.state

        # ── Confirmation states (yes/no responses) ────────────────────────────
        if state in ("confirm_clock_in", "confirm_clock_out"):
            await _handle_confirm(body_lower, db, employee, session, payload, phone, tz_name)

        elif state.startswith("edit_confirm_"):
            await _handle_edit_confirm(body_lower, state, session, phone, lang, db)

        # ── Post-clock-in state: Break / Clock Out / Back buttons ────────────
        elif state == "clocked_in":
            if effective == ID_BREAK_START:
                await _handle_break(ID_BREAK_START, db, employee, session, payload, phone, tz_name)
            elif effective == ID_CLOCK_OUT:
                await _handle_direct_clock(ID_CLOCK_OUT, db, employee, session, payload, phone, tz_name)
            elif effective == ID_BACK:
                _send_main_menu(phone, employee.name, lang)
                session.state = "main_menu"
            else:
                # Anything else — re-show the same buttons
                last_type2, last_at2 = await _last_clock_state(db, employee.id, tz_name)
                now_str2 = _local_now(tz_name).strftime("%H:%M")
                since2 = _to_local(last_at2, tz_name).strftime("%H:%M") if last_at2 else now_str2
                _send_clocked_in_menu(phone, lang, _t(lang, "clocked_in", time=since2, name=employee.name))

        # ── Direct shortcuts — bypass menus regardless of state ───────────────
        elif effective in (ID_CLOCK_IN, ID_CLOCK_OUT):
            await _handle_direct_clock(effective, db, employee, session, payload, phone, tz_name)

        elif effective == ID_SCHEDULE:
            await _handle_schedule(db, employee, phone, lang)
            session.state = "main_menu"

        # ── Top-level menu navigation ─────────────────────────────────────────
        elif effective == ID_FICHAR:
            _send_fichar_menu(phone, lang)
            session.state = "fichar"

        elif effective == ID_MORE:
            _send_more_menu(phone, lang)
            session.state = "more"

        elif effective == ID_BREAK and state != "break":
            _send_break_menu(phone, lang)
            session.state = "break"

        elif effective == ID_HOURS:
            _send_hours_menu(phone, lang)
            session.state = "hours"

        # ── State-machine sub-menu handling ───────────────────────────────────
        elif state == "fichar":
            await _handle_clock(effective, db, employee, session, payload, phone, tz_name)

        elif state == "break":
            await _handle_break(effective, db, employee, session, payload, phone, tz_name)

        elif state == "more":
            if effective == ID_BREAK:
                _send_break_menu(phone, lang)
                session.state = "break"
            elif effective == ID_BACK:
                _send_main_menu(phone, employee.name, lang)
                session.state = "main_menu"
            else:
                _send_more_menu(phone, lang)

        elif state == "hours":
            await _handle_hours(effective, db, employee, session, phone, tz_name)

        else:
            # First contact, "hi", "hola", or anything unrecognised → main menu
            _send_main_menu(phone, employee.name, lang)
            session.state = "main_menu"

        await db.commit()

    return Response(status_code=200)


def _body_to_id(text: str) -> str:
    """
    Map inbound Body text to an internal ID.
    Interactive list replies send the row id directly; we also accept
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
