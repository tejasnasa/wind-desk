"""Idempotent ingestion of Elexon data into the local store.

Re-running the seeder never duplicates rows (natural keys are upserted) and
always appends a ``data_run`` provenance row, so the UI can show exactly which
API calls produced the data currently being served.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..db import session_scope
from ..models import ActualGeneration, DataRun, WindForecast
from .elexon import ElexonClient

log = logging.getLogger(__name__)


@dataclass
class IngestResult:
    dataset: str
    rows_fetched: int
    rows_written: int
    query: dict

    def as_dict(self) -> dict:
        return {
            "dataset": self.dataset,
            "rows_fetched": self.rows_fetched,
            "rows_written": self.rows_written,
            "query": self.query,
        }


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _record_run(
    dataset: str,
    query: dict,
    started: datetime,
    result: IngestResult,
    error: str | None = None,
) -> None:
    with session_scope() as session:
        session.add(
            DataRun(
                dataset=dataset,
                query=json.dumps(query, sort_keys=True),
                started_at=started,
                finished_at=_now(),
                rows_fetched=result.rows_fetched,
                rows_written=result.rows_written,
                status="error" if error else "ok",
                message=error,
            )
        )


def ingest_actuals(
    client: ElexonClient,
    date_from: date,
    date_to: date,
    fuel_type: str = "WIND",
) -> IngestResult:
    """Pull half-hourly actuals and upsert them.

    ``date_from``/``date_to`` are settlement dates; a ``datetime`` is accepted
    too because it is a ``date`` subclass.
    """
    started = _now()
    query = {
        "dataset": "FUELHH",
        "fuelType": fuel_type,
        "settlementDateFrom": date_from.strftime("%Y-%m-%d"),
        "settlementDateTo": date_to.strftime("%Y-%m-%d"),
    }
    try:
        records = client.fetch_actuals(date_from, date_to, fuel_type=fuel_type)
    except Exception as exc:  # pragma: no cover - network
        failed = IngestResult("FUELHH", 0, 0, query)
        _record_run("FUELHH", query, started, failed, error=str(exc))
        raise

    now = _now()
    written = 0
    with session_scope() as session:
        for record in records:
            stmt = sqlite_insert(ActualGeneration).values(
                target_time=record.target_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                settlement_date=record.settlement_date,
                settlement_period=record.settlement_period,
                generation_mw=record.generation_mw,
                publish_time=record.publish_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                fuel_type=record.fuel_type or fuel_type,
                ingested_at=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[ActualGeneration.target_time],
                set_={
                    "generation_mw": stmt.excluded.generation_mw,
                    "publish_time": stmt.excluded.publish_time,
                    "settlement_date": stmt.excluded.settlement_date,
                    "settlement_period": stmt.excluded.settlement_period,
                    "ingested_at": stmt.excluded.ingested_at,
                },
            )
            session.execute(stmt)
            written += 1

    result = IngestResult("FUELHH", len(records), written, query)
    _record_run("FUELHH", query, started, result)
    log.info("ingested %s actual rows", written)
    return result


def ingest_forecasts(
    client: ElexonClient, publish_from: datetime, publish_to: datetime
) -> IngestResult:
    """Pull hourly forecast vintages and upsert them."""
    started = _now()
    query = {
        "dataset": "WINDFOR",
        "publishDateTimeFrom": publish_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "publishDateTimeTo": publish_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        records = client.fetch_forecasts(publish_from, publish_to)
    except Exception as exc:  # pragma: no cover - network
        failed = IngestResult("WINDFOR", 0, 0, query)
        _record_run("WINDFOR", query, started, failed, error=str(exc))
        raise

    now = _now()
    written = 0
    with session_scope() as session:
        for record in records:
            stmt = sqlite_insert(WindForecast).values(
                target_time=record.target_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                publish_time=record.publish_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                generation_mw=record.generation_mw,
                ingested_at=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[WindForecast.target_time, WindForecast.publish_time],
                set_={
                    "generation_mw": stmt.excluded.generation_mw,
                    "ingested_at": stmt.excluded.ingested_at,
                },
            )
            session.execute(stmt)
            written += 1

    result = IngestResult("WINDFOR", len(records), written, query)
    _record_run("WINDFOR", query, started, result)
    log.info("ingested %s forecast rows", written)
    return result


def ingest_all(
    client: ElexonClient,
    actual_from: date,
    actual_to: date,
    publish_from: datetime,
    publish_to: datetime,
) -> list[IngestResult]:
    """Full refresh of both datasets."""
    return [
        ingest_actuals(client, actual_from, actual_to),
        ingest_forecasts(client, publish_from, publish_to),
    ]
