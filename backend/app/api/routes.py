"""REST API.

All responses use a small envelope::

    {"data": ..., "meta": {"generated_at": ..., "n": ...}}

so the front-end can treat every endpoint uniformly.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..config import settings
from ..service import AnalysisService
from ..timeutils import UTC, parse_date

router = APIRouter(prefix="/api")
service = AnalysisService()


def _envelope(data: Any, **meta: Any) -> dict:
    return {
        "data": data,
        "meta": {"generated_at": datetime.now(UTC).isoformat(), **meta},
    }


def _parse_date(value: str | date | None) -> date | None:
    """Normalise a date parameter.

    FastAPI converts a parameter annotated as ``date`` before it reaches us, so
    the value can already be a ``date``; a hand-written query string arrives as
    ``str``.
    """
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid date: {value}") from exc


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    from ..timeutils import parse_iso

    try:
        return parse_iso(value)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"invalid timestamp: {value}"
        ) from exc


# --------------------------------------------------------------------- meta
@router.get("/health")
def health() -> dict:
    try:
        coverage = service.repo.coverage()
        rows = coverage["actuals"]["rows"] + coverage["forecasts"]["rows"]
        return {"status": "ok", "rows": rows, "database": "ok"}
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=503, detail=f"database unavailable: {exc}"
        ) from exc


@router.get("/meta")
def meta() -> dict:
    return _envelope(service.meta())


@router.get("/data-runs")
def data_runs() -> dict:
    return _envelope(service.data_runs())


# -------------------------------------------------------------------- data
@router.get("/actuals")
def actuals(
    date_from: str | None = Query(
        None, description="inclusive settlement date, YYYY-MM-DD"
    ),
    date_to: str | None = Query(
        None, description="inclusive settlement date, YYYY-MM-DD"
    ),
) -> dict:
    rows = service.actuals(_parse_date(date_from), _parse_date(date_to))
    return _envelope(rows, n=len(rows))


@router.get("/forecasts")
def forecasts(
    delivery_date: str | None = Query(None, description="delivery day, YYYY-MM-DD"),
    publish_time: str | None = Query(
        None, description="forecast vintage, ISO-8601 UTC"
    ),
) -> dict:
    rows = service.forecasts(_parse_date(delivery_date), _parse_datetime(publish_time))
    return _envelope(rows, n=len(rows))


@router.get("/publishes")
def publishes() -> dict:
    rows = service.available_publishes()
    return _envelope(rows, n=len(rows))


# ---------------------------------------------------------------- decision
@router.get("/decision/{delivery_date}")
def decision(
    delivery_date: str,
    as_of: str | None = Query(
        None,
        description="decision cut-off (ISO-8601). Defaults to gate closure on D-1.",
    ),
) -> dict:
    day = _parse_date(delivery_date)
    if day is None:
        raise HTTPException(status_code=400, detail="delivery_date is required")
    payload = service.decision_view(day, _parse_datetime(as_of))
    return _envelope(payload)


# ---------------------------------------------------------------- accuracy
@router.get("/accuracy/summary")
def accuracy_summary(date_from: str | None = None, date_to: str | None = None) -> dict:
    payload = service.accuracy_summary(_parse_date(date_from), _parse_date(date_to))
    return _envelope(payload)


@router.get("/accuracy/series")
def accuracy_series(date_from: str | None = None, date_to: str | None = None) -> dict:
    rows = service.accuracy_series(_parse_date(date_from), _parse_date(date_to))
    return _envelope(rows, n=len(rows))


@router.get("/accuracy/by-lead-time")
def accuracy_by_lead_time(
    date_from: str | None = None, date_to: str | None = None
) -> dict:
    payload = service.accuracy_by_lead_time(
        _parse_date(date_from), _parse_date(date_to)
    )
    return _envelope(payload)


@router.get("/accuracy/by-hour")
def accuracy_by_hour(date_from: str | None = None, date_to: str | None = None) -> dict:
    rows = service.accuracy_by_hour(_parse_date(date_from), _parse_date(date_to))
    return _envelope(rows, n=len(rows))


@router.get("/accuracy/by-weekday")
def accuracy_by_weekday(
    date_from: str | None = None, date_to: str | None = None
) -> dict:
    rows = service.accuracy_by_weekday(_parse_date(date_from), _parse_date(date_to))
    return _envelope(rows, n=len(rows))


@router.get("/accuracy/distribution")
def accuracy_distribution(
    date_from: str | None = None, date_to: str | None = None
) -> dict:
    payload = service.accuracy_distribution(
        _parse_date(date_from), _parse_date(date_to)
    )
    return _envelope(payload)


@router.get("/accuracy/heatmap")
def accuracy_heatmap(date_from: str | None = None, date_to: str | None = None) -> dict:
    payload = service.accuracy_heatmap(_parse_date(date_from), _parse_date(date_to))
    return _envelope(payload)


@router.get("/accuracy/baselines")
def accuracy_baselines(
    date_from: str | None = None, date_to: str | None = None
) -> dict:
    payload = service.accuracy_baselines(_parse_date(date_from), _parse_date(date_to))
    return _envelope(payload)


@router.get("/accuracy/ribbon")
def accuracy_ribbon(date_from: str | None = None, date_to: str | None = None) -> dict:
    """Settlement-period forecast errors at the gate-closure cut-off."""
    rows = service.ribbon_rows(_parse_date(date_from), _parse_date(date_to))
    return _envelope(rows, n=len(rows))


@router.get("/accuracy/export.csv")
def accuracy_export(
    date_from: str | None = None, date_to: date | None = None
) -> StreamingResponse:
    rows = service.export_rows(_parse_date(date_from), _parse_date(date_to))
    buffer = io.StringIO()
    if rows:
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="wind_forecast_errors.csv"'
        },
    )


# ------------------------------------------------------------------- admin
@router.post("/admin/ingest")
def admin_ingest(
    x_admin_token: str | None = Header(None, alias="X-Admin-Token"),
) -> dict:
    """Refresh the local store from the Elexon API (token protected)."""
    if not settings.admin_token:
        raise HTTPException(status_code=404, detail="ingestion endpoint disabled")
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="invalid admin token")

    from ..data.elexon import ElexonClient
    from ..data.ingest import ingest_all
    from ..timeutils import parse_iso

    client = ElexonClient()
    results = ingest_all(
        client,
        parse_date(settings.default_actual_from),
        parse_date(settings.default_actual_to),
        parse_iso(f"{settings.default_forecast_publish_from}T00:00:00Z"),
        parse_iso(f"{settings.default_forecast_publish_to}T00:00:00Z"),
    )
    return _envelope([r.as_dict() for r in results])
