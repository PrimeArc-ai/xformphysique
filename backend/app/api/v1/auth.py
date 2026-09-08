from __future__ import annotations
from typing import Literal

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.services.supabase_client import SupabaseClientService


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me")
def get_current_workspace(
    portal: Literal["client", "coach", "admin"] | None = None,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """The selected portal is intent, never authority; compare it with the stored role."""

    workspace = SupabaseClientService(settings=settings, user=user).workspace()
    if portal and workspace["role"] != portal:
        raise APIError(403, "portal_mismatch", "This account cannot access the selected portal. Choose the portal assigned to your account.")
    return workspace
