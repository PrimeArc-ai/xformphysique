from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status, Query
from fastapi.responses import Response

from app.core.config import Settings, get_settings
from app.core.supabase import AuthenticatedUser, get_authenticated_user
from app.schemas.client import (
    CheckInsResponse,
    ErrorResponse,
    FoundationIntakeResponse,
    ProgressPhotosResponse,
    WeeklyFeedback,
)
from app.schemas.coach import (
    AuditEventList,
    ClientCoachingContextResponse,
    ClientCoachingContextUpdate,
    ClientOnboardingCreate,
    ClientOnboardingResponse,
    ClientSetup,
    ClientSetupResponse,
    CoachClientListResponse,
    CoachClientReviewResponse,
    CoachLibrariesResponse,
    CoachPrivateNote,
    CoachSettingsResponse,
    CoachSettingsUpdate,
    ExerciseLibraryCreate,
    ExerciseLibraryItem,
    ExerciseLibraryUpdate,
    FoodLibraryCreate,
    FoodLibraryItem,
    FoodLibraryUpdate,
    PrivateNoteCreate,
)
from app.schemas.nutrition_plan import (
    NutritionPlanDraftResponse,
    NutritionPlanPublishRequest,
    NutritionPlanPublishResponse,
    NutritionPlanSnapshot,
    NutritionPlanWorkspaceResponse,
)
from app.schemas.profile_photo import ProfilePhotoResponse
from app.schemas.workout_program import (
    WorkoutProgramPublishRequest,
    WorkoutProgramPublishResponse,
    WorkoutProgramResponse,
    WorkoutProgramSnapshot,
    WorkoutProgramWorkspaceResponse,
)
from app.services.nutrition_plan import NutritionPlanService
from app.services.profile_photo import ProfilePhotoService
from app.services.supabase_coach import SupabaseCoachService
from app.services.workout_program import WorkoutProgramService


router = APIRouter(prefix="/coach", tags=["Coach"])
ERROR_RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
}


@router.get("/clients/{client_id}/check-ins", response_model=CheckInsResponse)
def client_checkins(client_id: str, limit: int = Query(12, ge=1, le=52), offset: int = Query(0, ge=0),
                    settings: Settings = Depends(get_settings), user: AuthenticatedUser = Depends(get_authenticated_user)):
    return SupabaseCoachService(settings, user).progress_service(client_id).list_checkins(limit, offset)


@router.put("/clients/{client_id}/check-ins/{checkin_id}/feedback")
def weekly_feedback(client_id: str, checkin_id: str, payload: WeeklyFeedback,
                    settings: Settings = Depends(get_settings), user: AuthenticatedUser = Depends(get_authenticated_user)):
    return SupabaseCoachService(settings, user).save_weekly_feedback(client_id, checkin_id, payload)


@router.get("/clients/{client_id}/workout-history")
def workout_history(client_id: str, settings: Settings = Depends(get_settings), user: AuthenticatedUser = Depends(get_authenticated_user)):
    return SupabaseCoachService(settings, user).progress_service(client_id).workout_history()


@router.get(
    "/clients/{client_id}/foundation-intake",
    response_model=FoundationIntakeResponse,
    responses=ERROR_RESPONSES,
)
def client_foundation_intake(
    client_id: str,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return SupabaseCoachService(settings, user).get_foundation_intake(client_id)


@router.get("/clients/{client_id}/progress-photos", response_model=ProgressPhotosResponse)
def client_photos(client_id: str, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                  settings: Settings = Depends(get_settings), user: AuthenticatedUser = Depends(get_authenticated_user)):
    result = SupabaseCoachService(settings, user).progress_service(client_id).list_progress_photos(None, limit, offset)
    for photo in result["items"]:
        photo["content_url"] = f"/api/v1/coach/clients/{client_id}/progress-photos/{photo['id']}/content"
    return result


@router.delete("/clients/{client_id}/progress-photos/{photo_id}")
def delete_client_photo(client_id: str, photo_id: str, settings: Settings = Depends(get_settings), user: AuthenticatedUser = Depends(get_authenticated_user)):
    return SupabaseCoachService(settings, user).progress_service(client_id).delete_progress_photo(photo_id)


@router.get("/clients", response_model=CoachClientListResponse, responses=ERROR_RESPONSES)
def list_clients(
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """List only clients actively assigned to the authenticated coach."""

    return SupabaseCoachService(settings=settings, user=user).list_clients()


@router.get(
    "/clients/{client_id}/workout-program",
    response_model=WorkoutProgramWorkspaceResponse,
    responses=ERROR_RESPONSES,
)
def get_workout_program(
    client_id: str,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return WorkoutProgramService(settings, user).get_workspace(client_id)


@router.put(
    "/clients/{client_id}/workout-program/draft",
    response_model=WorkoutProgramResponse,
    responses=ERROR_RESPONSES,
)
def save_workout_program_draft(
    client_id: str,
    payload: WorkoutProgramSnapshot,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return WorkoutProgramService(settings, user).save_draft(client_id, payload)


@router.post(
    "/clients/{client_id}/workout-program/publish",
    response_model=WorkoutProgramPublishResponse,
    responses=ERROR_RESPONSES,
)
def publish_workout_program(
    client_id: str,
    payload: WorkoutProgramPublishRequest,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return WorkoutProgramService(settings, user).publish(
        client_id,
        payload.publish_key,
        payload.program,
    )


@router.get(
    "/clients/{client_id}/nutrition-plan",
    response_model=NutritionPlanWorkspaceResponse,
    responses=ERROR_RESPONSES,
)
def get_nutrition_plan(
    client_id: str,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return NutritionPlanService(settings, user).get_workspace(client_id)


@router.put(
    "/clients/{client_id}/nutrition-plan/draft",
    response_model=NutritionPlanDraftResponse,
    responses=ERROR_RESPONSES,
)
def save_nutrition_plan_draft(
    client_id: str,
    payload: NutritionPlanSnapshot,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return NutritionPlanService(settings, user).save_draft(client_id, payload)


@router.post(
    "/clients/{client_id}/nutrition-plan/publish",
    response_model=NutritionPlanPublishResponse,
    responses=ERROR_RESPONSES,
)
def publish_nutrition_plan(
    client_id: str,
    payload: NutritionPlanPublishRequest,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    return NutritionPlanService(settings, user).publish(
        client_id,
        payload.publish_key,
        payload.plan,
    )


@router.get("/clients/{client_id}/review", response_model=CoachClientReviewResponse, responses=ERROR_RESPONSES)
def get_client_review(
    client_id: str,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Return body and check-in data RLS authorizes this coach to review."""

    return SupabaseCoachService(settings=settings, user=user).get_client_review(client_id)


@router.post(
    "/clients/{client_id}/private-notes",
    response_model=CoachPrivateNote,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def create_private_note(
    client_id: str,
    payload: PrivateNoteCreate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Append a coach-only private note for an assigned client."""

    return SupabaseCoachService(settings=settings, user=user).save_private_note(client_id, payload)


@router.patch(
    "/clients/{client_id}/setup",
    response_model=ClientSetupResponse,
    responses=ERROR_RESPONSES,
)
def update_client_setup(
    client_id: str,
    payload: ClientSetup,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Persist client setup owned by the assigned coach."""

    return SupabaseCoachService(settings=settings, user=user).save_setup(client_id, payload)


@router.get("/libraries", response_model=CoachLibrariesResponse, responses=ERROR_RESPONSES)
def list_libraries(
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Return the authenticated coach's food and exercise libraries, including inactive items."""

    return SupabaseCoachService(settings=settings, user=user).list_libraries()


@router.post(
    "/libraries/food",
    response_model=FoodLibraryItem,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def create_food_library_item(
    payload: FoodLibraryCreate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Create a food library item owned by the authenticated coach."""

    return SupabaseCoachService(settings=settings, user=user).create_food_item(payload)


@router.patch(
    "/libraries/food/{item_id}",
    response_model=FoodLibraryItem,
    responses=ERROR_RESPONSES,
)
def update_food_library_item(
    item_id: str,
    payload: FoodLibraryUpdate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Edit or disable a food library item owned by the authenticated coach."""

    return SupabaseCoachService(settings=settings, user=user).update_food_item(item_id, payload)


@router.post(
    "/libraries/exercises",
    response_model=ExerciseLibraryItem,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
)
def create_exercise_library_item(
    payload: ExerciseLibraryCreate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Create an exercise library item owned by the authenticated coach."""

    return SupabaseCoachService(settings=settings, user=user).create_exercise_item(payload)


@router.patch(
    "/libraries/exercises/{item_id}",
    response_model=ExerciseLibraryItem,
    responses=ERROR_RESPONSES,
)
def update_exercise_library_item(
    item_id: str,
    payload: ExerciseLibraryUpdate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Edit or disable an exercise library item owned by the authenticated coach."""

    return SupabaseCoachService(settings=settings, user=user).update_exercise_item(item_id, payload)


@router.get("/settings", response_model=CoachSettingsResponse, responses=ERROR_RESPONSES)
def get_coach_settings(
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Return this coach's settings, creating the owner row with defaults if missing."""

    return SupabaseCoachService(settings=settings, user=user).get_settings()


@router.put("/settings", response_model=CoachSettingsResponse, responses=ERROR_RESPONSES)
def save_coach_settings(
    payload: CoachSettingsUpdate,
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """Persist coach-wide units, check-in day, thresholds and enabled measurements."""

    return SupabaseCoachService(settings=settings, user=user).save_settings(payload)


@router.get("/audit-events", response_model=AuditEventList, responses=ERROR_RESPONSES)
def list_audit_events(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    settings: Settings = Depends(get_settings),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    """List audit events this coach recorded. Other coaches' rows are never returned."""

    return SupabaseCoachService(settings=settings, user=user).list_audit_events(limit, offset)


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
