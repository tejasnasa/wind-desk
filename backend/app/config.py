"""Application configuration.

All settings are environment driven (12-factor) so the same image runs locally,
in Docker and on Vercel serverless.  See ``.env.example`` for the full list.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import time
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


def _parse_time(raw: str) -> time:
    hour, _, minute = raw.partition(":")
    return time(hour=int(hour), minute=int(minute or 0))


@dataclass(frozen=True)
class Settings:
    """Immutable runtime settings."""

    # --- market / business rules -------------------------------------------
    # NESO day-ahead (SDW) gate closure: 11:00 local on D-1 for delivery day D.
    gate_closure_time: time
    market_timezone: ZoneInfo

    # --- data source --------------------------------------------------------
    elexon_api_base: str
    elexon_timeout_s: float
    elexon_retries: int
    http_user_agent: str

    # --- persistence --------------------------------------------------------
    database_url: str
    db_path: Path

    # --- analysis windows ---------------------------------------------------
    default_actual_from: str
    default_actual_to: str
    default_forecast_publish_from: str
    default_forecast_publish_to: str
    analysis_default_from: str
    analysis_default_to: str

    # --- api ----------------------------------------------------------------
    cors_origins: tuple[str, ...]
    admin_token: str | None
    static_dir: Path | None


def _default_db_path() -> Path:
    return Path(os.getenv("WIND_DB_PATH", BACKEND_DIR / "data" / "wind.db"))


def load_settings() -> Settings:
    db_path = _default_db_path()
    static_dir_env = os.getenv("STATIC_DIR")
    origins = os.getenv("CORS_ORIGINS", "*")
    return Settings(
        gate_closure_time=_parse_time(os.getenv("GATE_CLOSURE_TIME", "11:00")),
        market_timezone=ZoneInfo(os.getenv("MARKET_TIMEZONE", "Europe/London")),
        elexon_api_base=os.getenv(
            "ELEXON_API_BASE", "https://data.elexon.co.uk/bmrs/api/v1"
        ).rstrip("/"),
        elexon_timeout_s=float(os.getenv("ELEXON_TIMEOUT_S", "90")),
        elexon_retries=int(os.getenv("ELEXON_RETRIES", "3")),
        http_user_agent=os.getenv(
            "HTTP_USER_AGENT",
            "wind-desk/1.0 (day-ahead wind forecast & accuracy portal)",
        ),
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{db_path.as_posix()}"),
        db_path=db_path,
        default_actual_from=os.getenv("ACTUAL_FROM", "2025-12-01"),
        default_actual_to=os.getenv("ACTUAL_TO", "2026-02-15"),
        default_forecast_publish_from=os.getenv("FORECAST_PUBLISH_FROM", "2025-12-20"),
        default_forecast_publish_to=os.getenv("FORECAST_PUBLISH_TO", "2026-02-01"),
        analysis_default_from=os.getenv("ANALYSIS_FROM", "2026-01-01"),
        analysis_default_to=os.getenv("ANALYSIS_TO", "2026-01-31"),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        admin_token=os.getenv("ADMIN_TOKEN") or None,
        static_dir=Path(static_dir_env) if static_dir_env else None,
    )


settings = load_settings()
