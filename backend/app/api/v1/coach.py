from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import Response

from app.core.config import Settings, get_settings
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.schemas.client import ErrorResponse
from app.schemas.coach import (
    ClientCoachingContextResponse,
    ClientCoachingContextUpdate,
    ClientOnboardingCreate,
    ClientOnboardingResponse,
    CoachClientListResponse,
    CoachClientReviewResponse,
)
from app.services.supabase_coach import SupabaseCoachService
from app.schemas.profile_photo import ProfilePhotoResponse
from app.services.profile_photo import ProfilePhotoService


router = APIRouter(prefix="/coach", tags=["Coach"])
ERROR_RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


@router.get("/clients", response_model=CoachClientListResponse, responses=ERROR_RESPONSES)
def list_clients(
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """List only clients actively assigned to the authenticated coach."""

    return SupabaseCoachService(settings=settings, user=user).list_clients()


@router.get("/clients/{client_id}/review", response_model=CoachClientReviewResponse, responses=ERROR_RESPONSES)
def get_client_review(
    client_id: str,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Return body and check-in data RLS authorizes this coach to review."""

    return SupabaseCoachService(settings=settings, user=user).get_client_review(client_id)


@router.get(
    "/clients/{client_id}/progress-photos/{photo_id}/content",
    responses={404: {"model": ErrorResponse}},
)
def get_client_progress_photo_content(
    client_id: str,
    photo_id: str,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Proxy one assigned client's private progress image after RLS authorization."""

    content, media_type, file_name = SupabaseCoachService(
        settings=settings, user=user
    ).get_client_progress_photo_content(client_id, photo_id)
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{file_name}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.patch(
    "/clients/{client_id}/coaching-context",
    response_model=ClientCoachingContextResponse,
    responses=ERROR_RESPONSES,
)
def update_client_coaching_context(
    client_id: str,
    payload: ClientCoachingContextUpdate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Update guidance visible only to the assigned client and coach."""

    return SupabaseCoachService(settings=settings, user=user).update_client_coaching_context(client_id, payload)


@router.post(
    "/clients",
    response_model=ClientOnboardingResponse,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def create_client(
    payload: ClientOnboardingCreate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Invite and onboard a client owned by the authenticated active coach."""

    return SupabaseCoachService(settings=settings, user=user).invite_and_onboard_client(payload)


@router.get("/profile/photo", response_model=ProfilePhotoResponse, responses=ERROR_RESPONSES)
def get_profile_photo(
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Return the authenticated coach's profile-photo metadata only."""

    return ProfilePhotoService(settings, user).get_photo("coach")


@router.post("/profile/photo", response_model=ProfilePhotoResponse, responses=ERROR_RESPONSES)
async def upload_profile_photo(
    file: UploadFile = File(description="JPEG, PNG or WebP image up to 2 MB"),
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Store one compact, private avatar for the authenticated coach."""

    try:
        photo = await ProfilePhotoService(settings, user).upload_photo(file, "coach")
        return {"photo": photo}
    finally:
        await file.close()


@router.get("/profile/photo/content", responses={404: {"model": ErrorResponse}})
def get_profile_photo_content(
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    content, media_type, file_name = ProfilePhotoService(settings, user).get_photo_content("coach")
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{file_name}"',
            "Cache-Control": "private, no-store",
        },
    )
