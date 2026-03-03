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
    STRIPE_SUCCESS_URL: str = "https://schedule-lite.eascadesk.ie/?payment=success"
    STRIPE_CANCEL_URL: str = "https://schedule-lite.eascadesk.ie/pricing?payment=cancelled"

    SOLVER_TIMEOUT_SECONDS: int = 30

    # Comma-separated allowed CORS origins.
    # e.g. "https://d123.cloudfront.net,http://localhost:5173"
    ALLOWED_ORIGINS: str = "http://localhost:5173, https://schedule-lite.eascadesk.ie"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
