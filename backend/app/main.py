from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import update

from app.api.v1.router import api_router
from app.api.v1.admin import router as admin_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.schedule import ScheduleRun
from app.services.scheduler_jobs import start_scheduler, stop_scheduler

# Register all ORM models with SQLAlchemy metadata
import app.models.user  # noqa: F401
import app.models.schedule  # noqa: F401
import app.models.employee  # noqa: F401
import app.models.availability  # noqa: F401
import app.models.shift_definition  # noqa: F401
import app.models.shift_assignment  # noqa: F401
import app.models.clock_event  # noqa: F401  (registers ClockEvent, ClockEventAuditLog, ClockEventEditRequest)
import app.models.whatsapp_session  # noqa: F401
import app.models.availability_token  # noqa: F401

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Rescue any runs left stuck at "processing" from a previous crash or hot-reload.
    # These will never complete — mark them failed so the frontend stops polling.
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(ScheduleRun)
            .where(ScheduleRun.status == "processing")
            .values(
                status="failed",
                error_message="Solve was interrupted by a server restart. Please try again.",
            )
        )
        await db.commit()

    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="eascadeskScheduler Lite",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
