from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.client import router as client_router
from app.api.v1.coach import router as coach_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(coach_router)
router.include_router(client_router)
