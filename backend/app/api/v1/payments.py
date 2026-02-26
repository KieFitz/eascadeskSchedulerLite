import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.services.stripe_service import (
    construct_webhook_event,
    create_checkout_session,
    create_portal_session,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/checkout")
async def checkout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.plan == "paid":
        raise HTTPException(status_code=400, detail="Already on the Pro plan")

    try:
        url = create_checkout_session(
            user_id=current_user.id,
            email=current_user.email,
            customer_id=current_user.stripe_customer_id,
        )
    except stripe.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc.user_message}")

    return {"url": url}


@router.post("/portal")
async def portal(
    current_user: User = Depends(get_current_user),
):
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found")

    try:
        url = create_portal_session(current_user.stripe_customer_id)
    except stripe.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc.user_message}")

    return {"url": url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = construct_webhook_event(payload, sig_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    subscription = event.data.object if hasattr(event.data, "object") else None

    if event.type == "customer.subscription.created":
        await _handle_subscription_active(subscription, db)

    elif event.type == "customer.subscription.updated":
        status = getattr(subscription, "status", "")
        if status in ("active", "trialing"):
            await _handle_subscription_active(subscription, db)
        elif status in ("canceled", "unpaid", "past_due"):
            await _handle_subscription_inactive(subscription, db)

    elif event.type == "customer.subscription.deleted":
        await _handle_subscription_inactive(subscription, db)

    elif event.type == "checkout.session.completed":
        # Capture customer_id from checkout so we can link it to our user
        session = event.data.object
        user_id = session.metadata.get("user_id") if session.metadata else None
        customer_id = session.customer
        if user_id and customer_id:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user and not user.stripe_customer_id:
                user.stripe_customer_id = customer_id
                await db.commit()

    return {"received": True}


async def _handle_subscription_active(subscription, db: AsyncSession):
    customer_id = getattr(subscription, "customer", None)
    sub_id = getattr(subscription, "id", None)
    if not customer_id:
        return
    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    user = result.scalar_one_or_none()
    if user:
        user.plan = "paid"
        user.stripe_subscription_id = sub_id
        await db.commit()


async def _handle_subscription_inactive(subscription, db: AsyncSession):
    customer_id = getattr(subscription, "customer", None)
    if not customer_id:
        return
    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    user = result.scalar_one_or_none()
    if user:
        user.plan = "free"
        user.stripe_subscription_id = None
        await db.commit()
