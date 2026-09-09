"""In-memory admin roster for local demo only. Not used when Supabase is configured."""

from copy import deepcopy
import secrets
from uuid import UUID

from app.core.errors import APIError

AISHA = UUID("11111111-1111-4111-8111-111111111111")
AARAV = UUID("22222222-2222-4222-8222-222222222222")
PRIYA = UUID("33333333-3333-4333-8333-333333333333")
ROHAN = UUID("44444444-4444-4444-8444-444444444444")

_COACHES = [
    {
        "id": AISHA,
        "full_name": "Aisha Kapoor",
        "email": "aisha.kapoor.coach@xform.local",
        "professional_title": "Senior Transformation Coach",
        "is_active": True,
        "created_at": "2026-08-26T12:00:00+00:00",
        "active_client_count": 1,
    },
    {
        "id": AARAV,
        "full_name": "Aarav Rao",
        "email": "aarav.rao.coach@xform.local",
        "professional_title": "Strength Coach",
        "is_active": True,
        "created_at": "2026-08-28T09:30:00+00:00",
        "active_client_count": 1,
    },
    {
        "id": PRIYA,
        "full_name": "Priya Mehta",
        "email": "priya.mehta.qa@xform.local",
        "professional_title": "Strength Coach - QA account",
        "is_active": False,
        "created_at": "2026-09-01T14:15:00+00:00",
        "active_client_count": 0,
    },
    {
        "id": ROHAN,
        "full_name": "Rohan Iyer",
        "email": "rohan.iyer.qa@xform.local",
        "professional_title": "Fitness Coach",
        "is_active": False,
        "created_at": "2026-09-06T08:00:00+00:00",
        "active_client_count": 0,
    },
]

_CLIENTS = {
    AISHA: [
        {
            "client_code": "XP-0005",
            "assigned_at": "2026-08-26T12:10:00+00:00",
            "ended_at": None,
        }
    ],
    AARAV: [
        {
            "client_code": "XP-0010",
            "assigned_at": "2026-08-28T09:40:00+00:00",
            "ended_at": None,
        }
    ],
}


def list_coaches() -> dict:
    return {"items": deepcopy(_COACHES)}


def coach_clients(coach_id: UUID) -> dict:
    return {"items": deepcopy(_CLIENTS.get(coach_id, []))}


def reset_password(coach_id: UUID) -> dict:
    coach = next((item for item in _COACHES if item["id"] == coach_id), None)
    if coach is None:
        raise APIError(404, "coach_not_found", "Coach not found")
    return {
        "id": coach["id"],
        "full_name": coach["full_name"],
        "email": coach["email"],
        "initial_password": f"Xf!9{secrets.token_urlsafe(18)}",
        "email_sent": False,
        "audit_recorded": True,
    }
