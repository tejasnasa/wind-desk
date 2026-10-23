"""Domain schema.

Two facts tables (actuals, forecasts) plus a provenance table recording every
ingestion run so that any number in the UI can be traced back to a specific
API call.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ActualGeneration(Base):
    """Half-hourly national wind generation (Elexon dataset ``FUELHH``).

    ``target_time`` is the UTC instant of the settlement period start;
    ``settlement_date`` / ``settlement_period`` follow GB settlement calendar
    conventions (local date, period 1..48).
    """

    __tablename__ = "actual_generation"

    target_time: Mapped[str] = mapped_column(String(20), primary_key=True)
    settlement_date: Mapped[str] = mapped_column(String(10), index=True)
    settlement_period: Mapped[int] = mapped_column(Integer, index=True)
    generation_mw: Mapped[float] = mapped_column(Float)
    publish_time: Mapped[str] = mapped_column(String(20))
    fuel_type: Mapped[str] = mapped_column(String(16), default="WIND")
    ingested_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        Index("ix_actual_settlement", "settlement_date", "settlement_period"),
    )


class WindForecast(Base):
    """Hourly national wind forecast (Elexon dataset ``WINDFOR``).

    One row per (target hour, publication).  Publications happen 8 times a day;
    the same target hour therefore carries many forecast vintages.
    """

    __tablename__ = "wind_forecast"

    target_time: Mapped[str] = mapped_column(String(20), primary_key=True)
    publish_time: Mapped[str] = mapped_column(String(20), primary_key=True)
    generation_mw: Mapped[float] = mapped_column(Float)
    ingested_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        Index("ix_forecast_publish", "publish_time"),
        Index("ix_forecast_target", "target_time"),
    )


class DataRun(Base):
    """Provenance record for one ingestion run."""

    __tablename__ = "data_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset: Mapped[str] = mapped_column(String(32), index=True)
    query: Mapped[str] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rows_fetched: Mapped[int] = mapped_column(Integer, default=0)
    rows_written: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="ok")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
