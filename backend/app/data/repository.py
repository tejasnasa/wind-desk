"""Read model: lightweight row objects and a repository over the store.

The analysis layer never talks to SQLAlchemy directly; it consumes these
plain dataclasses, which keeps the statistics unit-testable without a database.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select

from ..db import SessionLocal
from ..models import ActualGeneration, DataRun, WindForecast
from ..timeutils import parse_iso


@dataclass(frozen=True)
class ActualRow:
    target_time: datetime
    settlement_date: str
    settlement_period: int
    generation_mw: float
    publish_time: datetime


@dataclass(frozen=True)
class ForecastRow:
    target_time: datetime
    publish_time: datetime
    generation_mw: float


class Repository:
    """Data access for the analysis layer."""

    def __init__(self, session_factory=SessionLocal) -> None:
        self._session_factory = session_factory

    # ------------------------------------------------------------- actuals
    def actuals(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        target_from: datetime | None = None,
        target_to: datetime | None = None,
    ) -> list[ActualRow]:
        stmt = select(ActualGeneration)
        if date_from is not None:
            stmt = stmt.where(ActualGeneration.settlement_date >= date_from.isoformat())
        if date_to is not None:
            stmt = stmt.where(ActualGeneration.settlement_date <= date_to.isoformat())
        if target_from is not None:
            stmt = stmt.where(
                ActualGeneration.target_time
                >= target_from.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        if target_to is not None:
            stmt = stmt.where(
                ActualGeneration.target_time < target_to.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        stmt = stmt.order_by(ActualGeneration.target_time)
        with self._session_factory() as session:
            rows = session.execute(stmt).scalars().all()
        return [
            ActualRow(
                target_time=parse_iso(r.target_time),
                settlement_date=r.settlement_date,
                settlement_period=r.settlement_period,
                generation_mw=r.generation_mw,
                publish_time=parse_iso(r.publish_time),
            )
            for r in rows
        ]

    # ------------------------------------------------------------ forecasts
    def forecasts(
        self,
        target_from: datetime | None = None,
        target_to: datetime | None = None,
        publish_from: datetime | None = None,
        publish_to: datetime | None = None,
    ) -> list[ForecastRow]:
        stmt = select(WindForecast)
        if target_from is not None:
            stmt = stmt.where(
                WindForecast.target_time >= target_from.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        if target_to is not None:
            stmt = stmt.where(
                WindForecast.target_time < target_to.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        if publish_from is not None:
            stmt = stmt.where(
                WindForecast.publish_time >= publish_from.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        if publish_to is not None:
            stmt = stmt.where(
                WindForecast.publish_time <= publish_to.strftime("%Y-%m-%dT%H:%M:%SZ")
            )
        stmt = stmt.order_by(WindForecast.publish_time, WindForecast.target_time)
        with self._session_factory() as session:
            rows = session.execute(stmt).scalars().all()
        return [
            ForecastRow(
                target_time=parse_iso(r.target_time),
                publish_time=parse_iso(r.publish_time),
                generation_mw=r.generation_mw,
            )
            for r in rows
        ]

    # ------------------------------------------------------------ meta/prov
    def data_runs(self, limit: int = 25) -> list[dict[str, Any]]:
        stmt = select(DataRun).order_by(DataRun.id.desc()).limit(limit)
        with self._session_factory() as session:
            rows = session.execute(stmt).scalars().all()
        return [
            {
                "id": r.id,
                "dataset": r.dataset,
                "query": r.query,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "rows_fetched": r.rows_fetched,
                "rows_written": r.rows_written,
                "status": r.status,
                "message": r.message,
            }
            for r in rows
        ]

    def coverage(self) -> dict[str, Any]:
        with self._session_factory() as session:
            actual_min, actual_max = session.execute(
                select(
                    func.min(ActualGeneration.target_time),
                    func.max(ActualGeneration.target_time),
                )
            ).one()
            actual_count = session.execute(
                select(func.count()).select_from(ActualGeneration)
            ).scalar_one()
            publish_min, publish_max = session.execute(
                select(
                    func.min(WindForecast.publish_time),
                    func.max(WindForecast.publish_time),
                )
            ).one()
            target_min, target_max = session.execute(
                select(
                    func.min(WindForecast.target_time),
                    func.max(WindForecast.target_time),
                )
            ).one()
            forecast_count = session.execute(
                select(func.count()).select_from(WindForecast)
            ).scalar_one()
            distinct_publishes = session.execute(
                select(func.count(func.distinct(WindForecast.publish_time)))
            ).scalar_one()
        return {
            "actuals": {
                "from": actual_min,
                "to": actual_max,
                "rows": actual_count,
            },
            "forecasts": {
                "publish_from": publish_min,
                "publish_to": publish_max,
                "target_from": target_min,
                "target_to": target_max,
                "rows": forecast_count,
                "publications": distinct_publishes,
            },
        }
