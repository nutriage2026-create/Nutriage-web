import httpx
from app.config import settings

BASE = "https://api.cal.com/v2"


def _headers():
    return {
        "Authorization": f"Bearer {settings.CALCOM_API_KEY}",
        "cal-api-version": "2024-06-14",
        "Content-Type": "application/json",
    }


def get_event_types() -> dict:
    with httpx.Client(timeout=15) as c:
        r = c.get(f"{BASE}/event-types", headers=_headers())
        r.raise_for_status()
        return r.json()


def get_available_slots(event_type_id: str, start: str, end: str) -> dict:
    """
    start / end: ISO-8601, ej '2026-05-01T00:00:00Z'
    """
    with httpx.Client(timeout=15) as c:
        r = c.get(
            f"{BASE}/slots/available",
            headers=_headers(),
            params={"eventTypeId": event_type_id, "startTime": start, "endTime": end},
        )
        r.raise_for_status()
        return r.json()


def get_bookings(status: str = "upcoming", limit: int = 20) -> dict:
    with httpx.Client(timeout=15) as c:
        r = c.get(
            f"{BASE}/bookings",
            headers=_headers(),
            params={"status": status, "limit": limit},
        )
        r.raise_for_status()
        return r.json()


def create_booking(event_type_id: str, start: str, name: str, email: str, notes: str = "") -> dict:
    payload = {
        "eventTypeId": int(event_type_id),
        "start": start,
        "responses": {"name": name, "email": email},
        "timeZone": "America/Mexico_City",
        "language": "es",
        "metadata": {"notes": notes} if notes else {},
    }
    with httpx.Client(timeout=15) as c:
        r = c.post(f"{BASE}/bookings", headers=_headers(), json=payload)
        if not r.is_success:
            raise Exception(f"Cal.com {r.status_code}: {r.text[:400]}")
        return r.json()
