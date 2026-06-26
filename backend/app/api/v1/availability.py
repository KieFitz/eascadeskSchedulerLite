"""
Employee availability self-service via one-time token.

Flow:
  1. Manager triggers via WhatsApp bot → backend calls POST /availability-token/{employee_id}
     which creates an AvailabilityToken (15-minute expiry) and returns the URL.
  2. Employee opens link: /availability?token=<uuid>
     The frontend fetches GET /api/v1/availability/me?token=<uuid> to load their rules.
  3. Employee adds/removes rules via POST/DELETE /api/v1/availability/me[/{id}]?token=<uuid>

Tokens are valid for multiple reads and writes until they expire (15 minutes
from creation), so an employee can submit several preference changes from the
same link. used_at records the first write for audit purposes only — it does
not block subsequent writes. Past specific_date rules are automatically cleaned
up on GET.
"""

import datetime
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_pro_plan
from app.models.availability import EmployeeAvailability
from app.models.availability_token import AvailabilityToken
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import AvailabilityIn, AvailabilityOut

router = APIRouter(tags=["availability"])


# ── Token validation helper ───────────────────────────────────────────────────

async def _resolve_token(
    token: str, db: AsyncSession, *, write: bool = False
) -> tuple[AvailabilityToken, Employee]:
    """
    Validate the token and return (AvailabilityToken, Employee).

    Tokens stay valid for any number of reads and writes until they expire;
    the `write` flag is kept for call-site clarity but no longer rejects
    previously-used tokens.
    """
    result = await db.execute(
        select(AvailabilityToken).where(AvailabilityToken.token == token)
    )
    tok = result.scalar_one_or_none()

    if tok is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link")

    now = datetime.datetime.now(datetime.timezone.utc)
    expires = tok.expires_at if tok.expires_at.tzinfo else tok.expires_at.replace(tzinfo=datetime.timezone.utc)

    if now > expires:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This link has expired")

    emp_result = await db.get(Employee, tok.employee_id)
    if emp_result is None or not emp_result.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Employee not found")

    return tok, emp_result


# ── Manager: generate a token for an employee ─────────────────────────────────

@router.post(
    "/availability-token/{employee_id}",
    status_code=status.HTTP_201_CREATED,
)
async def create_availability_token(
    employee_id: str,
    current_user: User = Depends(require_pro_plan),
    db: AsyncSession = Depends(get_db),
):
    """Generate a one-time availability link for an employee. Manager auth required."""
    # Verify employee belongs to this manager
    emp_result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.user_id == current_user.id)
    )
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    now = datetime.datetime.now(datetime.timezone.utc)
    tok = AvailabilityToken(
        id=str(_uuid.uuid4()),
        token=str(_uuid.uuid4()),
        employee_id=employee_id,
        expires_at=now + datetime.timedelta(minutes=15),
    )
    db.add(tok)
    await db.commit()
    await db.refresh(tok)

    return {"token": tok.token, "expires_at": tok.expires_at}


# ── Employee: read current availability rules ─────────────────────────────────

@router.get("/availability/me", response_model=list[AvailabilityOut])
async def get_my_availability(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Fetch all availability rules for the employee. Expired specific_date rules are deleted."""
    _, employee = await _resolve_token(token, db)

    result = await db.execute(
        select(EmployeeAvailability).where(EmployeeAvailability.employee_id == employee.id)
    )
    rules = result.scalars().all()

    today = datetime.date.today()
    active = []
    for rule in rules:
        if rule.specific_date and rule.specific_date < today:
            await db.delete(rule)
        else:
            active.append(rule)

    await db.commit()
    return active


# ── Employee: get own name ─────────────────────────────────────────────────────

@router.get("/availability/me/info")
async def get_my_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Return employee name for the greeting on the availability page."""
    _, employee = await _resolve_token(token, db)
    return {"name": employee.name}


# ── Employee: add a rule ──────────────────────────────────────────────────────

@router.post(
    "/availability/me",
    response_model=AvailabilityOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_my_availability(
    body: AvailabilityIn,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Add an availability rule. Token may be reused until it expires (15 minutes)."""
    tok, employee = await _resolve_token(token, db, write=True)

    rule = EmployeeAvailability(employee_id=employee.id, **body.model_dump())
    db.add(rule)

    # Record first use for audit purposes
    if tok.used_at is None:
        tok.used_at = datetime.datetime.now(datetime.timezone.utc)

    await db.commit()
    await db.refresh(rule)
    return rule


# ── Employee: delete a rule ───────────────────────────────────────────────────

@router.delete("/availability/me/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_availability(
    rule_id: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete one of the employee's availability rules. Token may be reused until it expires."""
    tok, employee = await _resolve_token(token, db, write=True)

    result = await db.execute(
        select(EmployeeAvailability).where(
            EmployeeAvailability.id == rule_id,
            EmployeeAvailability.employee_id == employee.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(rule)
    if tok.used_at is None:
        tok.used_at = datetime.datetime.now(datetime.timezone.utc)
    await db.commit()
