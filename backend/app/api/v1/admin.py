from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.core.config import Settings, get_settings
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.schemas.admin import (
    AdminCoachList,
    CoachCreate,
    CoachCreated,
    CoachOffboarded,
    CoachPasswordReset,
    MinimalClientList,
)
from app.services.supabase_admin import SupabaseAdminService

router = APIRouter(prefix="/admin", tags=["Admin"])


def service(response: Response, settings: Settings = Depends(get_settings), user: AuthenticatedUser = Depends(get_authenticated_user)):
    response.headers["Cache-Control"] = "private, no-store"
    return SupabaseAdminService(settings, user)


@router.get("/coaches", response_model=AdminCoachList)
def list_coaches(admin: SupabaseAdminService = Depends(service)):
    return admin.list_coaches()


@router.post("/coaches", response_model=CoachCreated, status_code=201)
def create_coach(payload: CoachCreate, admin: SupabaseAdminService = Depends(service)):
    """Create a coach; show an initial password once. No email delivery is implied."""
    return admin.create_coach(payload)


@router.get("/coaches/{coach_id}/clients", response_model=MinimalClientList)
def coach_clients(coach_id: UUID, admin: SupabaseAdminService = Depends(service)):
    """Pseudonymous assignment records only; never client profiles or health data."""
    return admin.coach_clients(coach_id)


@router.post("/coaches/{coach_id}/offboard", response_model=CoachOffboarded)
def offboard_coach(coach_id: UUID, admin: SupabaseAdminService = Depends(service)):
    """Suspend access and end assignments atomically; preserve all client records."""
    return admin.offboard_coach(coach_id)


@router.post("/coaches/{coach_id}/reset-password", response_model=CoachPasswordReset)
def reset_coach_password(coach_id: UUID, admin: SupabaseAdminService = Depends(service)):
    """Keep the same login email; return a new password once. No email is sent."""
    return admin.reset_password(coach_id)
