"""
Backend HTML admin — mounted at /admin (not under /api/v1).
Session: signed JWT stored in an HttpOnly cookie.
Access: is_superuser=True users only.
"""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.core.security import hash_password, verify_password
from app.models.user import User

router = APIRouter(prefix="/admin", include_in_schema=False)

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "templates", "admin")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

_COOKIE = "admin_session"
_ALGO = "HS256"


# ── Session helpers ────────────────────────────────────────────────────────────

def _make_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    return jwt.encode({"sub": user_id, "exp": exp, "type": "admin"}, settings.SECRET_KEY, algorithm=_ALGO)


def _verify_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALGO])
        if data.get("type") != "admin":
            return None
        return data.get("sub")
    except JWTError:
        return None


async def _get_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_session: str | None = Cookie(default=None),
) -> User | None:
    if not admin_session:
        return None
    user_id = _verify_token(admin_session)
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_superuser:
        return None
    return user


def _redirect_login(msg: str = "") -> RedirectResponse:
    url = "/admin/login"
    if msg:
        url += f"?error={msg}"
    return RedirectResponse(url, status_code=303)


# ── Login ──────────────────────────────────────────────────────────────────────

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, error: str = ""):
    return templates.TemplateResponse("login.html", {"request": request, "error": error})


@router.post("/login")
async def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password) or not user.is_superuser:
        return _redirect_login("Invalid+credentials+or+not+a+superuser")
    token = _make_token(user.id)
    response = RedirectResponse("/admin/", status_code=303)
    response.set_cookie(_COOKIE, token, httponly=True, samesite="lax", max_age=28800)
    return response


@router.get("/logout")
async def logout():
    response = RedirectResponse("/admin/login", status_code=303)
    response.delete_cookie(_COOKIE)
    return response


# ── Dashboard ──────────────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def user_list(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User | None = Depends(_get_admin),
    msg: str = "",
):
    if not admin:
        return _redirect_login()
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return templates.TemplateResponse(
        "users.html",
        {"request": request, "users": users, "admin": admin, "msg": msg},
    )


# ── Actions ────────────────────────────────────────────────────────────────────

@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    new_password: str = Form(...),
    db: AsyncSession = Depends(get_db),
    admin: User | None = Depends(_get_admin),
):
    if not admin:
        return _redirect_login()
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user and len(new_password) >= 8:
        user.hashed_password = hash_password(new_password)
        await db.commit()
    name = user.username if user else user_id
    return RedirectResponse(f"/admin/?msg=Password+reset+for+{name}", status_code=303)


@router.post("/users/{user_id}/toggle-plan")
async def toggle_plan(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User | None = Depends(_get_admin),
):
    if not admin:
        return _redirect_login()
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.plan = "paid" if user.plan == "free" else "free"
        await db.commit()
    return RedirectResponse("/admin/", status_code=303)


@router.post("/users/{user_id}/toggle-active")
async def toggle_active(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User | None = Depends(_get_admin),
):
    if not admin:
        return _redirect_login()
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.is_active = not user.is_active
        await db.commit()
    return RedirectResponse("/admin/", status_code=303)


@router.post("/users/{user_id}/delete")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User | None = Depends(_get_admin),
):
    if not admin:
        return _redirect_login()
    if user_id == admin.id:
        return RedirectResponse("/admin/?msg=Cannot+delete+your+own+account", status_code=303)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        await db.delete(user)
        await db.commit()
    return RedirectResponse("/admin/", status_code=303)
