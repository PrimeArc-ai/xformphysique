"""Shared, deterministic progress calculations; no database or transport access."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

RATING_KEYS = ("energy", "sleep_quality", "hunger", "digestion", "stress", "recovery",
               "strength", "workout_performance", "motivation", "adherence", "overall_wellbeing")
PHOTO_VIEWS = ("front", "back", "side", "front_double_bicep", "back_double_bicep")


def local_today(zone: str, now: datetime | None = None) -> date:
    try:
        tz = ZoneInfo(zone or "UTC")
    except ZoneInfoNotFoundError:
        tz = timezone.utc  # Existing invalid zones remain readable; new writes are validated.
    return (now or datetime.now(timezone.utc)).astimezone(tz).date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def schedule(client: dict, entries: list[dict], now: datetime | None = None) -> dict:
    today = local_today(client.get("timezone", "UTC"), now)
    period = week_start(today)
    days = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    weekday = days.index(client.get("check_in_day", "sunday"))
    due = period + timedelta(days=weekday)
    submitted = {str(item["period_start"])[:10] for item in entries}
    created_value = str(client.get("created_at") or today)
    if len(created_value) > 10:
        created_at = datetime.fromisoformat(created_value.replace("Z", "+00:00"))
        # SQLite retains the UTC value but drops its timezone annotation.
        created = local_today(client.get("timezone", "UTC"), created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else created_at)
    else:
        created = date.fromisoformat(created_value)
    first = week_start(created) + timedelta(days=weekday)
    if first < created:
        first += timedelta(days=7)
    missed, cursor = [], first
    while cursor < today:
        if week_start(cursor).isoformat() not in submitted:
            missed.append(cursor.isoformat())
        cursor += timedelta(days=7)
    consecutive, cursor = 0, due if due < today else due - timedelta(days=7)
    while cursor >= first and week_start(cursor).isoformat() not in submitted:
        consecutive += 1
        cursor -= timedelta(days=7)
    done = period.isoformat() in submitted
    return {"timezone": client.get("timezone", "UTC"), "today": today.isoformat(),
            "day_of_week": days[weekday], "period_start": period.isoformat(),
            "current_status": "submitted" if done else "overdue" if today > due else "due" if today == due else "upcoming",
            "due_on": due.isoformat(), "next_due_on": (due + timedelta(days=7)).isoformat(),
            "previous_due_on": (due - timedelta(days=7)).isoformat(),
            "missed_due_dates": missed, "missed_count": len(missed),
            "consecutive_missed": consecutive,
            "previous_submitted_on": max((str(e["submitted_at"]) for e in entries), default=None)}


def exercise_history(sessions: list[dict]) -> dict:
    """Library identity when available, normalized name fallback for legacy sessions."""
    groups = {}
    for session in sessions:
        for exercise in session["exercises"]:
            sets = exercise.get("sets", [])
            if not sets:
                continue
            key = exercise.get("exercise_library_item_id") or "name:" + " ".join(exercise["name"].lower().split())
            group = groups.setdefault(key, {"id": key, "name": exercise["name"], "history": []})
            group["history"].append({"session_id": session["session_id"], "date": str(session["date"]),
                "status": session["status"], "exercise_id": exercise["plan_exercise_id"], "sets": sets,
                "volume_kg": round(sum(float(s["load_kg"]) * s["reps"] for s in sets), 2),
                "reps": sum(s["reps"] for s in sets), "load_kg": max(float(s["load_kg"]) for s in sets)})
    for group in groups.values():
        group["history"].sort(key=lambda row: (row["date"], row["session_id"]))
        weeks = {}
        for row in group["history"]:
            week = week_start(date.fromisoformat(row["date"])).isoformat()
            point = weeks.setdefault(week, {"week": week, "load_kg": 0, "reps": 0, "volume_kg": 0, "dates": set()})
            point["load_kg"] = max(point["load_kg"], row["load_kg"])
            point["reps"] += row["reps"]
            point["volume_kg"] = round(point["volume_kg"] + row["volume_kg"], 2)
            point["dates"].add(row["date"])
        group["weeks"] = [{**{k: v for k, v in p.items() if k != "dates"}, "training_days": len(p["dates"])} for p in weeks.values()]
        group["best_set"] = max(({**s, "date": r["date"]} for r in group["history"] for s in r["sets"]), key=lambda s: (float(s["load_kg"]), s["reps"]))
        group["training_days"] = len({r["date"] for r in group["history"]})
        group["trends"] = {}
        for metric in ("load_kg", "reps", "volume_kg"):
            points = group["weeks"]
            change = points[-1][metric] - points[-2][metric] if len(points) > 1 else None
            group["trends"][metric] = "insufficient_data" if change is None else "increasing" if change > 0 else "decreasing" if change < 0 else "stable"
    return {"items": sorted(groups.values(), key=lambda g: g["name"]), "basis": "Saved sets, including in-progress sessions; missing weeks are not zero."}
