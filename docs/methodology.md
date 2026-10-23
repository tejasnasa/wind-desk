# Methodology, assumptions and limitations

This document is the technical reference for every number the Wind Desk portal shows.
It is deliberately explicit about the modelling decisions, because the whole value of the
product is that a buyer can trust the error figures.

---

## 1. Scope

| | |
|---|---|
| **Data** | Elexon `FUELHH` (actual generation, `fuelType=WIND`) and `WINDFOR` (published wind forecast) |
| **Decision window** | Purchase decisions made in **January 2026** → delivery days 2026‑01‑01 … 2026‑01‑31 |
| **Market** | GB day-ahead (SDW) auction; gate closure 11:00 local on D‑1 |
| **Out of scope** | Demand, prices, other fuel types, interconnector positions (per the brief: wind data only) |

Consequence of the last row: the application sizes the **wind side** of the balance. The
residual requirement is `demand − wind`; demand is the desk's own input, and the app
presents the wind forecast with a quantified error band rather than inventing a demand
model.

---

## 2. The decision rule

The GB day-ahead auction closes at **11:00 local time (Europe/London) on D‑1** for delivery
day D. The desk therefore decides at that instant and can only use information published
before it.

```
selected_vintage(D) = max { p : p.publish_time ≤ cutoff(D) }
cutoff(D)           = 11:00 local on (D − 1), expressed in UTC
```

* The cut-off is timezone-aware: in January, Europe/London equals UTC, so the cut-off is
  11:00 UTC; in BST months the same rule maps to 10:00 UTC. The application converts via
  `zoneinfo`, so the rule stays correct across the year.
* **Inclusive boundary**: a publication whose `publish_time` equals the cut-off is included
  (`≤`). The comparison is defined once, in `analytics/decision.py`, and is unit-tested.
* If the newest available publication does not cover every hour of the delivery day, the
  application falls back to the newest publication with *any* coverage and reports the gap
  explicitly (`coverage_ratio`, `note`) instead of silently showing a partial day.
* Any other cut-off can be requested (`?as_of=…`); this powers the information timeline,
  which shows every publication that existed before the cut-off and how the error evolved.

### Publication cadence (measured, not assumed)

The forecast is published eight times a day at **02:30, 04:30, 07:30, 09:30, 11:30, 15:30,
18:30 and 22:30 UTC**, each covering roughly 73 target hours (from 1.5 h before the
publication to ~45 h after it).

Consequence: **the 09:30 vintage is the newest information available at an 11:00 gate
closure**. The 11:30 publication arrives half an hour after the auction has closed — it is
visible in the information timeline but is never used for the decision.

---

## 3. Grid alignment — the central modelling decision

The two datasets do not share a time grid:

| Dataset | Resolution | Records per day |
|---|---|---|
| `FUELHH` actuals | half-hourly (30-minute settlement periods) | 48 |
| `WINDFOR` forecasts | hourly | 24 |

Any error metric therefore requires an explicit reconciliation. Two conversions are used,
both implemented in one module (`backend/app/analytics/grids.py`):

### 3.1 Hourly actuals (primary metrics)

The two settlement periods of an hour are combined into the hour's **energy-weighted mean**:

```
MWh(hour)  = Σ_{SP ∈ hour} generation_MW(SP) × 0.5 h
mean_MW    = MWh(hour) / 1 h
```

The hourly forecast for that hour is compared with `mean_MW`. This is the only comparison
that does not invent resolution: both sides of the error are hour-long averages.

*Primary error statistics are computed on this grid.*

### 3.2 Step-hold forecast (settlement-period view)

The hourly forecast is held constant across the two settlement periods it covers:

```
forecast(SP at H:00) = forecast(SP at H:30) = F(H)
```

This is what a desk actually does with an hourly forecast when it has to take a
half-hourly position, and it **preserves energy exactly** (1 MW for 1 h == 1 MW across two
30-minute periods — asserted in `tests/test_grids.py`).

What it does *not* do is invent the shape of a 30-minute ramp. The settlement-period table
and the error ribbon are therefore labelled *indicative* in the UI.

### 3.3 What is **not** done

* No interpolation of the forecast onto the half-hourly grid (that would fabricate
  resolution the publisher does not provide).
* No smoothing, no bias correction of the published forecast: the product measures the
  forecast as published, because that is what the desk buys against.

---

## 4. Error definitions

With `error = forecast − outturn`:

* **positive** → wind was **over-forecast** → the desk is **short** of renewable energy
  and must buy more thermal (or accept imbalance);
* **negative** → wind was **under-forecast** → the desk is long.

| Metric | Definition | Notes |
|---|---|---|
| MAE | `mean(\|error\|)` | the typical miss, in MW |
| RMSE | `sqrt(mean(error²))` | penalises large misses; RMSE ≥ MAE always |
| Bias | `mean(error)` | systematic direction; the commercial headline |
| nMAE | `MAE / mean(actual)` | scale-free; the headline for the desk |
| MAPE | `mean(\|error/actual\|)` | computed only where `\|actual\| ≥ 1 %` of the sample mean; the number of excluded periods is reported (`mape_excluded`) because percentage error is meaningless in a calm spell |
| sMAPE | `mean(\|error\| / ((|f|+|a|)/2))` | symmetric, defined even near zero |
| Correlation | Pearson, forecast vs outturn | shape fidelity |
| Energy error | `Σ error × Δt` per delivery day | in MWh — the quantity that drives the thermal purchase |
| Error quantiles | quantiles of \|error\| at P50/P75/P90/P95/P99 | the inputs to the planning band |
| Lead time | `target_time − publish_time` | the horizon at which a vintage was made |
| Skill score | `1 − MAE(forecast) / MAE(baseline)` | positive = the published forecast beats the baseline |

**Baseline.** Persistence: the actual generation from 24 hours earlier is used as the
"forecast". It is the assumption a desk falls back on when no forecast is trusted, and it
makes the published forecast's value explicit.

---

## 5. The confidence band

The band converts measured error into a procurement buffer. It is **empirical**, not
distributional — no normality assumption is made about wind forecast errors.

For a sample of decision-horizon errors:

```
flat      = quantile(|error|)                                  # MW
downside  = quantile(max(actual − forecast, 0))                # MW, wind shortfall
upside    = quantile(max(forecast − actual, 0))                # MW, wind surplus
relative  = quantile(|error| / mean_actual_of_that_day)        # dimensionless
scaled    = relative × mean_actual_of_the_day_being_planned    # MW
planning  = max(flat, scaled)                                  # MW, per confidence level
```

* The **level-scaled** variant matters because a windy day carries a bigger absolute error
  than a calm one; a flat band calibrated on the whole month would be too tight on windy
  days and too wide on calm ones.
* The planning band is the **more conservative** of the two at P50, P80 and P95.
* The band is applied to the forecast series to give lower/upper bounds per hour, and
  multiplied by the delivery-day hours to give an energy band in MWh/GWh.

**How a desk uses it.** With wind forecast `F` and band `B`, the residual requirement must
be covered up to `F − B` in the downside case: buy `demand − (F − B)` of thermal to be
protected against a 1‑in‑20 wind shortfall.

---

## 6. What the January 2026 pilot measured

31 delivery days, 744 hourly decision-horizon samples, 1,488 settlement periods.

| Quantity | Value |
|---|---|
| MAE | 2,122.8 MW |
| RMSE | 2,616.7 MW |
| Bias | +1,840.3 MW (over-forecast) |
| nMAE | 18.33 % |
| MAPE (guarded) | 22.06 % |
| sMAPE | 18.63 % |
| Correlation | 0.9280 |
| Mean actual / forecast output | 11,580.7 MW / 13,421.0 MW |
| Daily energy error | bias +44,167 MWh, mean \|error\| 45,833 MWh, RMSE 57,955 MWh |
| Error quantiles (absolute) | P50 1,714 · P75 3,018 · P90 4,312 · P95 5,419 · P99 6,261 MW |
| Planning band | P50 1,871 · P80 3,410 · P95 5,584 MW |
| Downside P95 | 1,146 MW (27,493 MWh per day) |
| Skill vs persistence | +46.4 % (forecast MAE 2,122.8 MW vs baseline 3,959.6 MW) |

### Error by forecast lead time

| Horizon | Samples | MAE (MW) | Bias (MW) |
|---|---|---|---|
| 0–6 h | 1,488 | 1,772 | 1,546 |
| 6–12 h | 1,488 | 1,843 | 1,613 |
| 12–24 h | 2,976 | 2,002 | 1,815 |
| 24–36 h | 2,976 | 2,136 | 1,836 |
| 36–48 h | 2,945 | 2,351 | 2,008 |
| 48–72 h | 2,510 | 2,381 | 1,466 |

Two readings:

1. **The forecast decays with horizon**, but gently: MAE roughly doubles between a 3-hour
   and a 48-hour horizon. The gate-closure vintage sits in the 12–36 h band.
2. **The bias is present at every horizon**, including 0–6 h. The over-forecast is a
   property of the published wind forecast itself in this month, not of the lead time —
   which is exactly the sort of thing the desk should know before it sizes its cover.

---

## 7. Data quality observations

* **Actuals are complete.** Every one of the 31 January delivery days carries all 48
  settlement periods; no nulls, no zero readings, no duplicate settlement periods.
  January 2026: min 1,695 MW, max 17,805 MW, mean 11,581 MW.
* **One off-cadence publication.** In the ingested window (2025‑12‑20 → 2026‑02‑01) the
  15 January publication arrived at **12:25 UTC** instead of 11:30 UTC. The decision rule
  is unaffected — the 09:30 vintage is still the newest information before an 11:00
  cut-off — and the anomaly is visible in the UI (the publication-cadence panel) and in
  the `data_run` provenance table.
* **Near-term forecast values are frozen.** For periods close to the target time the
  publisher repeats the same value across consecutive vintages (the current forecast is
  rolled forward), so short-horizon improvements are lumpy rather than smooth. This is
  visible in the information timeline as a flat segment.
* **Actuals are published about a day late.** The outturn for a settlement period is
  published roughly 24 h after the target time, so the board never shows an outturn a
  buyer could not have had at the time of the decision.
* **Coverage gaps are reported, not hidden.** Delivery days outside the ingested forecast
  window return `publish_time: null` with an explanatory note.

---

## 8. Limitations

1. **Wind only** — the app cannot state a total procurement requirement without demand.
2. **One month** — the band is a winter-month behaviour, not a year-round constant.
3. **In-sample band** — the band for a given day is calibrated on the window it is applied
   to. It describes January's measured behaviour rather than predicting it. The natural
   fix is a rolling out-of-sample calibration (e.g. trailing 60 days), which the service
   layer is already structured to support (`band_profile(date_from, date_to)`).
4. **Hourly forecast resolution** — half-hourly settlement errors are indicative.
5. **National aggregate only** — no spatial detail, so no regional balancing analysis.
6. **Single vintage per decision** — the decision rule assumes one publication is "the"
   forecast; in practice a desk might blend the last two vintages. The API supports any
   cut-off, so blending is a small extension.

---

## 9. Reproducibility

* The database is rebuilt from the public API with `make ingest` (or
  `docker compose run --rm ingest`). Re-running it reproduces every figure above.
* All analytics are pure functions over the loaded rows (`backend/app/analytics/`), unit
  tested against hand-computed fixtures (`backend/tests/test_metrics.py`).
* Every ingestion run is recorded in `data_run` with its exact query parameters, row
  counts and timestamps, and is surfaced in the portal's *Methodology → Data lineage* panel.
* No result is hard-coded anywhere in the API or the front-end.
