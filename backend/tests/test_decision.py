"""Unit tests for the decision-time forecast selection."""

from __future__ import annotations

from datetime import date, datetime, time, timezone

import pytest
from app.analytics.decision import (
    decision_cutoff,
    delivery_day_hours,
    select_publish,
)

UTC = timezone.utc
LONDON = timezone.utc  # January: Europe/London == UTC


def hours_for(day: date) -> list[datetime]:
    return [datetime(2026, 1, day.day, hour, tzinfo=UTC) for hour in range(24)]


def vintages(publish_hours, complete=True):
    """Build {publish_time: {target_hour: value}} fixtures."""
    hours = hours_for(date(2026, 1, 5))
    out = {}
    for publish_hour in publish_hours:
        publish = datetime(2026, 1, 4, publish_hour, 30, tzinfo=UTC)
        series = {hour: 1000.0 for hour in hours}
        if not complete:
            series = {hour: 1000.0 for hour in hours[:-2]}
        out[publish] = series
    return out


def test_cutoff_is_gate_closure_on_the_previous_day():
    cutoff = decision_cutoff(date(2026, 1, 6), time(11, 0), LONDON)
    assert cutoff == datetime(2026, 1, 5, 11, 0, tzinfo=UTC)


def test_delivery_day_hours_are_24_in_winter():
    assert len(delivery_day_hours(date(2026, 1, 6), LONDON)) == 24


def test_selects_latest_publication_at_or_before_cutoff():
    data = vintages([2, 4, 7, 9])
    cutoff = datetime(2026, 1, 4, 11, 0, tzinfo=UTC)
    selection = select_publish(data, hours_for(date(2026, 1, 5)), cutoff)
    # 09:30 is the last publication before the 11:00 gate closure
    assert selection.publish_time == datetime(2026, 1, 4, 9, 30, tzinfo=UTC)
    assert selection.complete is True
    assert selection.covered_hours == 24
    assert selection.expected_hours == 24


def test_publication_after_cutoff_is_ignored():
    data = vintages([2, 4, 7, 9, 11])
    cutoff = datetime(2026, 1, 4, 11, 0, tzinfo=UTC)
    selection = select_publish(data, hours_for(date(2026, 1, 5)), cutoff)
    assert selection.publish_time == datetime(2026, 1, 4, 9, 30, tzinfo=UTC)
    assert datetime(2026, 1, 4, 11, 30, tzinfo=UTC) not in selection.available_publishes


def test_publication_exactly_on_the_cutoff_is_included():
    data = vintages([11])
    cutoff = datetime(2026, 1, 4, 11, 0, tzinfo=UTC)
    selection = select_publish(data, hours_for(date(2026, 1, 5)), cutoff)
    # 11:30 publication is after the cut-off, so nothing is available
    assert selection.publish_time is None
    assert selection.note


def test_incomplete_coverage_is_reported():
    data = vintages([9], complete=False)
    cutoff = datetime(2026, 1, 4, 11, 0, tzinfo=UTC)
    selection = select_publish(data, hours_for(date(2026, 1, 5)), cutoff)
    assert selection.complete is False
    assert selection.covered_hours == 22
    assert selection.note and "22 of 24" in selection.note


def test_no_publication_available():
    data = vintages([2])
    cutoff = datetime(2026, 1, 4, 1, 0, tzinfo=UTC)
    selection = select_publish(data, hours_for(date(2026, 1, 5)), cutoff)
    assert selection.publish_time is None
    assert selection.coverage_ratio == 0.0
