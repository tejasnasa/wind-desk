"""Decision-time forecast selection.

The day-ahead auction closes at gate closure (11:00 local on D-1 by default).
At that moment the desk only has the forecast vintages published *before* the
cut-off.  This module implements that rule in one place so the API, the tests
and the documentation cannot drift apart.

Rule (inclusive on the boundary):

    selected = max { publish : publish <= cutoff and publish covers D }

If no publication fully covers the delivery day, the latest publication with
*any* coverage is used and the response reports the gap explicitly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ..timeutils import UTC


@dataclass(frozen=True)
class PublishSelection:
    """Outcome of the decision-time selection."""

    publish_time: datetime | None
    cutoff: datetime
    available_publishes: list[datetime] = field(default_factory=list)
    covered_hours: int = 0
    expected_hours: int = 0
    complete: bool = False
    note: str | None = None

    @property
    def coverage_ratio(self) -> float:
        if not self.expected_hours:
            return 0.0
        return self.covered_hours / self.expected_hours

    def as_dict(self) -> dict:
        return {
            "publish_time": self.publish_time.isoformat()
            if self.publish_time
            else None,
            "cutoff": self.cutoff.isoformat(),
            "available_publishes": [p.isoformat() for p in self.available_publishes],
            "covered_hours": self.covered_hours,
            "expected_hours": self.expected_hours,
            "coverage_ratio": round(self.coverage_ratio, 4),
            "complete": self.complete,
            "note": self.note,
        }


def decision_cutoff(
    delivery_date: date,
    gate_closure: time,
    tz: ZoneInfo,
    days_before: int = 1,
) -> datetime:
    """UTC instant of the gate closure for ``delivery_date``.

    The auction closes at ``gate_closure`` local time on D-``days_before``.
    """
    decision_day = delivery_date - timedelta(days=days_before)
    local = datetime.combine(decision_day, gate_closure, tzinfo=tz)
    return local.astimezone(UTC)


def delivery_day_hours(delivery_date: date, tz: ZoneInfo) -> list[datetime]:
    """UTC hour starts whose *local* date equals ``delivery_date``.

    Returns 23, 24 or 25 entries depending on the BST transition.
    """
    from ..timeutils import local_day_bounds_utc

    start, end = local_day_bounds_utc(delivery_date, tz)
    hours: list[datetime] = []
    cursor = start.replace(minute=0, second=0, microsecond=0)
    while cursor < end:
        hours.append(cursor)
        cursor += timedelta(hours=1)
    return hours


def select_publish(
    vintages: dict[datetime, dict[datetime, float]],
    delivery_hours: list[datetime],
    cutoff: datetime,
) -> PublishSelection:
    """Pick the forecast vintage a buyer would have had at ``cutoff``."""
    wanted = set(delivery_hours)
    expected = len(wanted)

    available: list[datetime] = []
    covered_by_publish: dict[datetime, int] = {}
    for publish_time, series in vintages.items():
        if publish_time > cutoff:
            continue
        covered = len(wanted & set(series))
        if covered == 0:
            continue
        available.append(publish_time)
        covered_by_publish[publish_time] = covered

    available.sort()
    if not available:
        return PublishSelection(
            publish_time=None,
            cutoff=cutoff,
            available_publishes=[],
            covered_hours=0,
            expected_hours=expected,
            complete=False,
            note="No forecast publication was available at the decision cut-off.",
        )

    complete = [p for p in available if covered_by_publish[p] == expected]
    if complete:
        selected = complete[-1]
        note = None
    else:
        selected = available[-1]
        note = (
            f"Latest available publication covers only {covered_by_publish[selected]} of "
            f"{expected} hours of the delivery day."
        )

    return PublishSelection(
        publish_time=selected,
        cutoff=cutoff,
        available_publishes=available,
        covered_hours=covered_by_publish[selected],
        expected_hours=expected,
        complete=bool(complete),
        note=note,
    )
