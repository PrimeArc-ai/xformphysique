from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import APIError
from app.core.supabase import AuthenticatedUser, SupabaseGateway
from app.services.r2_photo_storage import R2PhotoStorage
from app.services.progress import local_today, schedule, exercise_history
from app.schemas.client import (
    BodyEntryUpsert,
    CheckInUpsert,
    MealAdherenceUpsert,
    ProfileUpdate,
    WorkoutSessionUpdate,
)

def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _next_weekday(start: date, weekday_name: str) -> date:
    weekdays = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
    return start + timedelta(days=(weekdays[weekday_name] - start.weekday()) % 7)


def _number(value: Any) -> float | None:
    return float(value) if value is not None else None


class SupabaseClientService:
    """Client API use cases over Supabase PostgREST with the caller's JWT intact."""

    def __init__(self, settings: Settings, user: AuthenticatedUser) -> None:
        self.settings = settings
        self.user = user
        self.client_id = user.id
        self.gateway = SupabaseGateway(settings, user.access_token)

    def workspace(self) -> dict[str, Any]:
        profile = self._profile_row()
        if profile["role"] == "coach":
            coach = self._one_or_none("coaches", {"id": f"eq.{self.user.id}"})
            if not coach or not coach.get("is_active"):
                raise APIError(403, "coach_inactive", "Your coach access has been suspended. Contact your administrator.")
        return {
            "id": profile["id"],
            "email": profile.get("email") or self.user.email,
            "first_name": profile["first_name"],
            "full_name": profile["full_name"],
            "role": profile["role"],
        }

    def get_dashboard(self) -> dict[str, Any]:
        client, profile = self._client_and_profile()
        today = local_today(client["timezone"])
        body = self._rows("body_entries", {"client_id": f"eq.{self.client_id}", "order": "entry_date.desc", "limit": 7})
        latest = body[0] if body else None
        checkins = self._rows("weekly_checkins", {"client_id": f"eq.{self.client_id}", "order": "period_start.desc"})
        sessions = self._rows("workout_sessions", {"client_id": f"eq.{self.client_id}", "session_date": f"gte.{today - timedelta(days=29)}"})
        logs = self._rows("workout_set_logs", {"select": "session_id,reps,load_kg"}) if sessions else []
        session_dates = {item["id"]: item["session_date"] for item in sessions}
        daily_volume: dict[str, float] = {}
        for log in logs:
            session_date = session_dates.get(log["session_id"])
            if session_date:
                daily_volume[session_date] = daily_volume.get(session_date, 0) + float(log["reps"]) * float(log["load_kg"])
        target = self._active_weight_target()
        start_weight = _number(client.get("starting_weight_kg"))
        latest_weight = _number(latest.get("weight_kg")) if latest else None
        target_progress = None
        if start_weight and latest_weight is not None and target is not None and start_weight != target:
            target_progress = max(0, min(100, round(100 * abs(latest_weight - start_weight) / abs(target - start_weight))))
        due_on = _next_weekday(today, client["check_in_day"])
        return {
            "client": {"id": self.client_id, "first_name": profile["first_name"], "primary_goal": client["primary_goal"]},
            "body": {
                "current_weight_kg": latest_weight,
                "latest_waist_cm": _number(latest.get("waist_cm")) if latest else None,
                "change_from_start_kg": round(latest_weight - start_weight, 2) if latest_weight is not None and start_weight else None,
                "target_progress_percent": target_progress,
                "trend": [{"date": item["entry_date"], "weight_kg": _number(item["weight_kg"])} for item in reversed(body)],
            },
            "check_ins": {"count": len(checkins), "status": "submitted" if checkins and checkins[0]["period_start"] == _week_start(today).isoformat() else "due"},
            "training_volume": {
                "range_days": 30,
                "total_kg": round(sum(daily_volume.values()), 2),
                "sessions": len(sessions),
                "training_days": len(daily_volume),
                "best_day_kg": round(max(daily_volume.values(), default=0), 2),
                "daily_kg": [{"date": day, "volume_kg": round(volume, 2)} for day, volume in sorted(daily_volume.items())],
            },
            "next_actions": [
                {"type": "body_entry", "label": "Log body progress", "due": not latest or latest["entry_date"] != today.isoformat()},
                {"type": "check_in", "label": "Submit weekly check-in", "due": due_on == today},
            ],
        }

    def list_body_entries(self, start: date | None, end: date | None, limit: int) -> dict[str, Any]:
        if start and end and start > end:
            raise APIError(422, "invalid_date_range", "from date cannot be after to date")
        params: dict[str, Any] = {"client_id": f"eq.{self.client_id}", "order": "entry_date.desc", "limit": limit}
        if start:
            params["entry_date"] = f"gte.{start.isoformat()}"
        if end:
            params["entry_date"] = f"lte.{end.isoformat()}"
        entries = self._rows("body_entries", params)
        return {"items": [self._body_payload(item) for item in entries], "summary": self._body_summary()}

    def upsert_body_entry(self, entry_date: date, payload: BodyEntryUpsert) -> dict[str, Any]:
        if entry_date > date.today():
            raise APIError(422, "future_date", "Body entry date cannot be in future")
        rows = self._write(
            "POST",
            "body_entries",
            {"client_id": self.client_id, "entry_date": entry_date.isoformat(), "weight_kg": payload.weight_kg, "waist_cm": payload.waist_cm},
            params={"on_conflict": "client_id,entry_date"},
            prefer="resolution=merge-duplicates,return=representation",
        )
        response = self._body_payload(rows[0])
        response["summary"] = self._body_summary()
        return response

    def today(self) -> date:
        client, _ = self._client_and_profile()
        return local_today(client["timezone"])

    def _all_rows(self, table: str, params: dict) -> list[dict]:
        result, offset = [], 0
        while True:
            page = self._rows(table, {**params, "limit": 500, "offset": offset})
            result.extend(page)
            if len(page) < 500:
                return result
            offset += 500

    def list_checkins(self, limit: int, offset: int = 0) -> dict[str, Any]:
        client, _ = self._client_and_profile()
        entries = self._all_rows("weekly_checkins", {"client_id": f"eq.{self.client_id}", "order": "period_start.desc,id.desc"})
        page = entries[offset:offset + limit]
        feedback = self._rows("weekly_checkin_feedback", {"checkin_id": "in.(" + ",".join(e["id"] for e in page) + ")"}) if page else []
        by_id = {f["checkin_id"]: f for f in feedback}
        return {
            "schedule": schedule(client, entries),
            "items": [{**self._checkin_payload(item), "feedback": by_id.get(item["id"])} for item in page],
            "has_more": len(entries) > offset + limit,
        }

    def upsert_current_checkin(self, payload: CheckInUpsert) -> dict[str, Any]:
        rows = self._write(
            "POST",
            "weekly_checkins",
            {"client_id": self.client_id, "period_start": _week_start(self.today()).isoformat(), "submitted_at": datetime.now(timezone.utc).isoformat(), **payload.model_dump()},
            params={"on_conflict": "client_id,period_start"},
            prefer="resolution=merge-duplicates,return=representation",
        )
        response = self._checkin_payload(rows[0])
        response["status"] = "submitted"
        return response

    def list_progress_photos(self, view: str | None, limit: int, offset: int = 0) -> dict[str, Any]:
        params: dict[str, Any] = {"client_id": f"eq.{self.client_id}", "deleted_at": "is.null", "order": "captured_on.desc,created_at.desc,id.desc", "limit": limit + 1, "offset": offset}
        if view:
            params["view"] = f"eq.{view}"
        rows = self._rows("progress_photos", params)
        return {"items": [self._photo_payload(item) for item in rows[:limit]], "has_more": len(rows) > limit}

    async def upload_progress_photo(self, file: UploadFile, view: str, captured_on: date, replace_photo_id: str | None = None) -> dict[str, Any]:
        if captured_on > self.today():
            raise APIError(422, "future_date", "Photo capture date cannot be in future")
        storage = R2PhotoStorage(self.settings)
        storage_path, byte_size, content_type, safe_filename = await storage.save(file, self.client_id)
        try:
            photo = self.gateway.request("POST", "/rest/v1/rpc/save_progress_photo", json={"p_photo": {"client_id": self.client_id, "view": view, "captured_on": captured_on.isoformat(), "original_filename": safe_filename, "storage_path": storage_path, "storage_provider": "r2", "content_type": content_type, "byte_size": byte_size}, "p_replace_id": replace_photo_id}).json()
        except Exception as failure:
            # A lost response may follow a successful DB commit. Never delete
            # image bytes until a read proves that no metadata references them.
            try:
                photo = self._one_or_none("progress_photos", {"client_id": f"eq.{self.client_id}", "storage_path": f"eq.{storage_path}"})
            except Exception:
                raise failure
            if photo is None:
                storage.delete(storage_path)
                raise failure
        pending = False
        if replace_photo_id:
            try:
                pending = self.delete_progress_photo(replace_photo_id)["cleanup_pending"]
            except APIError:
                pending = True
        return {**self._photo_payload(photo), "cleanup_pending": pending}

    def delete_progress_photo(self, photo_id: str) -> dict:
        photo = self.gateway.request("POST", "/rest/v1/rpc/retire_progress_photo", json={"p_client_id": self.client_id, "p_photo_id": photo_id}).json()
        pending = False
        try:
            if photo.get("storage_provider") == "r2":
                R2PhotoStorage(self.settings).delete(photo["storage_path"], strict=True)
            else:
                # Retired legacy images stay inaccessible; a storage admin can purge later.
                pending = True
        except APIError:
            pending = True
        return {"id": photo_id, "deleted": True, "cleanup_pending": pending}

    def get_photo_content(self, photo_id: str) -> tuple[bytes, str, str]:
        photo = self._one("progress_photos", {"id": f"eq.{photo_id}", "client_id": f"eq.{self.client_id}", "deleted_at": "is.null"}, "photo_not_found", "Progress photo not found")
        if photo.get("storage_provider") == "r2":
            return R2PhotoStorage(self.settings).read(photo["storage_path"]), photo["content_type"], photo["original_filename"]
        response = self.gateway.request("GET", f"/storage/v1/object/authenticated/progress-photos/{quote(photo['storage_path'])}")
        return response.content, photo["content_type"], photo["original_filename"]

    def get_active_nutrition_plan(self, plan_date: date) -> dict[str, Any]:
        plans = self._rows("nutrition_plans", {"client_id": f"eq.{self.client_id}", "status": "eq.published", "active_from": f"lte.{plan_date.isoformat()}", "order": "active_from.desc"})
        plan = next((item for item in plans if item.get("active_to") is None or item["active_to"] >= plan_date.isoformat()), None)
        if not plan:
            raise APIError(404, "nutrition_plan_not_found", "No active nutrition plan for this date")
        meals = self._rows("meals", {"plan_id": f"eq.{plan['id']}", "order": "position.asc"})
        ingredients = self._rows("meal_ingredients", {"order": "position.asc"}) if meals else []
        adherence = self._rows("meal_adherence", {"client_id": f"eq.{self.client_id}", "entry_date": f"eq.{plan_date.isoformat()}"})
        status_by_meal = {item["meal_id"]: item["status"] for item in adherence}
        ingredients_by_meal: dict[str, list[dict[str, Any]]] = {}
        for item in ingredients:
            ingredients_by_meal.setdefault(item["meal_id"], []).append({"name": item["ingredient_name"], "quantity": _number(item["quantity"]), "unit": item["unit"]})
        restrictions = self._rows("nutrition_plan_restrictions", {"plan_id": f"eq.{plan['id']}"})
        return {"plan_id": plan["id"], "name": plan["name"], "date": plan_date, "daily_targets": {"calories_kcal": int(plan["calories_kcal"]), "protein_g": int(plan["protein_g"]), "carbs_g": int(plan["carbs_g"]), "fat_g": int(plan["fat_g"])}, "restrictions": [item["restriction"] for item in restrictions], "meals": [{"id": meal["id"], "time": meal["meal_time"], "name": meal["name"], "ingredients": ingredients_by_meal.get(meal["id"], []), "calories_kcal": meal["calories_kcal"], "coach_instructions": meal.get("coach_instructions", ""), "preparation": meal.get("preparation", ""), "macros": {"protein_g": meal["protein_g"], "carbs_g": meal["carbs_g"], "fat_g": meal["fat_g"]}, "adherence_status": status_by_meal.get(meal["id"], "pending")} for meal in meals]}

    def upsert_meal_adherence(self, meal_id: str, payload: MealAdherenceUpsert) -> dict[str, Any]:
        if payload.date > self.today():
            raise APIError(422, "future_date", "Meal adherence date cannot be in future")
        self._one("meals", {"id": f"eq.{meal_id}"}, "meal_not_found", "Assigned meal not found")
        self._write("POST", "meal_adherence", {"client_id": self.client_id, "meal_id": meal_id, "entry_date": payload.date.isoformat(), "status": payload.status}, params={"on_conflict": "client_id,meal_id,entry_date"}, prefer="resolution=merge-duplicates,return=representation")
        rows = self._rows("meal_adherence", {"client_id": f"eq.{self.client_id}", "entry_date": f"eq.{payload.date.isoformat()}"})
        meals = self._rows("meals")
        return {"meal_id": meal_id, "date": payload.date, "status": payload.status, "daily_summary": {"logged_meals": len(rows), "total_meals": len(meals)}}

    def create_recipe_guide(self, meal_id: str) -> dict[str, Any]:
        meal = self._one("meals", {"id": f"eq.{meal_id}"}, "meal_not_found", "Assigned meal not found")
        ingredients = self._rows("meal_ingredients", {"meal_id": f"eq.{meal_id}", "order": "position.asc"})
        names = [item["ingredient_name"] for item in ingredients]
        guide = f"Prepare {' and '.join(names)} using assigned quantities. Serve when ready."
        self._write("POST", "recipe_guides", {"client_id": self.client_id, "meal_id": meal_id, "guide": guide})
        return {"meal_id": meal_id, "meal_name": meal["name"], "guide": guide, "uses_assigned_ingredients_only": True, "remaining_requests_today": 1}

    def get_workout_for_date(self, session_date: date) -> dict[str, Any]:
        session = self._one("workout_sessions", {"client_id": f"eq.{self.client_id}", "session_date": f"eq.{session_date.isoformat()}"}, "workout_session_not_found", "No workout session assigned for this date")
        return self._workout_payload(session)

    def update_workout_session(self, session_id: str, payload: WorkoutSessionUpdate) -> dict[str, Any]:
        session = self._one("workout_sessions", {"id": f"eq.{session_id}", "client_id": f"eq.{self.client_id}"}, "workout_session_not_found", "Workout session not found")
        exercises = self._rows("workout_exercises", {"session_id": f"eq.{session_id}"})
        allowed = {item["id"] for item in exercises}
        if payload.exercise_logs is not None:
            unknown = {item.plan_exercise_id for item in payload.exercise_logs} - allowed
            if unknown:
                raise APIError(422, "invalid_exercise_log", "Exercise does not belong to this session")
        updated = self.gateway.request("POST", "/rest/v1/rpc/save_workout_log", json={"p_session_id": session_id, "p_payload": payload.model_dump(mode="json", exclude_unset=True)}).json()
        logs = self._rows("workout_set_logs", {"session_id": f"eq.{session_id}"})
        completed = {item["workout_exercise_id"] for item in logs}
        return {"session_id": session_id, "status": updated["status"], "completed_at": updated.get("completed_at"), "volume_kg": round(sum(float(item["reps"]) * float(item["load_kg"]) for item in logs), 2), "completion_percent": round(100 * len(completed) / len(exercises)) if exercises else 0}

    def workout_history(self) -> dict:
        sessions = self._all_rows("workout_sessions", {"client_id": f"eq.{self.client_id}", "order": "session_date.asc,id.asc"})
        return exercise_history([self._workout_payload(s) for s in sessions])

    def health_summary(self) -> dict[str, Any]:
        client, _ = self._client_and_profile()
        checkins = self._rows("weekly_checkins", {"client_id": f"eq.{self.client_id}", "order": "submitted_at.desc", "limit": 1})
        context = self._one_or_none("client_coaching_context", {"client_id": f"eq.{self.client_id}"}) or {}
        latest = checkins[0] if checkins else None
        return {"wellbeing": {"energy_score": latest["energy_score"] if latest else None, "sentiment": latest["sentiment"] if latest else "not_reported", "source_check_in_id": latest["id"] if latest else None}, "planning_context": {"dietary_preferences": [client["dietary_preferences"]] if client["dietary_preferences"] else [], "allergies": [client["allergies_injuries"]] if client["allergies_injuries"] else [], "training_considerations": context.get("training_considerations", []), "coach_note": context.get("client_visible_coach_note", "")}, "safety_notice": context.get("safety_notice", "Coaching support only. Not medical advice.")}

    def profile(self) -> dict[str, Any]:
        client, profile = self._client_and_profile()
        return self._profile_payload(client, profile)

    def update_profile(self, payload: ProfileUpdate) -> dict[str, Any]:
        updates = payload.model_dump(exclude_unset=True)
        target = updates.pop("target_weight_kg", None)
        if updates:
            self._write("PATCH", "clients", updates, params={"id": f"eq.{self.client_id}"})
        if target is not None:
            existing = self._one_or_none("client_targets", {"client_id": f"eq.{self.client_id}", "metric": "eq.weight_kg", "is_active": "eq.true"})
            if existing:
                self._write("PATCH", "client_targets", {"target_value": target}, params={"id": f"eq.{existing['id']}"})
            else:
                self._write("POST", "client_targets", {"client_id": self.client_id, "metric": "weight_kg", "target_value": target, "set_by_profile_id": self.client_id})
        client, profile = self._client_and_profile()
        return {"client_id": self.client_id, "updated_at": client["updated_at"], "profile": self._profile_payload(client, profile)}

    def _client_and_profile(self) -> tuple[dict[str, Any], dict[str, Any]]:
        return self._one("clients", {"id": f"eq.{self.client_id}"}, "client_not_found", "Client workspace not found"), self._profile_row()

    def _profile_row(self) -> dict[str, Any]:
        return self._one("profiles", {"id": f"eq.{self.client_id}"}, "profile_not_found", "User profile not found")

    def _active_weight_target(self) -> float | None:
        target = self._one_or_none("client_targets", {"client_id": f"eq.{self.client_id}", "metric": "eq.weight_kg", "is_active": "eq.true"})
        return _number(target["target_value"]) if target else None

    def _body_summary(self) -> dict[str, float | None]:
        rows = self._rows("body_entries", {"client_id": f"eq.{self.client_id}", "order": "entry_date.asc"})
        if not rows:
            return {"start_weight_kg": None, "current_weight_kg": None, "change_kg": None}
        start, current = _number(rows[0]["weight_kg"]), _number(rows[-1]["weight_kg"])
        return {"start_weight_kg": start, "current_weight_kg": current, "change_kg": round(current - start, 2) if start is not None and current is not None else None}

    def _workout_payload(self, session: dict[str, Any]) -> dict[str, Any]:
        exercises = self._rows("workout_exercises", {"session_id": f"eq.{session['id']}", "order": "position.asc"})
        logs = self._rows("workout_set_logs", {"session_id": f"eq.{session['id']}", "order": "workout_exercise_id.asc,set_number.asc"})
        logs_by_exercise: dict[str, list[dict[str, Any]]] = {}
        for item in logs:
            logs_by_exercise.setdefault(item["workout_exercise_id"], []).append({"set_number": item["set_number"], "reps": item["reps"], "load_kg": _number(item["load_kg"]), "difficulty": item.get("difficulty")})
        return {"session_id": session["id"], "date": session["session_date"], "title": session["title"], "week_label": session["week_label"], "coach_note": session["coach_note"], "status": session["status"], "note": session.get("client_note"), "overall_difficulty": session.get("overall_difficulty"), "estimated_duration_minutes": session["estimated_duration_minutes"], "exercises": [{"id": item["id"], "plan_exercise_id": item["id"], "exercise_library_item_id": item.get("exercise_library_item_id"), "name": item["name"], "prescription": {"sets": item["prescribed_sets"], "reps": item["prescribed_reps"], "rest_seconds": item.get("rest_seconds"), "coach_note": item["coach_note"]}, "sets": logs_by_exercise.get(item["id"], [])} for item in exercises]}

    def _profile_payload(self, client: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
        return {"client_id": self.client_id, "name": profile["full_name"], "email": profile.get("email") or self.user.email or "", "primary_goal": client["primary_goal"], "target_weight_kg": self._active_weight_target(), "check_in_day": client["check_in_day"], "timezone": client["timezone"], "dietary_preferences": client["dietary_preferences"], "allergies_injuries": client["allergies_injuries"]}

    @staticmethod
    def _body_payload(entry: dict[str, Any]) -> dict[str, Any]:
        return {"id": entry["id"], "date": entry["entry_date"], "weight_kg": _number(entry["weight_kg"]), "waist_cm": _number(entry.get("waist_cm")), "created_at": entry["created_at"]}

    @staticmethod
    def _checkin_payload(entry: dict[str, Any]) -> dict[str, Any]:
        return {**{key: entry.get(key) for key in ("id", "period_start", "submitted_at", "energy_score", "sleep_score", "sentiment", "observation", "concern")},
                "questionnaire_version": entry.get("questionnaire_version", 1), "ratings": entry.get("ratings", {}),
                "challenges": entry.get("challenges", ""), "additional_comments": entry.get("additional_comments", "")}

    @staticmethod
    def _photo_payload(photo: dict[str, Any]) -> dict[str, Any]:
        return {"id": photo["id"], "view": photo["view"], "captured_on": photo["captured_on"], "file_name": photo["original_filename"], "content_url": f"/api/v1/client/progress-photos/{photo['id']}/content", "period_start": photo.get("period_start") or _week_start(date.fromisoformat(photo["captured_on"])).isoformat(), "uploaded_at": photo.get("created_at")}

    def _rows(self, table: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        response = self.gateway.request("GET", f"/rest/v1/{table}", params={"select": "*", **(params or {})})
        return response.json()

    def _one_or_none(self, table: str, params: dict[str, Any]) -> dict[str, Any] | None:
        rows = self._rows(table, {**params, "limit": 1})
        return rows[0] if rows else None

    def _one(self, table: str, params: dict[str, Any], code: str, message: str) -> dict[str, Any]:
        row = self._one_or_none(table, params)
        if row is None:
            raise APIError(404, code, message)
        return row

    def _write(self, method: str, table: str, payload: Any, *, params: dict[str, Any] | None = None, prefer: str = "return=representation") -> list[dict[str, Any]]:
        response = self.gateway.request(method, f"/rest/v1/{table}", params=params, json=payload, headers={"Prefer": prefer})
        return response.json()
