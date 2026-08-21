from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.config import Settings, get_settings
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.schemas.coach import ClientOnboardingCreate, ClientOnboardingResponse
from app.services.supabase_coach import SupabaseCoachService


router = APIRouter(prefix="/coach", tags=["Coach onboarding"])


@router.post("/clients", response_model=ClientOnboardingResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientOnboardingCreate,
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
):
    """Invite and onboard a client owned by the authenticated active coach."""

    return SupabaseCoachService(settings=settings, user=user).invite_and_onboard_client(payload)
