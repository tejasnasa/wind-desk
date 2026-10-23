"""Build or refresh the local SQLite store from the Elexon Insights API.

Usage::

    python -m scripts.seed                 # default windows from the environment
    python -m scripts.seed --actuals 2025-12-01:2026-02-15 \\
                           --forecasts 2025-12-20:2026-02-01

The operation is idempotent: rows are upserted on their natural keys.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.data.elexon import ElexonClient  # noqa: E402
from app.data.ingest import ingest_actuals, ingest_forecasts  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import Base  # noqa: E402
from app.timeutils import UTC, parse_date  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
log = logging.getLogger("seed")


def _parse_window(raw: str, default: str) -> tuple[datetime, datetime]:
    if raw == "today":
        now = datetime.now(UTC)
        return now.replace(day=1), now
    start_raw, _, end_raw = raw.partition(":")
    if not end_raw:
        end_raw = start_raw
    return (
        datetime.combine(parse_date(start_raw), datetime.min.time(), tzinfo=UTC),
        datetime.combine(parse_date(end_raw), time(23, 59, 59), tzinfo=UTC),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed the wind-desk database")
    parser.add_argument(
        "--actuals",
        default=f"{settings.default_actual_from}:{settings.default_actual_to}",
        help="settlement date window START:END (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--forecasts",
        default=f"{settings.default_forecast_publish_from}:{settings.default_forecast_publish_to}",
        help="publication window START:END (YYYY-MM-DD)",
    )
    parser.add_argument("--database", default=None, help="override WIND_DB_PATH")
    args = parser.parse_args(argv)

    if args.database:
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)

    actual_from, actual_to = _parse_window(args.actuals, "")
    publish_from, publish_to = _parse_window(args.forecasts, "")

    log.info("database: %s", settings.database_url)
    Base.metadata.create_all(engine)

    client = ElexonClient()
    log.info("fetching FUELHH actuals %s .. %s", actual_from.date(), actual_to.date())
    actuals = ingest_actuals(client, actual_from, actual_to)
    log.info(
        "  %s rows fetched, %s written", actuals.rows_fetched, actuals.rows_written
    )

    log.info(
        "fetching WINDFOR forecasts %s .. %s", publish_from.date(), publish_to.date()
    )
    forecasts = ingest_forecasts(client, publish_from, publish_to)
    log.info(
        "  %s rows fetched, %s written", forecasts.rows_fetched, forecasts.rows_written
    )

    log.info("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
