"""Grid alignment between half-hourly actuals and hourly forecasts.

The upstream datasets do not share a time grid:

* ``FUELHH`` (actuals) is **half-hourly**: 48 settlement periods per day.
* ``WINDFOR`` (forecasts) is **hourly**: 73 target hours per publication.

Two conversions are used, and both are deliberately explicit:

``hourly_actuals``
    Groups the two settlement periods of an hour and reports the energy
    weighted mean MW (identical to the MWh over that hour).  Used for the
    *primary* error statistics: comparing an hourly forecast against an
    hourly-averaged actual is the only comparison that does not invent
    resolution.

``step_hold_forecast``
    Holds each hourly forecast value constant across the two settlement
    periods it covers.  Used for the settlement-period view, because a forecast
    published hourly cannot resolve a 30-minute ramp.  Energy is preserved
    exactly by this transform (1 MW for 1 h == 1 MW for 2 x 30 min).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from ..data.repository import ActualRow, ForecastRow

HALF_HOUR = timedelta(minutes=30)
HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class HourlyActual:
    """One hour of actual wind generation."""

    hour: datetime
    mean_mw: float
    mwh: float
    periods: int


def floor_hour(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)


def build_hourly_actuals(rows: list[ActualRow]) -> dict[datetime, HourlyActual]:
    """Aggregate half-hourly actuals into hourly buckets."""
    buckets: dict[datetime, list[float]] = {}
    for row in rows:
        buckets.setdefault(floor_hour(row.target_time), []).append(row.generation_mw)

    out: dict[datetime, HourlyActual] = {}
    for hour, values in buckets.items():
        mwh = sum(v * 0.5 for v in values)  # each settlement period is 30 minutes
        out[hour] = HourlyActual(
            hour=hour,
            mean_mw=mwh,  # MWh over 1 h == mean MW over the hour
            mwh=mwh,
            periods=len(values),
        )
    return out


def build_step_hold_forecast(rows: list[ForecastRow]) -> dict[datetime, float]:
    """Expand hourly forecasts onto the half-hourly settlement grid."""
    out: dict[datetime, float] = {}
    for row in rows:
        out[row.target_time] = row.generation_mw
        out[row.target_time + HALF_HOUR] = row.generation_mw
    return out


def hourly_forecast_index(
    rows: list[ForecastRow],
) -> dict[tuple[datetime, datetime], float]:
    """Index forecasts by (publish_time, target_hour)."""
    return {(r.publish_time, r.target_time): r.generation_mw for r in rows}


def forecast_by_publish(
    rows: list[ForecastRow],
) -> dict[datetime, dict[datetime, float]]:
    """Group forecast vintages: publish_time -> {target_hour: mw}."""
    out: dict[datetime, dict[datetime, float]] = {}
    for row in rows:
        out.setdefault(row.publish_time, {})[row.target_time] = row.generation_mw
    return out


def actuals_by_settlement_date(rows: list[ActualRow]) -> dict[str, list[ActualRow]]:
    out: dict[str, list[ActualRow]] = {}
    for row in rows:
        out.setdefault(row.settlement_date, []).append(row)
    return out


def settlement_periods_of_day(rows: list[ActualRow]) -> list[ActualRow]:
    """Sort half-hourly rows into settlement-period order."""
    return sorted(rows, key=lambda r: r.settlement_period)
