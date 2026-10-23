"""API smoke tests.

They run against the seeded SQLite store; if the database is missing the API
tests are skipped so the unit suite still runs on a clean checkout.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from app.config import settings
from app.main import app

UTC = timezone.utc

pytestmark = pytest.mark.skipif(
    not settings.db_path.exists(),
    reason="database not seeded - run `make ingest` first",
)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_meta_reports_source_and_market_rules(client):
    payload = client.get("/api/meta").json()["data"]
    assert "data.elexon.co.uk" in payload["data_source"]["base_url"]
    assert payload["market_rules"]["gate_closure_local"] == "11:00"
    assert payload["market_rules"]["actual_grid"].startswith("half-hourly")
    assert payload["coverage"]["actuals"]["rows"] > 0
    assert payload["coverage"]["forecasts"]["rows"] > 0


def test_decision_view_selects_pre_gate_closure_publication(client):
    payload = client.get("/api/decision/2026-01-06").json()["data"]
    selected = payload["selected_publish"]
    assert selected["publish_time"].startswith("2026-01-05T09:30")
    assert selected["complete"] is True
    assert selected["covered_hours"] == 24
    assert payload["cutoff"].startswith("2026-01-05T11:00")
    assert len(payload["hourly_series"]) == 24
    assert len(payload["settlement_series"]) == 48


def test_decision_view_daily_aggregates_are_consistent(client):
    payload = client.get("/api/decision/2026-01-06").json()["data"]
    daily = payload["daily"]
    assert daily["n"] == 24
    assert daily["forecast_energy_mwh"] == pytest.approx(
        daily["actual_energy_mwh"] + daily["error_mwh"], rel=1e-6
    )


def test_decision_view_as_of_override(client):
    payload = client.get("/api/decision/2026-01-06?as_of=2026-01-05T07:00:00Z").json()[
        "data"
    ]
    assert payload["selected_publish"]["publish_time"].startswith("2026-01-05T04:30")


def test_accuracy_summary_defaults_to_january_2026(client):
    payload = client.get("/api/accuracy/summary").json()["data"]
    assert payload["window"] == {"from": "2026-01-01", "to": "2026-01-31"}
    assert payload["delivery_days"] == 31
    assert payload["headline"]["n"] == 31 * 24
    assert payload["headline"]["mae_mw"] > 0
    assert payload["headline"]["rmse_mw"] >= payload["headline"]["mae_mw"]


def test_accuracy_series_has_one_row_per_day(client):
    rows = client.get("/api/accuracy/series").json()["data"]
    assert len(rows) == 31
    assert rows[0]["delivery_date"] == "2026-01-01"
    assert rows[-1]["delivery_date"] == "2026-01-31"


def test_accuracy_lead_time_buckets_are_ordered(client):
    payload = client.get("/api/accuracy/by-lead-time").json()["data"]
    keys = [bucket["key"] for bucket in payload["buckets"]]
    assert keys == sorted(
        keys, key=lambda k: int(k.split("-")[0].replace(">", "").replace("h", ""))
    )
    assert payload["buckets"][0]["n"] > 0


def test_accuracy_heatmap_shape(client):
    payload = client.get("/api/accuracy/heatmap").json()["data"]
    assert len(payload["days"]) == 31
    assert all(len(row) == 24 for row in payload["matrix"])


def test_accuracy_baselines_report_skill(client):
    payload = client.get("/api/accuracy/baselines").json()["data"]
    assert payload["skill"]["mae_mw"] > 0
    assert payload["baseline_stats"]["n"] > 0


def test_export_csv(client):
    response = client.get("/api/accuracy/export.csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    lines = response.text.strip().splitlines()
    assert lines[0].startswith("target_time_utc")
    assert len(lines) == 31 * 24 + 1


def test_unknown_delivery_day_is_reported_not_crashed(client):
    response = client.get("/api/decision/2020-01-06")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["selected_publish"]["publish_time"] is None
    assert payload["daily"]["n"] == 0


def test_invalid_date_is_a_400(client):
    response = client.get("/api/decision/not-a-date")
    assert response.status_code == 400
