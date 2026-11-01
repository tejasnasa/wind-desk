"""Application service layer.

Holds the in-memory snapshot of the dataset (it is small) and turns it into
the product views consumed by the REST API:

* :meth:`AnalysisService.decision_view` - "what did we know at gate closure?"
* :meth:`AnalysisService.accuracy_*`     - "how wrong were we, and by how much?"

The snapshot is cached and invalidated by the database file's mtime/size, so a
re-ingest is picked up without restarting the server.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from .analytics import bands, decision, grids, metrics
from .analytics.bands import BandProfile
from .analytics.metrics import EvalPair
from .config import settings
from .data.repository import ActualRow, ForecastRow, Repository
from .timeutils import UTC, parse_date

log = logging.getLogger(__name__)

BAND_LEVELS = (0.50, 0.80, 0.95)


@dataclass
class Snapshot:
    """Everything the analytics need, loaded once."""

    actuals: list[ActualRow]
    forecasts: list[ForecastRow]
    hourly_actuals: dict[datetime, grids.HourlyActual]
    vintages: dict[datetime, dict[datetime, float]]
    by_target: dict[datetime, list[tuple[datetime, float]]] = field(
        default_factory=dict
    )
    publish_times: list[datetime] = field(default_factory=list)
    delivery_dates: list[date] = field(default_factory=list)


class AnalysisService:
    """Read-side application service over the local store."""

    def __init__(self, repository: Repository | None = None) -> None:
        self.repo = repository or Repository()
        self._snapshot: Snapshot | None = None
        self._snapshot_key: tuple[float, int] | None = None
        self._decision_pairs_cache: dict[tuple[date, date], list[EvalPair]] = {}

    # ------------------------------------------------------------ snapshot
    def _db_key(self) -> tuple[float, int]:
        path = settings.db_path
        try:
            stat = path.stat()
            return (stat.st_mtime, stat.st_size)
        except OSError:
            return (0.0, 0)

    def snapshot(self) -> Snapshot:
        key = self._db_key()
        if self._snapshot is not None and self._snapshot_key == key:
            return self._snapshot

        actuals = self.repo.actuals()
        forecasts = self.repo.forecasts()
        hourly_actuals = grids.build_hourly_actuals(actuals)
        vintages = grids.forecast_by_publish(forecasts)
        by_target: dict[datetime, list[tuple[datetime, float]]] = defaultdict(list)
        for row in forecasts:
            by_target[row.target_time].append((row.publish_time, row.generation_mw))
        delivery_dates = sorted(
            {date.fromisoformat(row.settlement_date) for row in actuals}
        )

        self._snapshot = Snapshot(
            actuals=actuals,
            forecasts=forecasts,
            hourly_actuals=hourly_actuals,
            vintages=vintages,
            by_target=dict(by_target),
            publish_times=sorted(vintages),
            delivery_dates=delivery_dates,
        )
        self._snapshot_key = key
        self._decision_pairs_cache.clear()
        log.info(
            "snapshot reloaded: %s actuals, %s forecast vintages",
            len(actuals),
            len(vintages),
        )
        return self._snapshot

    # --------------------------------------------------------------- helpers
    @property
    def tz(self):
        return settings.market_timezone

    def window(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> tuple[date, date]:
        """Analysis window; defaults to the configured pilot window (Jan 2026)."""
        lo = date_from or parse_date(settings.analysis_default_from)
        hi = date_to or parse_date(settings.analysis_default_to)
        if hi < lo:
            lo, hi = hi, lo
        return lo, hi

    def data_window(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> tuple[date, date]:
        """Full extent of the loaded dataset (used by the raw data endpoints)."""
        snap = self.snapshot()
        lo = date_from or (
            snap.delivery_dates[0] if snap.delivery_dates else date.today()
        )
        hi = date_to or (
            snap.delivery_dates[-1] if snap.delivery_dates else date.today()
        )
        if hi < lo:
            lo, hi = hi, lo
        return lo, hi

    def delivery_dates(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[date]:
        snap = self.snapshot()
        lo, hi = self.window(date_from, date_to)
        return [d for d in snap.delivery_dates if lo <= d <= hi]

    def _cutoff_for(self, delivery_date: date) -> datetime:
        return decision.decision_cutoff(
            delivery_date, settings.gate_closure_time, self.tz
        )

    def _actual_hours_for(self, delivery_date: date) -> dict[datetime, float]:
        hours = decision.delivery_day_hours(delivery_date, self.tz)
        snap = self.snapshot()
        return {
            hour: snap.hourly_actuals[hour].mean_mw
            for hour in hours
            if hour in snap.hourly_actuals
        }

    def _day_pairs(
        self, delivery_date: date, cutoff: datetime
    ) -> tuple[decision.PublishSelection, list[EvalPair]]:
        snap = self.snapshot()
        hours = decision.delivery_day_hours(delivery_date, self.tz)
        selection = decision.select_publish(snap.vintages, hours, cutoff)
        if selection.publish_time is None:
            return selection, []
        series = snap.vintages[selection.publish_time]
        forecast = {hour: series[hour] for hour in hours if hour in series}
        actual = self._actual_hours_for(delivery_date)
        pairs = metrics.build_pairs(
            forecast, actual, selection.publish_time, delivery_date
        )
        return selection, pairs

    # -------------------------------------------------------- decision view
    def decision_pairs(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[EvalPair]:
        """All decision-horizon pairs inside the analysis window (cached)."""
        lo, hi = self.window(date_from, date_to)
        cache_key = (lo, hi)
        cached = self._decision_pairs_cache.get(cache_key)
        if cached is not None:
            return cached

        pairs: list[EvalPair] = []
        for delivery_date in self.delivery_dates(lo, hi):
            _, day_pairs = self._day_pairs(
                delivery_date, self._cutoff_for(delivery_date)
            )
            pairs.extend(day_pairs)
        self._decision_pairs_cache[cache_key] = pairs
        return pairs

    def band_profile(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> BandProfile:
        return bands.build_band_profile(self.decision_pairs(date_from, date_to))

    def decision_view(
        self, delivery_date: date, as_of: datetime | None = None
    ) -> dict[str, Any]:
        """The day-ahead board for one delivery day."""
        snap = self.snapshot()
        cutoff = as_of or self._cutoff_for(delivery_date)
        hours = decision.delivery_day_hours(delivery_date, self.tz)
        selection, pairs = self._day_pairs(delivery_date, cutoff)
        profile = self.band_profile()

        publish_time = selection.publish_time
        forecast_hours = (
            {
                hour: snap.vintages[publish_time][hour]
                for hour in hours
                if hour in snap.vintages[publish_time]
            }
            if publish_time
            else {}
        )
        actual_hours = self._actual_hours_for(delivery_date)

        # --- hourly banded series -----------------------------------------
        banded = bands.apply_band(forecast_hours, profile, 0.95)
        banded_by_target = {row["target_time"]: row for row in banded}
        hourly_series = []
        for hour in hours:
            entry = {
                "target_time": hour.isoformat(),
                "local_hour": hour.astimezone(self.tz).strftime("%H:%M"),
                "forecast_mw": round(forecast_hours[hour], 1)
                if hour in forecast_hours
                else None,
                "actual_mw": round(actual_hours[hour], 1)
                if hour in actual_hours
                else None,
                "error_mw": None,
                "band_lower_mw": None,
                "band_upper_mw": None,
            }
            if hour in forecast_hours and hour in actual_hours:
                entry["error_mw"] = round(forecast_hours[hour] - actual_hours[hour], 1)
            row = banded_by_target.get(hour.isoformat())
            if row:
                entry["band_lower_mw"] = row["band_lower_mw"]
                entry["band_upper_mw"] = row["band_upper_mw"]
            hourly_series.append(entry)

        # --- settlement-period (indicative step-hold) series ---------------
        sp_series = self._settlement_period_series(delivery_date, forecast_hours)

        # --- daily aggregates ----------------------------------------------
        stats = metrics.summarize(pairs)
        forecast_mwh = sum(v * 1.0 for v in forecast_hours.values())
        actual_mwh = sum(
            row.generation_mw * 0.5
            for row in snap.actuals
            if row.settlement_date == delivery_date.isoformat()
        )
        delivery_hours_covered = len(forecast_hours)

        summary = {
            "delivery_date": delivery_date.isoformat(),
            "cutoff": cutoff.isoformat(),
            "cutoff_local": cutoff.astimezone(self.tz).isoformat(),
            "gate_closure_local": settings.gate_closure_time.strftime("%H:%M"),
            "selected_publish": selection.as_dict(),
            "coverage": {
                "forecast_hours": delivery_hours_covered,
                "expected_hours": len(hours),
                "actual_hours": len(actual_hours),
            },
            "daily": {
                "forecast_energy_mwh": round(forecast_mwh, 1),
                "actual_energy_mwh": round(actual_mwh, 1),
                "error_mwh": round(forecast_mwh - actual_mwh, 1),
                "error_pct": (
                    (forecast_mwh - actual_mwh) / actual_mwh * 100.0
                    if actual_mwh
                    else None
                ),
                "mae_mw": stats["mae_mw"],
                "rmse_mw": stats["rmse_mw"],
                "bias_mw": stats["bias_mw"],
                "nmae_pct": stats["nmae_pct"],
                "n": stats["n"],
                "mean_actual_mw": stats["mean_actual_mw"],
                "mean_forecast_mw": stats["mean_forecast_mw"],
            },
            "bands": self._band_payload(profile, delivery_hours_covered),
            "hourly_series": hourly_series,
            "settlement_series": sp_series,
            "timeline": self._timeline(delivery_date, cutoff),
        }
        return summary

    def _band_payload(self, profile: BandProfile, hours: int) -> dict:
        payload = profile.as_dict()
        energy = {}
        for level in BAND_LEVELS:
            key = f"p{round(level * 100)}"
            width = bands.band_for_level(profile, level)
            energy[key] = {
                "band_mw": round(width, 1),
                "band_mwh": round(width * hours, 1),
                "downside_mw": round(profile.downside_mw.get(key, 0.0), 1),
                "downside_mwh": round(profile.downside_mw.get(key, 0.0) * hours, 1),
                "upside_mw": round(profile.upside_mw.get(key, 0.0), 1),
                "upside_mwh": round(profile.upside_mw.get(key, 0.0) * hours, 1),
            }
        payload["energy"] = energy
        payload["reference"] = (
            "Empirical band calibrated on decision-horizon errors of the analysis window"
        )
        return payload

    def _settlement_period_series(
        self, delivery_date: date, forecast_hours: dict[datetime, float]
    ) -> list[dict]:
        """Half-hourly view (hourly forecast held flat across each hour)."""
        snap = self.snapshot()
        step_hold: dict[datetime, float] = {}
        for hour, value in forecast_hours.items():
            step_hold[hour] = value
            step_hold[hour + timedelta(minutes=30)] = value

        rows = sorted(
            (
                row
                for row in snap.actuals
                if row.settlement_date == delivery_date.isoformat()
            ),
            key=lambda r: r.settlement_period,
        )
        out = []
        for row in rows:
            forecast = step_hold.get(row.target_time)
            error = None
            if forecast is not None:
                error = round(forecast - row.generation_mw, 1)
            out.append(
                {
                    "settlement_period": row.settlement_period,
                    "target_time": row.target_time.isoformat(),
                    "local_time": row.target_time.astimezone(self.tz).strftime("%H:%M"),
                    "forecast_mw": round(forecast, 1) if forecast is not None else None,
                    "actual_mw": round(row.generation_mw, 1),
                    "error_mw": error,
                }
            )
        return out

    def _timeline(self, delivery_date: date, cutoff: datetime) -> list[dict]:
        """How the forecast for the delivery day evolved before the cut-off."""
        snap = self.snapshot()
        hours = decision.delivery_day_hours(delivery_date, self.tz)
        actual_hours = self._actual_hours_for(delivery_date)
        rows = []
        for publish_time, series in sorted(snap.vintages.items()):
            if publish_time > cutoff:
                continue
            forecast = {hour: series[hour] for hour in hours if hour in series}
            if not forecast:
                continue
            pairs = metrics.build_pairs(
                forecast, actual_hours, publish_time, delivery_date
            )
            stats = metrics.summarize(pairs)
            forecast_mwh = sum(forecast.values())
            actual_mwh = sum(actual_hours.values())
            rows.append(
                {
                    "publish_time": publish_time.isoformat(),
                    "publish_local": publish_time.astimezone(self.tz).strftime(
                        "%d %b %H:%M"
                    ),
                    "covered_hours": len(forecast),
                    "complete": len(forecast) == len(hours),
                    "mae_mw": round(stats["mae_mw"], 1),
                    "bias_mw": round(stats["bias_mw"], 1),
                    "rmse_mw": round(stats["rmse_mw"], 1),
                    "forecast_energy_mwh": round(forecast_mwh, 1),
                    "actual_energy_mwh": round(actual_mwh, 1),
                    "error_mwh": round(forecast_mwh - actual_mwh, 1),
                    "hours_before_cutoff": round(
                        (cutoff - publish_time).total_seconds() / 3600.0, 2
                    ),
                }
            )
        return rows

    # ------------------------------------------------------------- accuracy
    def accuracy_summary(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        lo, hi = self.window(date_from, date_to)
        pairs = self.decision_pairs(lo, hi)
        stats = metrics.summarize(pairs)
        profile = self.band_profile(lo, hi)
        series = metrics.daily_series(pairs)
        energy_errors = [row["error_mwh"] for row in series]
        return {
            "window": {"from": lo.isoformat(), "to": hi.isoformat()},
            "delivery_days": len(series),
            "headline": {
                "mae_mw": stats["mae_mw"],
                "rmse_mw": stats["rmse_mw"],
                "bias_mw": stats["bias_mw"],
                "nmae_pct": stats["nmae_pct"],
                "mape_pct": stats["mape_pct"],
                "smape_pct": stats["smape_pct"],
                "correlation": stats["correlation"],
                "n": stats["n"],
                "mean_actual_mw": stats["mean_actual_mw"],
                "mean_forecast_mw": stats["mean_forecast_mw"],
                "error_std_mw": stats["error_std_mw"],
            },
            "abs_error_quantiles_mw": stats["abs_error_quantiles_mw"],
            "signed_error_quantiles_mw": stats["signed_error_quantiles_mw"],
            "energy_error": {
                "mae_mwh": metrics.mae(energy_errors),
                "rmse_mwh": metrics.rmse(energy_errors),
                "bias_mwh": metrics.mean(energy_errors),
                "mean_absolute_pct": metrics.mean(
                    [abs(row["error_pct"]) for row in series]
                ),
            },
            "bands": self._band_payload(profile, len(self.delivery_dates(lo, hi)) * 24),
        }

    def accuracy_series(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[dict]:
        lo, hi = self.window(date_from, date_to)
        return metrics.daily_series(self.decision_pairs(lo, hi))

    def accuracy_by_lead_time(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        """Error vs forecast lead time, using every publication vintage."""
        lo, hi = self.window(date_from, date_to)
        snap = self.snapshot()
        hours = decision.delivery_day_hours
        pairs: list[EvalPair] = []
        for delivery_date in self.delivery_dates(lo, hi):
            day_hours = hours(delivery_date, self.tz)
            actual = self._actual_hours_for(delivery_date)
            for target in day_hours:
                if target not in actual:
                    continue
                for publish_time, value in snap.by_target.get(target, []):
                    if (
                        publish_time > target
                    ):  # never use a forecast published after the target
                        continue
                    pairs.append(
                        EvalPair(
                            target_time=target,
                            delivery_date=delivery_date,
                            publish_time=publish_time,
                            forecast_mw=value,
                            actual_mw=actual[target],
                            hours=1.0,
                        )
                    )
        return {
            "window": {"from": lo.isoformat(), "to": hi.isoformat()},
            "buckets": metrics.by_lead_time(pairs),
        }

    def accuracy_by_hour(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[dict]:
        lo, hi = self.window(date_from, date_to)
        return metrics.by_local_hour(self.decision_pairs(lo, hi))

    def accuracy_by_weekday(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[dict]:
        lo, hi = self.window(date_from, date_to)
        return metrics.by_weekday(self.decision_pairs(lo, hi))

    def accuracy_distribution(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        lo, hi = self.window(date_from, date_to)
        pairs = self.decision_pairs(lo, hi)
        errors = [p.error_mw for p in pairs]
        return {
            "window": {"from": lo.isoformat(), "to": hi.isoformat()},
            "histogram": metrics.histogram(errors, bin_count=28),
            "signed_error_quantiles_mw": metrics.summarize(pairs)[
                "signed_error_quantiles_mw"
            ],
            "abs_error_quantiles_mw": metrics.summarize(pairs)[
                "abs_error_quantiles_mw"
            ],
            "share_under_forecast_pct": (
                metrics.mean([1.0 if e < 0 else 0.0 for e in errors]) * 100.0
                if errors
                else 0.0
            ),
        }

    def accuracy_heatmap(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        lo, hi = self.window(date_from, date_to)
        return metrics.heatmap(self.decision_pairs(lo, hi))

    def accuracy_baselines(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        """Forecast skill against a naive persistence baseline (actual 24 h earlier)."""
        lo, hi = self.window(date_from, date_to)
        pairs = self.decision_pairs(lo, hi)
        snap = self.snapshot()
        baseline_pairs: list[EvalPair] = []
        for pair in pairs:
            previous = snap.hourly_actuals.get(pair.target_time - timedelta(hours=24))
            if previous is None:
                continue
            baseline_pairs.append(
                EvalPair(
                    target_time=pair.target_time,
                    delivery_date=pair.delivery_date,
                    publish_time=pair.publish_time,
                    forecast_mw=previous.mean_mw,
                    actual_mw=pair.actual_mw,
                    hours=1.0,
                )
            )
        skill = metrics.skill_score(pairs, baseline_pairs)
        return {
            "window": {"from": lo.isoformat(), "to": hi.isoformat()},
            "baseline": "persistence (actual generation 24 h earlier)",
            "skill": skill,
            "forecast_stats": metrics.summarize(pairs),
            "baseline_stats": metrics.summarize(baseline_pairs),
        }

    # --------------------------------------------------------------- export
    def ribbon_rows(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[dict]:
        """Per settlement-period error at the gate-closure cut-off.

        The hourly forecast vintage is held flat across the hour (step-hold) so
        the error can be expressed on the settlement-period grid the day-ahead
        market trades on.
        """
        lo, hi = self.window(date_from, date_to)
        snap = self.snapshot()
        by_settlement_date: dict[str, list[ActualRow]] = defaultdict(list)
        for row in snap.actuals:
            by_settlement_date[row.settlement_date].append(row)

        out: list[dict] = []
        for delivery_date in self.delivery_dates(lo, hi):
            selection, _ = self._day_pairs(
                delivery_date, self._cutoff_for(delivery_date)
            )
            if selection.publish_time is None:
                continue
            series = snap.vintages[selection.publish_time]
            step_hold: dict[datetime, float] = {}
            for hour, value in series.items():
                step_hold[hour] = value
                step_hold[hour + timedelta(minutes=30)] = value

            rows = sorted(
                by_settlement_date.get(delivery_date.isoformat(), []),
                key=lambda r: r.settlement_period,
            )
            for row in rows:
                forecast = step_hold.get(row.target_time)
                if forecast is None:
                    continue
                out.append(
                    {
                        "delivery_date": delivery_date.isoformat(),
                        "settlement_period": row.settlement_period,
                        "local_time": row.target_time.astimezone(self.tz).strftime(
                            "%H:%M"
                        ),
                        "forecast_mw": round(forecast, 1),
                        "actual_mw": round(row.generation_mw, 1),
                        "error_mw": round(forecast - row.generation_mw, 1),
                    }
                )
        return out

    def export_rows(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[dict]:
        lo, hi = self.window(date_from, date_to)
        rows = []
        for pair in self.decision_pairs(lo, hi):
            rows.append(
                {
                    "target_time_utc": pair.target_time.isoformat(),
                    "delivery_date": pair.delivery_date.isoformat(),
                    "publish_time_utc": pair.publish_time.isoformat(),
                    "horizon_hours": round(pair.horizon_hours, 2),
                    "forecast_mw": round(pair.forecast_mw, 2),
                    "actual_mw": round(pair.actual_mw, 2),
                    "error_mw": round(pair.error_mw, 2),
                    "abs_error_mw": round(pair.abs_error_mw, 2),
                }
            )
        return rows

    # ----------------------------------------------------------------- meta
    def meta(self) -> dict[str, Any]:
        snap = self.snapshot()
        coverage = self.repo.coverage()
        publish_times = snap.publish_times
        cadence: dict[str, int] = defaultdict(int)
        for publish_time in publish_times:
            cadence[publish_time.astimezone(self.tz).strftime("%H:%M")] += 1
        return {
            "product": "Wind Desk - day-ahead wind forecast & accuracy portal",
            "data_source": {
                "name": "Elexon Insights API (formerly BMRS)",
                "base_url": settings.elexon_api_base,
                "actuals_dataset": "FUELHH (fuelType=WIND)",
                "forecast_dataset": "WINDFOR",
                "note": (
                    "The legacy bmrs.elexon.co.uk endpoints in the brief now serve a retired "
                    "SPA shell; the live key-free API is data.elexon.co.uk/bmrs/api/v1 with "
                    "settlementDateFrom/To and publishDateTimeFrom/To parameters."
                ),
            },
            "market_rules": {
                "gate_closure_local": settings.gate_closure_time.strftime("%H:%M"),
                "timezone": str(settings.market_timezone),
                "delivery_day_basis": "GB settlement day (local)",
                "forecast_grid": "hourly",
                "actual_grid": "half-hourly (48 settlement periods/day)",
            },
            "coverage": coverage,
            "delivery_dates": {
                "from": snap.delivery_dates[0].isoformat()
                if snap.delivery_dates
                else None,
                "to": snap.delivery_dates[-1].isoformat()
                if snap.delivery_dates
                else None,
                "count": len(snap.delivery_dates),
            },
            "publication_cadence_local": dict(sorted(cadence.items())),
            "analysis_window": {
                "from": settings.analysis_default_from,
                "to": settings.analysis_default_to,
            },
            "generated_at": datetime.now(UTC).isoformat(),
        }

    def data_runs(self) -> list[dict]:
        return self.repo.data_runs()

    def actuals(
        self, date_from: date | None = None, date_to: date | None = None
    ) -> list[dict]:
        lo, hi = self.data_window(date_from, date_to)
        return [
            {
                "target_time": row.target_time.isoformat(),
                "settlement_date": row.settlement_date,
                "settlement_period": row.settlement_period,
                "generation_mw": row.generation_mw,
                "publish_time": row.publish_time.isoformat(),
            }
            for row in self.snapshot().actuals
            if lo.isoformat() <= row.settlement_date <= hi.isoformat()
        ]

    def forecasts(
        self, delivery_date: date | None = None, publish_time: datetime | None = None
    ) -> list[dict]:
        snap = self.snapshot()
        if publish_time is not None:
            series = snap.vintages.get(publish_time, {})
            return [
                {
                    "target_time": target.isoformat(),
                    "publish_time": publish_time.isoformat(),
                    "generation_mw": value,
                }
                for target, value in sorted(series.items())
            ]
        if delivery_date is not None:
            hours = set(decision.delivery_day_hours(delivery_date, self.tz))
            out = []
            for publish, series in sorted(snap.vintages.items()):
                for target in sorted(hours & set(series)):
                    out.append(
                        {
                            "target_time": target.isoformat(),
                            "publish_time": publish.isoformat(),
                            "generation_mw": series[target],
                        }
                    )
            return out
        return [
            {
                "target_time": row.target_time.isoformat(),
                "publish_time": row.publish_time.isoformat(),
                "generation_mw": row.generation_mw,
            }
            for row in snap.forecasts
        ]

    def available_publishes(self) -> list[str]:
        return [p.isoformat() for p in self.snapshot().publish_times]
