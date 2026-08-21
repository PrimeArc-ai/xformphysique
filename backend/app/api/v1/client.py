from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse, Response

from app.api.deps import get_client_service
from app.schemas.client import (
    BodyEntriesResponse,
    BodyEntrySaveResponse,
    BodyEntryUpsert,
    CheckInsResponse,
    CheckInSaveResponse,
    CheckInUpsert,
    DashboardResponse,
    ErrorResponse,
    HealthSummaryResponse,
    MealAdherenceResponse,
    MealAdherenceUpsert,
    NutritionPlanResponse,
    PhotoResponse,
    ProfileResponse,
    ProfileSaveResponse,
    ProfileUpdate,
    ProgressPhotosResponse,
    RecipeGuideRequest,
    RecipeGuideResponse,
    WorkoutSessionResponse,
    WorkoutSessionSaveResponse,
    WorkoutSessionUpdate,
)
from app.services.client import ClientService
from app.services.photo_storage import LocalPhotoStorage


router = APIRouter(prefix="/client", tags=["Client"])
Service = Annotated[ClientService, Depends(get_client_service)]
ERROR_RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


@router.get("/dashboard", response_model=DashboardResponse, responses=ERROR_RESPONSES)
def get_dashboard(service: Service):
    return service.get_dashboard()


@router.get("/body-entries", response_model=BodyEntriesResponse, responses=ERROR_RESPONSES)
def list_body_entries(
    service: Service,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 60,
):
    return service.list_body_entries(from_date, to_date, limit)


@router.put("/body-entries/{entry_date}", response_model=BodyEntrySaveResponse, responses=ERROR_RESPONSES)
def upsert_body_entry(entry_date: date, payload: BodyEntryUpsert, service: Service):
    return service.upsert_body_entry(entry_date, payload)


@router.get("/check-ins", response_model=CheckInsResponse, responses=ERROR_RESPONSES)
def list_checkins(service: Service, limit: Annotated[int, Query(ge=1, le=52)] = 12):
    return service.list_checkins(limit)


@router.put("/check-ins/current", response_model=CheckInSaveResponse, responses=ERROR_RESPONSES)
def upsert_current_checkin(payload: CheckInUpsert, service: Service):
    return service.upsert_current_checkin(payload)


@router.get("/progress-photos", response_model=ProgressPhotosResponse, responses=ERROR_RESPONSES)
def list_progress_photos(
    service: Service,
    view: Annotated[Literal["front", "side", "back"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    return service.list_progress_photos(view, limit)


@router.post(
    "/progress-photos",
    response_model=PhotoResponse,
    responses=ERROR_RESPONSES,
)
async def create_progress_photo(
    service: Service,
    file: Annotated[UploadFile, File(description="JPEG, PNG or WebP image up to 10 MB")],
    view: Annotated[Literal["front", "side", "back"], Form()],
    captured_on: Annotated[date, Form()],
):
    if hasattr(service, "upload_progress_photo"):
        return await service.upload_progress_photo(file, view, captured_on)
    storage = LocalPhotoStorage()
    storage_key, byte_size, content_type = await storage.save(file)
    try:
        return service.create_progress_photo(
            view=view,
            captured_on=captured_on,
            file_name=file.filename or "progress-photo",
            storage_key=storage_key,
            content_type=content_type,
            byte_size=byte_size,
        )
    except Exception:
        storage.delete(storage_key)
        raise
    finally:
        await file.close()


@router.get("/progress-photos/{photo_id}/content", responses={404: {"model": ErrorResponse}})
def get_progress_photo_content(photo_id: str, service: Service):
    if hasattr(service, "get_photo_content"):
        content, media_type, file_name = service.get_photo_content(photo_id)
        return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'inline; filename="{file_name}"'})
    photo = service.get_photo(photo_id)
    path = LocalPhotoStorage().path_for(photo.storage_key)
    return FileResponse(path, media_type=photo.content_type, filename=photo.file_name)


@router.get("/nutrition/active-plan", response_model=NutritionPlanResponse, responses=ERROR_RESPONSES)
def get_active_nutrition_plan(
    service: Service,
    plan_date: Annotated[date | None, Query(alias="date")] = None,
):
    return service.get_active_nutrition_plan(plan_date or date.today())


@router.put(
    "/nutrition/meals/{meal_id}/adherence",
    response_model=MealAdherenceResponse,
    responses=ERROR_RESPONSES,
)
def upsert_meal_adherence(meal_id: str, payload: MealAdherenceUpsert, service: Service):
    return service.upsert_meal_adherence(meal_id, payload)


@router.post("/nutrition/recipe-guides", response_model=RecipeGuideResponse, responses=ERROR_RESPONSES)
def create_recipe_guide(payload: RecipeGuideRequest, service: Service):
    return service.create_recipe_guide(payload.meal_id)


@router.get("/workout-sessions/today", response_model=WorkoutSessionResponse, responses=ERROR_RESPONSES)
def get_today_workout(
    service: Service,
    session_date: Annotated[date | None, Query(alias="date")] = None,
):
    return service.get_workout_for_date(session_date or date.today())


@router.put(
    "/workout-sessions/{session_id}",
    response_model=WorkoutSessionSaveResponse,
    responses=ERROR_RESPONSES,
)
def update_workout_session(session_id: str, payload: WorkoutSessionUpdate, service: Service):
    return service.update_workout_session(session_id, payload)


@router.get("/health-summary", response_model=HealthSummaryResponse, responses=ERROR_RESPONSES)
def get_health_summary(service: Service):
    return service.health_summary()


@router.get("/profile", response_model=ProfileResponse, responses=ERROR_RESPONSES)
def get_profile(service: Service):
    return service.profile()


@router.patch("/profile", response_model=ProfileSaveResponse, responses=ERROR_RESPONSES)
def update_profile(payload: ProfileUpdate, service: Service):
    return service.update_profile(payload)
