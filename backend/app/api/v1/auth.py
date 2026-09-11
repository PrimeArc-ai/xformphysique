from __future__ import annotations
from typing import Literal

from fastapi import APIRouter, Depends, Response

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.schemas.auth import DirectPasswordSet
from app.services.supabase_admin import set_password_by_email
from app.services.supabase_client import SupabaseClientService


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/set-password")
def set_password(
    payload: DirectPasswordSet,
    response: Response,
    settings: Settings = Depends(get_settings),
):
    """Retired endpoint; always rejects unauthenticated password replacement."""

    response.headers["Cache-Control"] = "private, no-store"
    return set_password_by_email(settings, payload)


@router.get("/me")
def get_current_workspace(
    portal: Literal["client", "coach", "admin"] | None = None,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """The selected portal is intent, never authority; compare it with the stored role."""

    if not settings.supabase_enabled:
        role = portal or "client"
        names = {
            "client": ("Maya", "Maya Shah", "maya@xform.local", "cl_001"),
            "coach": ("Aarav", "Aarav Rao", "coach@xform.local", "local-demo-coach"),
            "admin": ("Navaneet", "Navaneet Deshpande", "admin@xform.local", "local-demo-admin"),
        }
        first_name, full_name, email, identity = names[role]
        return {"id": identity, "email": email, "first_name": first_name, "full_name": full_name, "role": role}

    workspace = SupabaseClientService(settings=settings, user=user).workspace()
    if portal and workspace["role"] != portal:
        raise APIError(403, "portal_mismatch", "This account cannot access the selected portal. Choose the portal assigned to your account.")
    return workspace
