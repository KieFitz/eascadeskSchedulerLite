from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://lite:lite@localhost:5432/litescheduler"

    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    STRIPE_SECRET_KEY: str = "sk_test_PLACEHOLDER"
    STRIPE_WEBHOOK_SECRET: str = "whsec_PLACEHOLDER"
    STRIPE_PRICE_ID: str = "price_PLACEHOLDER"
    STRIPE_SUCCESS_URL: str = "http://localhost:5173/?payment=success"
    STRIPE_CANCEL_URL: str = "http://localhost:5173/?payment=cancelled"

    SOLVER_TIMEOUT_SECONDS: int = 30

    FRONTEND_URL: str = "http://localhost:5173"


settings = Settings()
