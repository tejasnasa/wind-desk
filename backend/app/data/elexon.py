"""HTTP client for the Elexon Insights (formerly BMRS) API.

Notes that matter for production use
------------------------------------
* The endpoint published in the brief (``bmrs.elexon.co.uk/api-documentation/...``)
  now serves a retired SPA shell.  The live, key-free API is
  ``https://data.elexon.co.uk/bmrs/api/v1`` and exposes the very same
  ``/datasets/FUELHH/stream`` and ``/datasets/WINDFOR/stream`` resources.
* The query parameter names changed with the migration:
  ``FUELHH`` is filtered with ``fuelType`` + ``settlementDateFrom``/``settlementDateTo``;
  ``WINDFOR`` only offers ``publishDateTimeFrom``/``publishDateTimeTo``.
  The old ``publishDate`` parameter is silently ignored by the live API.
"""

from __future__ import annotations

import logging
import time as _time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from ..config import settings
from ..timeutils import to_iso

log = logging.getLogger(__name__)

ACTUALS_DATASET = "FUELHH"
FORECAST_DATASET = "WINDFOR"


@dataclass(frozen=True)
class ApiRecord:
    """A single API record, normalised to the fields the domain needs."""

    dataset: str
    target_time: datetime
    publish_time: datetime
    generation_mw: float
    settlement_date: str | None = None
    settlement_period: int | None = None
    fuel_type: str | None = None


class ElexonClientError(RuntimeError):
    """Raised when the upstream API cannot be used."""


class ElexonClient:
    """Thin, retrying HTTP client for the two datasets in scope."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout_s: float | None = None,
        retries: int | None = None,
        user_agent: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.elexon_api_base).rstrip("/")
        self.timeout_s = (
            timeout_s if timeout_s is not None else settings.elexon_timeout_s
        )
        self.retries = retries if retries is not None else settings.elexon_retries
        self.user_agent = user_agent or settings.http_user_agent

    # ------------------------------------------------------------------ http
    def _stream(self, dataset: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        url = f"{self.base_url}/datasets/{dataset}/stream"
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                with httpx.Client(timeout=self.timeout_s) as client:
                    response = client.get(
                        url, params=params, headers={"User-Agent": self.user_agent}
                    )
                if response.status_code == 200:
                    payload = response.json()
                    if isinstance(payload, list):
                        return payload
                    raise ElexonClientError(
                        f"unexpected payload for {dataset}: {str(payload)[:200]}"
                    )
                if response.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError(
                        f"retryable status {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                raise ElexonClientError(
                    f"{dataset} -> HTTP {response.status_code}: {response.text[:300]}"
                )
            except (
                httpx.HTTPError,
                ElexonClientError,
            ) as exc:  # pragma: no cover - network
                last_error = exc
                if attempt == self.retries:
                    break
                backoff = 2 ** (attempt - 1)
                log.warning(
                    "elexon request failed (%s/%s): %s - retrying in %ss",
                    attempt,
                    self.retries,
                    exc,
                    backoff,
                )
                _time.sleep(backoff)
        raise ElexonClientError(
            f"failed to fetch {dataset}: {last_error}"
        ) from last_error

    # --------------------------------------------------------------- parsing
    @staticmethod
    def _parse_records(dataset: str, rows: list[dict[str, Any]]) -> list[ApiRecord]:
        from ..timeutils import parse_iso

        records: list[ApiRecord] = []
        for row in rows:
            generation = row.get("generation")
            if generation is None:
                continue
            records.append(
                ApiRecord(
                    dataset=dataset,
                    target_time=parse_iso(row["startTime"]),
                    publish_time=parse_iso(row["publishTime"]),
                    generation_mw=float(generation),
                    settlement_date=row.get("settlementDate"),
                    settlement_period=row.get("settlementPeriod"),
                    fuel_type=row.get("fuelType"),
                )
            )
        return records

    # ------------------------------------------------------------- datasets
    def fetch_actuals(
        self,
        date_from: date,
        date_to: date,
        fuel_type: str = "WIND",
        chunk_days: int = 31,
    ) -> list[ApiRecord]:
        """Half-hourly actual generation for ``fuel_type`` over a date window.

        ``date_from``/``date_to`` are settlement dates (local GB dates).
        """
        out: list[ApiRecord] = []
        start = date_from
        while start <= date_to:
            end = min(start + timedelta(days=chunk_days - 1), date_to)
            params = {
                "fuelType": fuel_type,
                "settlementDateFrom": start.strftime("%Y-%m-%d"),
                "settlementDateTo": end.strftime("%Y-%m-%d"),
            }
            rows = self._stream(ACTUALS_DATASET, params)
            out.extend(self._parse_records(ACTUALS_DATASET, rows))
            log.info(
                "actuals %s..%s -> %s rows",
                params["settlementDateFrom"],
                params["settlementDateTo"],
                len(rows),
            )
            start = end + timedelta(days=1)
        return out

    def fetch_forecasts(
        self,
        publish_from: datetime,
        publish_to: datetime,
        chunk_days: int = 14,
    ) -> list[ApiRecord]:
        """Wind forecasts *published* in ``[publish_from, publish_to)``."""
        out: list[ApiRecord] = []
        start = publish_from
        while start < publish_to:
            end = min(start + timedelta(days=chunk_days), publish_to)
            params = {
                "publishDateTimeFrom": to_iso(start),
                "publishDateTimeTo": to_iso(end),
            }
            rows = self._stream(FORECAST_DATASET, params)
            out.extend(self._parse_records(FORECAST_DATASET, rows))
            log.info(
                "forecasts %s..%s -> %s rows",
                params["publishDateTimeFrom"],
                params["publishDateTimeTo"],
                len(rows),
            )
            start = end
        return out

    # ------------------------------------------------------------------ misc
    def publish_windows(
        self, publish_from: datetime, publish_to: datetime
    ) -> Iterator[dict]:
        """Yield the exact request parameters used for the forecast pull."""
        start = publish_from
        while start < publish_to:
            end = min(start + timedelta(days=14), publish_to)
            yield {
                "publishDateTimeFrom": to_iso(start),
                "publishDateTimeTo": to_iso(end),
            }
            start = end
