from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app


def test_client_api_contract_end_to_end():
    today = date.today().isoformat()
    with TestClient(app) as client:
        # 1. Client dashboard
        dashboard = client.get("/api/v1/client/dashboard")
        assert dashboard.status_code == 200
        assert dashboard.json()["client"]["id"] == "cl_001"

        # 2–3. Body-history read and idempotent daily upsert
        entries = client.get(f"/api/v1/client/body-entries?from={today}&limit=10")
        assert entries.status_code == 200
        body_saved = client.put(
            f"/api/v1/client/body-entries/{today}",
            json={"weight_kg": 68.4, "waist_cm": 71.0},
        )
        assert body_saved.status_code == 200
        assert body_saved.json()["summary"]["latest_weight_kg"] == 68.4

        # 4–5. Weekly check-in history and current-cycle submit
        checkins = client.get("/api/v1/client/check-ins?limit=12")
        assert checkins.status_code == 200
        checkin_saved = client.put(
            "/api/v1/client/check-ins/current",
            json={
                "energy_score": 4,
                "sleep_score": 3,
                "sentiment": "good",
                "observation": "Training and meals felt consistent.",
                "concern": "Right knee after long walks.",
            },
        )
        assert checkin_saved.status_code == 200
        assert checkin_saved.json()["status"] == "submitted"

        # 6–8. Photo metadata, multipart upload, and protected bytes
        photos = client.get("/api/v1/client/progress-photos?view=front&limit=50")
        assert photos.status_code == 200
        uploaded = client.post(
            "/api/v1/client/progress-photos",
            data={"view": "front", "captured_on": today},
            files={"file": ("front.png", b"not-a-real-png-but-valid-upload-contract", "image/png")},
        )
        assert uploaded.status_code == 200
        photo = uploaded.json()
        content = client.get(photo["content_url"])
        assert content.status_code == 200
        assert content.headers["content-type"] == "image/png"

        # 9–11. Assigned nutrition plan, adherence, and restricted recipe guide
        plan = client.get(f"/api/v1/client/nutrition/active-plan?date={today}")
        assert plan.status_code == 200
        meal_id = plan.json()["meals"][0]["id"]
        adherence = client.put(
            f"/api/v1/client/nutrition/meals/{meal_id}/adherence",
            json={"date": today, "status": "followed"},
        )
        assert adherence.status_code == 200
        recipe = client.post("/api/v1/client/nutrition/recipe-guides", json={"meal_id": meal_id})
        assert recipe.status_code == 200
        assert recipe.json()["uses_assigned_ingredients_only"] is True

        # 12–13. Assigned workout and client-owned logging
        workout = client.get(f"/api/v1/client/workout-sessions/today?date={today}")
        assert workout.status_code == 200
        workout_data = workout.json()
        session_saved = client.put(
            f"/api/v1/client/workout-sessions/{workout_data['session_id']}",
            json={
                "status": "completed",
                "overall_difficulty": "moderate",
                "note": "Good session.",
                "exercise_logs": [
                    {
                        "plan_exercise_id": workout_data["exercises"][0]["plan_exercise_id"],
                        "sets": [
                            {"set_number": 1, "reps": 10, "load_kg": 20, "difficulty": "moderate"}
                        ],
                    }
                ],
            },
        )
        assert session_saved.status_code == 200
        assert session_saved.json()["volume_kg"] == 200

        # 14–16. Health context and editable client profile
        health = client.get("/api/v1/client/health-summary")
        assert health.status_code == 200
        assert "medical advice" in health.json()["safety_notice"].lower()
        profile = client.get("/api/v1/client/profile")
        assert profile.status_code == 200
        profile_saved = client.patch(
            "/api/v1/client/profile",
            json={"target_weight_kg": 65.0, "check_in_day": "sunday"},
        )
        assert profile_saved.status_code == 200
        assert profile_saved.json()["profile"]["target_weight_kg"] == 65.0

        future_date = (date.today() + timedelta(days=1)).isoformat()
        rejected = client.put(
            f"/api/v1/client/body-entries/{future_date}",
            json={"weight_kg": 68.4},
        )
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "future_date"
        assert rejected.headers["x-request-id"]
