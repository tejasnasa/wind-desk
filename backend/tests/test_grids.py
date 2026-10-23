"""Unit tests for grid alignment (half-hourly actuals <-> hourly forecasts)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from app.analytics.grids import (
    build_hourly_actuals,
    build_step_hold_forecast,
)
from app.data.repository import ActualRow, ForecastRow

UTC = timezone.utc


def actual(target: datetime, mw: float) -> ActualRow:
    return ActualRow(
        target_time=target,
        settlement_date=target.date().isoformat(),
        settlement_period=target.hour * 2 + (1 if target.minute else 0),
        generation_mw=mw,
        publish_time=target,
    )


def forecast(target: datetime, mw: float) -> ForecastRow:
    return ForecastRow(
        target_time=target,
        publish_time=datetime(2026, 1, 1, tzinfo=UTC),
        generation_mw=mw,
    )


def test_hourly_aggregation_is_energy_weighted_mean():
    rows = [
        actual(datetime(2026, 1, 5, 0, 0, tzinfo=UTC), 100.0),
        actual(datetime(2026, 1, 5, 0, 30, tzinfo=UTC), 200.0),
    ]
    hourly = build_hourly_actuals(rows)
    entry = hourly[datetime(2026, 1, 5, 0, tzinfo=UTC)]
    assert entry.mean_mw == pytest.approx(150.0)
    assert entry.mwh == pytest.approx(150.0)
    assert entry.periods == 2


def test_step_hold_expands_hourly_forecast_to_both_settlement_periods():
    rows = [forecast(datetime(2026, 1, 5, 0, tzinfo=UTC), 1000.0)]
    expanded = build_step_hold_forecast(rows)
    assert expanded[datetime(2026, 1, 5, 0, 0, tzinfo=UTC)] == 1000.0
    assert expanded[datetime(2026, 1, 5, 0, 30, tzinfo=UTC)] == 1000.0
    assert datetime(2026, 1, 5, 1, 0, tzinfo=UTC) not in expanded


def test_step_hold_preserves_energy():
    """1 MW for one hour must equal the MWh booked over the two SPs."""
    rows = [
        forecast(datetime(2026, 1, 5, hour, tzinfo=UTC), 1000.0) for hour in range(24)
    ]
    expanded = build_step_hold_forecast(rows)
    mwh = sum(value * 0.5 for value in expanded.values())
    assert mwh == pytest.approx(24 * 1000.0)
    assert len(expanded) == 48
