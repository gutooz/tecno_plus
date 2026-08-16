from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.health.router import api_router as health_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(health_router, prefix="/health", tags=["health"])

