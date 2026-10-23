"""Forecast error statistics.

Pure functions over :class:`EvalPair` objects - no I/O, no globals - so the
numbers the client sees can be re-derived by hand and unit tested.

Sign convention
---------------
``error = forecast - actual`` in MW.

* positive error -> the forecast was **above** the outturn (wind under-delivered,
  so the desk was short of renewable energy and needed more thermal);
* negative error -> wind over-delivered.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from typing import Callable, Iterable, Sequence

# Lead-time buckets (hours between publication and target time).
LEAD_BUCKETS: list[tuple[float, float, str]] = [
    (0.0, 6.0, "0-6h"),
    (6.0, 12.0, "6-12h"),
    (12.0, 24.0, "12-24h"),
    (24.0, 36.0, "24-36h"),
    (36.0, 48.0, "36-48h"),
    (48.0, 72.0, "48-72h"),
    (72.0, math.inf, ">72h"),
]


@dataclass(frozen=True)
class EvalPair:
    """A forecast/actual comparison for one time bucket."""

    target_time: datetime
    delivery_date: date
    publish_time: datetime
    forecast_mw: float
    actual_mw: float
    hours: float = 1.0

    @property
    def error_mw(self) -> float:
        return self.forecast_mw - self.actual_mw

    @property
    def abs_error_mw(self) -> float:
        return abs(self.error_mw)

    @property
    def error_mwh(self) -> float:
        return self.error_mw * self.hours

    @property
    def horizon_hours(self) -> float:
        return (self.target_time - self.publish_time).total_seconds() / 3600.0

    @property
    def local_hour(self) -> int:
        return self.target_time.hour


# --------------------------------------------------------------------- basics
def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def stdev(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = mean(values)
    return math.sqrt(sum((v - mu) ** 2 for v in values) / (len(values) - 1))


def quantile(values: Sequence[float], q: float) -> float:
    """Linear-interpolation quantile (numpy 'linear' method), q in [0, 1]."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * min(max(q, 0.0), 1.0)
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return ordered[int(position)]
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return num / den if den else 0.0


def mae(errors: Sequence[float]) -> float:
    return mean([abs(e) for e in errors]) if errors else 0.0


def bias(errors: Sequence[float]) -> float:
    """Mean signed error - positive means the forecast was above the outturn."""
    return mean(errors) if errors else 0.0


def rmse(errors: Sequence[float]) -> float:
    if not errors:
        return 0.0
    return math.sqrt(sum(e * e for e in errors) / len(errors))


def mape(pairs: Sequence[EvalPair], floor_ratio: float = 0.01) -> tuple[float, int]:
    """Mean absolute percentage error with a near-zero guard.

    Percentage error is meaningless when the outturn approaches zero (a calm
    spell), so periods whose actual is below ``floor_ratio`` of the sample mean
    are excluded and reported separately.
    """
    if not pairs:
        return 0.0, 0
    mean_actual = mean([p.actual_mw for p in pairs])
    threshold = max(floor_ratio * mean_actual, 1e-9)
    usable = [p for p in pairs if abs(p.actual_mw) >= threshold]
    if not usable:
        return 0.0, len(pairs)
    value = mean([abs(p.error_mw / p.actual_mw) for p in usable]) * 100.0
    return value, len(pairs) - len(usable)


def smape(pairs: Sequence[EvalPair]) -> float:
    """Symmetric MAPE - defined even when the outturn is close to zero."""
    if not pairs:
        return 0.0
    values = []
    for pair in pairs:
        denominator = (abs(pair.forecast_mw) + abs(pair.actual_mw)) / 2.0
        if denominator < 1e-9:
            continue
        values.append(abs(pair.forecast_mw - pair.actual_mw) / denominator)
    return mean(values) * 100.0 if values else 0.0


# ---------------------------------------------------------------- summaries
def summarize(pairs: Sequence[EvalPair]) -> dict:
    """Headline error statistics for a set of comparisons."""
    if not pairs:
        return {
            "n": 0,
            "mae_mw": 0.0,
            "rmse_mw": 0.0,
            "bias_mw": 0.0,
            "nmae_pct": 0.0,
            "mape_pct": 0.0,
            "mape_excluded": 0,
            "smape_pct": 0.0,
            "correlation": 0.0,
            "mean_actual_mw": 0.0,
            "mean_forecast_mw": 0.0,
            "error_std_mw": 0.0,
            "abs_error_quantiles_mw": {},
            "signed_error_quantiles_mw": {},
        }

    errors = [p.error_mw for p in pairs]
    actuals = [p.actual_mw for p in pairs]
    forecasts = [p.forecast_mw for p in pairs]
    abs_errors = [abs(e) for e in errors]
    mean_actual = mean(actuals)
    mape_value, mape_excluded = mape(pairs)

    return {
        "n": len(pairs),
        "mae_mw": mae(errors),
        "rmse_mw": rmse(errors),
        "bias_mw": mean(errors),
        "nmae_pct": (mae(errors) / mean_actual * 100.0) if mean_actual else 0.0,
        "mape_pct": mape_value,
        "mape_excluded": mape_excluded,
        "smape_pct": smape(pairs),
        "correlation": pearson(forecasts, actuals),
        "mean_actual_mw": mean_actual,
        "mean_forecast_mw": mean(forecasts),
        "error_std_mw": stdev(errors),
        "abs_error_quantiles_mw": {
            f"p{int(q * 100)}": quantile(abs_errors, q)
            for q in (0.5, 0.75, 0.9, 0.95, 0.99)
        },
        "signed_error_quantiles_mw": {
            f"p{int(q * 100)}": quantile(errors, q)
            for q in (0.05, 0.25, 0.5, 0.75, 0.95)
        },
    }


def group_stats(
    pairs: Sequence[EvalPair], key: Callable[[EvalPair], object]
) -> list[dict]:
    """Aggregate pairs into groups, preserving the group's sort key order."""
    buckets: dict[object, list[EvalPair]] = defaultdict(list)
    for pair in pairs:
        buckets[key(pair)].append(pair)
    out = []
    for group_key in sorted(buckets, key=lambda k: (str(type(k)), str(k))):
        stats = summarize(buckets[group_key])
        out.append({"key": str(group_key), **stats})
    return out


def by_lead_time(pairs: Sequence[EvalPair]) -> list[dict]:
    """Error as a function of how far ahead the forecast was published."""
    buckets: dict[str, list[EvalPair]] = defaultdict(list)
    for pair in pairs:
        horizon = pair.horizon_hours
        for low, high, label in LEAD_BUCKETS:
            if low < horizon <= high:
                buckets[label].append(pair)
                break
    order = [label for _, _, label in LEAD_BUCKETS]
    out = []
    for label in order:
        if label not in buckets:
            continue
        stats = summarize(buckets[label])
        out.append({"key": label, **stats})
    return out


def by_local_hour(pairs: Sequence[EvalPair]) -> list[dict]:
    buckets: dict[int, list[EvalPair]] = defaultdict(list)
    for pair in pairs:
        buckets[pair.local_hour].append(pair)
    return [
        {"key": f"{hour:02d}:00", **summarize(buckets[hour])}
        for hour in sorted(buckets)
    ]


def by_weekday(pairs: Sequence[EvalPair]) -> list[dict]:
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    buckets: dict[int, list[EvalPair]] = defaultdict(list)
    for pair in pairs:
        buckets[pair.delivery_date.weekday()].append(pair)
    return [{"key": names[wd], **summarize(buckets[wd])} for wd in sorted(buckets)]


def daily_series(pairs: Sequence[EvalPair]) -> list[dict]:
    """Per delivery-day series including energy totals (the procurement view)."""
    buckets: dict[date, list[EvalPair]] = defaultdict(list)
    for pair in pairs:
        buckets[pair.delivery_date].append(pair)

    out = []
    for day in sorted(buckets):
        day_pairs = buckets[day]
        stats = summarize(day_pairs)
        forecast_mwh = sum(p.forecast_mw * p.hours for p in day_pairs)
        actual_mwh = sum(p.actual_mw * p.hours for p in day_pairs)
        out.append(
            {
                "delivery_date": day.isoformat(),
                "n": len(day_pairs),
                "mae_mw": stats["mae_mw"],
                "rmse_mw": stats["rmse_mw"],
                "bias_mw": stats["bias_mw"],
                "nmae_pct": stats["nmae_pct"],
                "forecast_energy_mwh": forecast_mwh,
                "actual_energy_mwh": actual_mwh,
                "error_mwh": forecast_mwh - actual_mwh,
                "error_pct": (
                    (forecast_mwh - actual_mwh) / actual_mwh * 100.0
                    if actual_mwh
                    else 0.0
                ),
                "mean_actual_mw": stats["mean_actual_mw"],
                "mean_forecast_mw": stats["mean_forecast_mw"],
                "bias_pct": (
                    stats["bias_mw"] / stats["mean_actual_mw"] * 100.0
                    if stats["mean_actual_mw"]
                    else 0.0
                ),
            }
        )
    return out


def histogram(values: Sequence[float], bin_count: int = 24) -> dict:
    """Equal-width histogram of error values."""
    if not values:
        return {"bins": [], "count": 0, "min": 0.0, "max": 0.0}
    low, high = min(values), max(values)
    if math.isclose(low, high):
        high = low + 1.0
    width = (high - low) / bin_count
    counts = [0] * bin_count
    for value in values:
        index = min(int((value - low) / width), bin_count - 1)
        counts[index] += 1
    return {
        "bins": [
            {
                "from": low + i * width,
                "to": low + (i + 1) * width,
                "mid": low + (i + 0.5) * width,
                "count": counts[i],
            }
            for i in range(bin_count)
        ],
        "count": len(values),
        "min": low,
        "max": high,
    }


def heatmap(pairs: Sequence[EvalPair]) -> dict:
    """Delivery day x local hour matrix of mean errors (MW)."""
    cells: dict[date, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
    for pair in pairs:
        cells[pair.delivery_date][pair.local_hour].append(pair.error_mw)

    days = sorted(cells)
    matrix = []
    for day in days:
        row = []
        for hour in range(24):
            values = cells[day].get(hour)
            row.append(round(mean(values), 1) if values else None)
        matrix.append(row)
    return {
        "days": [d.isoformat() for d in days],
        "hours": list(range(24)),
        "matrix": matrix,
    }


def skill_score(pairs: Sequence[EvalPair], baseline_pairs: Sequence[EvalPair]) -> dict:
    """Forecast skill relative to a naive baseline.

    A positive score means the published forecast beats the baseline.
    """
    if not pairs or not baseline_pairs:
        return {"skill_score_pct": 0.0, "mae_mw": 0.0, "baseline_mae_mw": 0.0}
    forecast_mae = mae([p.error_mw for p in pairs])
    baseline_mae = mae([p.error_mw for p in baseline_pairs])
    score = (1.0 - forecast_mae / baseline_mae) * 100.0 if baseline_mae else 0.0
    return {
        "skill_score_pct": score,
        "mae_mw": forecast_mae,
        "baseline_mae_mw": baseline_mae,
    }


def build_pairs(
    forecast: dict[datetime, float],
    actual: dict[datetime, float],
    publish_time: datetime,
    delivery_date: date,
) -> list[EvalPair]:
    """Pair up forecast and actual values on matching hourly buckets."""
    pairs: list[EvalPair] = []
    for target in sorted(set(forecast) & set(actual)):
        pairs.append(
            EvalPair(
                target_time=target,
                delivery_date=delivery_date,
                publish_time=publish_time,
                forecast_mw=forecast[target],
                actual_mw=actual[target],
                hours=1.0,
            )
        )
    return pairs


def iter_pairs(pairs: Iterable[EvalPair]) -> list[EvalPair]:
    return list(pairs)
