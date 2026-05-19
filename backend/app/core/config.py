from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://lite:lite@localhost:5432/litescheduler"

    SECRET_KEY: str = "change-me-to-a-long-random-string-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    STRIPE_SECRET_KEY: str = "sk_test_PLACEHOLDER"
    STRIPE_WEBHOOK_SECRET: str = "whsec_PLACEHOLDER"
    STRIPE_PRICE_ID: str = "price_PLACEHOLDER"
    STRIPE_SUCCESS_URL: str = "https://scheduler-lite.eascadesk.ie/?payment=success"
    STRIPE_CANCEL_URL: str = "https://scheduler-lite.eascadesk.ie/pricing?payment=cancelled"

    SOLVER_TIMEOUT_SECONDS: int = 30
    # Max concurrent solves across all users.
    # 1 = queue solves sequentially (safe on single-core / low-RAM hosts).
    # Increase to 2-4 when you have spare CPU cores.
    SOLVER_PARALLEL_COUNT: int = 1

    ADMIN_EMAIL: str = ""

    # ── Meta (WhatsApp Business) bot ─────────────────────────────────────────
    # Phone Number ID from Meta Developer Console → WhatsApp → API Setup
    META_PHONE_NUMBER_ID: str = ""
    # Permanent system user access token (or temporary token for dev)
    META_ACCESS_TOKEN: str = ""
    # Any string you choose — set the same value in Meta webhook config
    META_WEBHOOK_VERIFY_TOKEN: str = ""
    # App Secret from Meta Developer Console → App Settings → Basic
    # Used to verify X-Hub-Signature-256 on inbound webhooks
    META_APP_SECRET: str = ""
    # Set to "true" to skip webhook signature validation (local dev / ngrok)
    META_SKIP_SIGNATURE: str = "false"

    # Comma-separated allowed CORS origins.
    # e.g. "https://d123.cloudfront.net,http://localhost:5173"
    ALLOWED_ORIGINS: str = "http://localhost:5173,https://scheduler-lite.eascadesk.ie"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
