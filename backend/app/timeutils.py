"""Time helpers.

The whole application juggles three calendars:

* **UTC** – how the API timestamps are stored (``2026-01-01T00:00:00Z``).
* **Market local time** (``Europe/London``) – the delivery/settlement day and
  the day-ahead gate closure.
* **Settlement periods** – GB half-hourly periods 1..48 of a settlement date.

All conversions live here so that the rest of the code never has to guess.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
LONDON = ZoneInfo("Europe/London")

ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def parse_iso(value: str) -> datetime:
    """Parse an API timestamp (``...Z`` suffix) into an aware UTC datetime."""
    if value is None:
        raise ValueError("cannot parse None timestamp")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def to_iso(value: datetime) -> str:
    """Render an aware datetime as the canonical ``...Z`` string."""
    return value.astimezone(UTC).strftime(ISO_FORMAT)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def local_midnight_utc(local_day: date, tz: ZoneInfo = LONDON) -> datetime:
    """UTC instant of 00:00 local time on ``local_day``."""
    return datetime.combine(local_day, datetime.min.time(), tzinfo=tz).astimezone(UTC)


def local_day_bounds_utc(
    local_day: date, tz: ZoneInfo = LONDON
) -> tuple[datetime, datetime]:
    """[start, end) UTC instants of a local delivery day.

    Handles BST transitions: a local day is 23 or 25 hours long in UTC terms.
    """
    start = local_midnight_utc(local_day, tz)
    end = local_midnight_utc(local_day + timedelta(days=1), tz)
    return start, end


def local_date_of(moment: datetime, tz: ZoneInfo = LONDON) -> date:
    """Local calendar date of an instant."""
    return moment.astimezone(tz).date()


def settlement_period_of(moment: datetime, tz: ZoneInfo = LONDON) -> int:
    """GB settlement period (1..48) of an instant."""
    local = moment.astimezone(tz)
    return local.hour * 2 + local.minute // 30 + 1


def hourly_keys(start: datetime, end: datetime) -> list[datetime]:
    """Hourly bucket starts in ``[start, end)``."""
    keys: list[datetime] = []
    cursor = start.replace(minute=0, second=0, microsecond=0)
    while cursor < end:
        keys.append(cursor)
        cursor += timedelta(hours=1)
    return keys


def parse_gate_closure(raw: str) -> tuple[int, int]:
    hour, _, minute = raw.partition(":")
    return int(hour), int(minute or 0)
