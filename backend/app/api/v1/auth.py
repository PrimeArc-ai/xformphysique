from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.services.supabase_client import SupabaseClientService


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me")
def get_current_workspace(
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
):
    """Return the server-read role for the current session; the UI never chooses a role."""

    return SupabaseClientService(settings=settings, user=user).workspace()
