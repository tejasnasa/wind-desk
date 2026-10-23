"""Empirical confidence bands around the decision-time forecast.

R2 asks for the error to be *quantified* so the desk can trade against it.
Rather than assuming a normal distribution, the band is built from the
measured decision-horizon errors of the reference sample:

* ``downside`` - quantile of ``max(actual - forecast, 0)``: the extra thermal
  capacity a shortfall would force on the desk.
* ``upside``   - quantile of ``max(forecast - actual, 0)``: the surplus risk.
* ``flat``     - quantile of ``|error|``: symmetric planning buffer.
* ``scaled``   - quantile of ``|error| / mean daily actual`` re-applied to the
  level of the day being planned: a windy day carries a bigger absolute error.

The planning band used in the UI is the more conservative of ``flat`` and
``scaled`` for each confidence level.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Sequence

from .metrics import EvalPair, quantile

CONFIDENCE_LEVELS: tuple[float, ...] = (0.50, 0.80, 0.95)


@dataclass(frozen=True)
class BandProfile:
    """Empirical error distribution at decision horizon."""

    n: int
    flat_mw: dict[str, float]
    downside_mw: dict[str, float]
    upside_mw: dict[str, float]
    relative_pct: dict[str, float]
    mean_actual_mw: float

    @property
    def planning_mw(self) -> dict[str, float]:
        """More conservative of the flat and level-scaled band."""
        out: dict[str, float] = {}
        for level in CONFIDENCE_LEVELS:
            key = _key(level)
            scaled = self.relative_pct[key] / 100.0 * self.mean_actual_mw
            out[key] = max(self.flat_mw[key], scaled)
        return out

    def as_dict(self) -> dict:
        return {
            "n": self.n,
            "confidence_levels": [int(level * 100) for level in CONFIDENCE_LEVELS],
            "flat_mw": self.flat_mw,
            "downside_mw": self.downside_mw,
            "upside_mw": self.upside_mw,
            "relative_pct": self.relative_pct,
            "planning_mw": self.planning_mw,
            "mean_actual_mw": self.mean_actual_mw,
        }


def _key(level: float) -> str:
    return f"p{int(round(level * 100))}"


def build_band_profile(pairs: Sequence[EvalPair]) -> BandProfile:
    """Calibrate the empirical band from a set of decision-horizon pairs."""
    if not pairs:
        empty = {int(level * 100): 0.0 for level in CONFIDENCE_LEVELS}
        zero = {f"p{int(round(level * 100))}": 0.0 for level in CONFIDENCE_LEVELS}
        return BandProfile(
            n=0,
            flat_mw=zero,
            downside_mw=zero,
            upside_mw=zero,
            relative_pct=zero,
            mean_actual_mw=0.0,
        )

    abs_errors = [p.abs_error_mw for p in pairs]
    downsides = [max(p.actual_mw - p.forecast_mw, 0.0) for p in pairs]
    upsides = [max(p.forecast_mw - p.actual_mw, 0.0) for p in pairs]

    # Relative error is normalised by the mean actual of the day the pair
    # belongs to, so that a calm day is not judged against a windy reference.
    by_day: dict[object, list[float]] = {}
    day_mean: dict[object, float] = {}
    for pair in pairs:
        by_day.setdefault(pair.delivery_date, []).append(pair.actual_mw)
    for day, values in by_day.items():
        day_mean[day] = sum(values) / len(values)

    relatives = [
        p.abs_error_mw / day_mean[p.delivery_date]
        for p in pairs
        if day_mean.get(p.delivery_date, 0.0) > 0
    ]

    flat = {_key(level): quantile(abs_errors, level) for level in CONFIDENCE_LEVELS}
    downside = {_key(level): quantile(downsides, level) for level in CONFIDENCE_LEVELS}
    upside = {_key(level): quantile(upsides, level) for level in CONFIDENCE_LEVELS}
    relative = {
        _key(level): quantile(relatives, level) * 100.0 for level in CONFIDENCE_LEVELS
    }

    return BandProfile(
        n=len(pairs),
        flat_mw=flat,
        downside_mw=downside,
        upside_mw=upside,
        relative_pct=relative,
        mean_actual_mw=sum(p.actual_mw for p in pairs) / len(pairs),
    )


def band_for_level(profile: BandProfile, level: float) -> float:
    """Planning band (MW) for one confidence level."""
    key = _key(level)
    scaled = profile.relative_pct.get(key, 0.0) / 100.0 * profile.mean_actual_mw
    return max(profile.flat_mw.get(key, 0.0), scaled)


def apply_band(
    forecast: dict[datetime, float],
    profile: BandProfile,
    level: float,
) -> list[dict]:
    """Turn a forecast series into a banded series (MW)."""
    width = band_for_level(profile, level)
    out = []
    for target in sorted(forecast):
        value = forecast[target]
        out.append(
            {
                "target_time": target.isoformat(),
                "forecast_mw": round(value, 1),
                "band_lower_mw": round(value - width, 1),
                "band_upper_mw": round(value + width, 1),
                "band_width_mw": round(width, 1),
            }
        )
    return out


def energy_band_mwh(width_mw: float, hours: float) -> float:
    """Convert an MW band into an MWh band over a delivery window."""
    return width_mw * hours
