"""Stripe checkout, portal, and webhook helpers."""

import stripe

from app.core.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(user_id: str, email: str, customer_id: str | None) -> str:
    """Create a Stripe checkout session and return the URL."""
    kwargs: dict = {
        "mode": "subscription",
        "line_items": [{"price": settings.STRIPE_PRICE_ID, "quantity": 1}],
        "success_url": settings.STRIPE_SUCCESS_URL,
        "cancel_url": settings.STRIPE_CANCEL_URL,
        "metadata": {"user_id": user_id},
        "allow_promotion_codes": True,
    }
    if customer_id:
        kwargs["customer"] = customer_id
    else:
        kwargs["customer_email"] = email

    session = stripe.checkout.Session.create(**kwargs)
    return session.url


def create_portal_session(customer_id: str) -> str:
    """Create a Stripe customer portal session and return the URL."""
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=settings.STRIPE_CANCEL_URL.rsplit("?", 1)[0],  # app root
    )
    return session.url


def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event:
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )
