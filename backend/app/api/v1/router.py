from fastapi import APIRouter

from app.api.v1 import auth, availability, clock, employees, export, payments, schedules, solve, template, uploads, whatsapp

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(schedules.router)
api_router.include_router(uploads.router)
api_router.include_router(solve.router)
api_router.include_router(export.router)
api_router.include_router(template.router)
api_router.include_router(payments.router)
api_router.include_router(employees.router)
api_router.include_router(clock.router)
api_router.include_router(availability.router)
api_router.include_router(whatsapp.router, prefix="/whatsapp", tags=["whatsapp"])
