"""Unit tests for the error statistics (hand-computed fixtures)."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from app.analytics.metrics import (
    EvalPair,
    bias,
    build_pairs,
    by_lead_time,
    daily_series,
    histogram,
    mae,
    mape,
    quantile,
    rmse,
    summarize,
)

UTC = timezone.utc


def make_pairs(forecasts, actuals, publish=None, delivery_date=date(2026, 1, 5)):
    publish = publish or datetime(2026, 1, 4, 9, 30, tzinfo=UTC)
    return [
        EvalPair(
            target_time=datetime(2026, 1, 5, hour, tzinfo=UTC),
            delivery_date=delivery_date,
            publish_time=publish,
            forecast_mw=f,
            actual_mw=a,
        )
        for hour, (f, a) in enumerate(zip(forecasts, actuals))
    ]


def test_basic_error_sign_convention():
    pair = make_pairs([100.0], [80.0])[0]
    assert pair.error_mw == 20.0  # forecast above outturn -> under-delivery of wind
    assert pair.error_mwh == 20.0


def test_mae_rmse_bias_against_hand_calculation():
    errors = [2.0, -4.0, 6.0, -8.0]
    assert mae(errors) == pytest.approx((2 + 4 + 6 + 8) / 4)
    assert rmse(errors) == pytest.approx(((4 + 16 + 36 + 64) / 4) ** 0.5)
    assert bias(errors) == pytest.approx((-4) / 4)


def test_quantile_uses_linear_interpolation():
    values = [0.0, 10.0, 20.0, 30.0]
    assert quantile(values, 0.0) == 0.0
    assert quantile(values, 0.5) == pytest.approx(15.0)
    assert quantile(values, 1.0) == 30.0
    assert quantile([], 0.5) == 0.0


def test_mape_excludes_near_zero_outturns():
    pairs = make_pairs([100.0, 100.0], [100.0, 0.0])
    value, excluded = mape(pairs)
    assert excluded == 1
    assert value == pytest.approx(0.0)


def test_summarize_reports_nmae_against_mean_actual():
    pairs = make_pairs([100.0, 120.0], [80.0, 100.0])
    stats = summarize(pairs)
    assert stats["n"] == 2
    assert stats["mae_mw"] == pytest.approx(20.0)
    assert stats["bias_mw"] == pytest.approx(20.0)
    assert stats["mean_actual_mw"] == pytest.approx(90.0)
    assert stats["nmae_pct"] == pytest.approx(20.0 / 90.0 * 100.0)


def test_summary_of_empty_sample_is_zeroed():
    stats = summarize([])
    assert stats["n"] == 0
    assert stats["mae_mw"] == 0.0
    assert stats["abs_error_quantiles_mw"] == {}


def test_daily_series_carries_energy_totals():
    pairs = make_pairs([100.0, 120.0], [80.0, 100.0])
    series = daily_series(pairs)
    assert len(series) == 1
    row = series[0]
    assert row["forecast_energy_mwh"] == pytest.approx(220.0)
    assert row["actual_energy_mwh"] == pytest.approx(180.0)
    assert row["error_mwh"] == pytest.approx(40.0)
    assert row["error_pct"] == pytest.approx(40.0 / 180.0 * 100.0)


def test_lead_time_buckets_use_horizon():
    # target 2026-01-05T00:00Z, published 2026-01-04T06:00Z -> 18 h horizon
    pairs = make_pairs([100.0], [100.0], publish=datetime(2026, 1, 4, 6, 0, tzinfo=UTC))
    buckets = {b["key"]: b for b in by_lead_time(pairs)}
    assert "12-24h" in buckets
    assert buckets["12-24h"]["n"] == 1

    # published 30 h ahead -> 24-36h bucket
    pairs = make_pairs(
        [100.0], [100.0], publish=datetime(2026, 1, 3, 18, 0, tzinfo=UTC)
    )
    buckets = {b["key"]: b for b in by_lead_time(pairs)}
    assert "24-36h" in buckets
    assert buckets["24-36h"]["n"] == 1


def test_histogram_counts_every_value():
    values = [0.0, 0.5, 1.0, 1.5]
    hist = histogram(values, bin_count=2)
    assert hist["count"] == 4
    assert sum(b["count"] for b in hist["bins"]) == 4


def test_build_pairs_only_matching_timestamps():
    forecast = {datetime(2026, 1, 5, 0, tzinfo=UTC): 10.0}
    actual = {datetime(2026, 1, 5, 0, tzinfo=UTC): 8.0}
    pairs = build_pairs(
        forecast, actual, datetime(2026, 1, 4, 9, 30, tzinfo=UTC), date(2026, 1, 5)
    )
    assert len(pairs) == 1
    assert pairs[0].error_mw == pytest.approx(2.0)
