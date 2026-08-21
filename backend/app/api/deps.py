from typing import Annotated, Any

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.db.session import get_db
from app.services.client import ClientService
from app.services.supabase_client import SupabaseClientService


def get_client_service(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> Any:
    """Use strict Supabase identity in configured environments; retain isolated SQLite tests."""

    if not settings.supabase_enabled:
        return ClientService(db=db, client_id=settings.demo_client_id)

    user = get_authenticated_user(authorization=authorization, settings=settings)
    service = SupabaseClientService(settings=settings, user=user)
    if service.workspace()["role"] != "client":
        raise APIError(403, "client_role_required", "Client workspace access is required")
    return service
