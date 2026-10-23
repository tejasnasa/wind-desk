# Part 2 — Technical review (architecture, design, analysis, code, practices)

**Target length:** 4:50 · **Audience:** the internal technical lead. **Tone:** a review
conversation — lead with the three hard problems, show how each was resolved, and point at
the code and the tests that prove it.

---

## Scene 1 — Shape of the system (0:00 – 0:40)

**Screen:** the repository tree in the editor (`README.md` → "Repository layout"), then the
running app.

> "Three layers. An ingestion service that pulls Elexon's `FUELHH` and `WINDFOR` datasets
> into SQLite with provenance; a pure analytics core that has no I/O beyond a loaded
> snapshot; and a FastAPI layer that composes those into product views. The front-end is
> React, TypeScript and Vite, with the charts in Recharts.
>
> SQLite is deliberate. The pilot dataset is about thirty thousand rows, so SQLite keeps
> `docker compose up` dependency-free and lets the pre-seeded database ship inside the
> serverless function bundle. The SQLAlchemy layer is URL-driven, so moving to Postgres
> for production is a connection string."

---

## Scene 2 — Problem 1: the API in the brief is retired (0:40 – 1:15)

**Screen:** the Methodology page, "Data source" (S15).

> "First problem, and it would have sunk the project silently.
>
> The brief points at `bmrs.elexon.co.uk`. That endpoint was retired — the host now
> serves an SPA shell. The live, key-free API is the Elexon Insights API at
> `data.elexon.co.uk/bmrs/api/v1`, with the same resource names but different query
> parameters: `settlementDateFrom`/`settlementDateTo` for actuals,
> `publishDateTimeFrom`/`publishDateTimeTo` for forecasts.
>
> The trap is that the legacy `publishDate` parameter is *silently ignored*. A request
> that looks successful returns the wrong window — no error, just wrong data. We took the
> parameter names from the published OpenAPI document and assert them in the client.
>
> The client also retries with exponential backoff, chunks the date windows so a
> twelve-month pull never hits a response limit, and upserts on natural keys, so the
> pipeline is idempotent."

**[ALT]** "Where is that code?" → `backend/app/data/elexon.py` (client) and
`backend/app/data/ingest.py` (upserts + provenance).

---

## Scene 3 — Problem 2: the two datasets are on different grids (1:15 – 2:05)

**Screen:** `backend/app/analytics/grids.py`, then the settlement-period table (S8).

> "Second problem, and this one decides whether the numbers mean anything.
>
> Actuals are half-hourly — forty-eight settlement periods a day. The published forecast
> is *hourly*. So every error metric needs an explicit reconciliation, and that decision
> has to live in one place.
>
> We do two things. Primary metrics compare the forecast hour with the energy-weighted
> mean of the two settlement periods in that hour — both sides are then hour-long
> averages, and we invent no resolution. The settlement-period view holds the hourly
> forecast flat across the hour; that preserves energy exactly, and we assert that in a
> test.
>
> We deliberately do *not* interpolate the forecast onto half-hours: that would fabricate
> a thirty-minute ramp the publisher never published. The UI labels that view
> 'indicative' rather than pretending otherwise.
>
> The error sign convention is fixed and documented: forecast minus outturn. Positive
> means wind was over-forecast, so the desk was short."

---

## Scene 4 — Problem 3: "the latest forecast" is a decision rule (2:05 – 2:45)

**Screen:** `backend/app/analytics/decision.py`, then the information timeline (S6).

> "Third problem: 'the latest forecast' is ambiguous, and the app has to reproduce the
> desk's actual information set, not the newest vintage in the database.
>
> The rule is one line, defined once and unit-tested: the latest publication with
> `publish_time` less than or equal to the cut-off, where the cut-off is eleven o'clock
> local on D minus one. The publisher issues eight vintages a day, so at that cut-off the
> newest information is the 09:30 publication; the 11:30 one arrives after the auction
> has closed.
>
> Because the rule is parameterised by cut-off, the same endpoint answers 'what did we
> know at ten o'clock?' — that is what builds the information timeline, and it is how the
> desk can rehearse a decision before the real one."

---

## Scene 5 — From measured error to a band (2:45 – 3:20)

**Screen:** `backend/app/analytics/bands.py`, then the risk band panel (S7).

> "The product promise is that the error is quantified in a form a buyer can trade
> against. We do not assume a normal distribution; the band is empirical.
>
> From the decision-horizon sample we take quantiles of the absolute error, of the
> downside and of the upside, plus a level-scaled variant — errors relative to the mean
> output of the day they belong to, because a windy day carries a bigger absolute error.
> The planning band is the more conservative of the two at P50, P80 and P95.
>
> The result is a buffer in megawatts and in megawatt-hours per delivery day, which is
> what turns a forecast into a procurement quantity."

---

## Scene 6 — Codebase and practices (3:20 – 4:10)

**Screen:** the test suite running (`make test`), then the data-lineage table (S16).

> "On practices. The analytics core is pure functions over loaded rows — no I/O — so the
> statistics are unit-tested against hand-computed fixtures: MAE, RMSE, quantiles, the
> MAPE near-zero guard, energy totals, lead-time bucketing. The decision logic is tested
> at its boundaries: a publication exactly on the cut-off, one after it, incomplete
> coverage, and none at all. Grid alignment has its own energy-preservation test.
>
> Thirty-three tests, plus a TypeScript type-check and production build as the front-end
> gate.
>
> Configuration is environment-driven and twelve-factor; the same image runs locally, in
> Docker and on Vercel. Every ingestion run is recorded with its exact query, row counts
> and timestamps — that lineage table is in the UI, so any number on any screen can be
> traced to the API call that produced it."

**[ALT]** "How do we refresh the data?" → `make ingest`, or `docker compose run --rm
ingest`, or the token-guarded `POST /api/admin/ingest`.

---

## Scene 7 — Deployment and honest limitations (4:10 – 4:50)

**Screen:** `vercel.json` and `docker-compose.yml`, then the Methodology "Limitations"
panel (S15).

> "Deployment: Docker for the containerised path, Vercel for the live demo — the SPA is a
> static build and the FastAPI app is a Python function, with the SQLite store bundled
> and opened read-only, because a serverless filesystem is immutable. Heroku is supported
> through the combined container image. One `docker compose up` gives you the whole
> product.
>
> And the limitations, which I would rather you hear from me. The pilot is wind-only and
> January-only, as scoped. The band is calibrated in-sample on the month it is applied
> to, so it describes January's behaviour rather than predicting it — a rolling
> out-of-sample calibration is the next build. And the settlement-period errors are
> indicative, because the forecast itself is hourly.
>
> Those are the three things I would change first, and none of them change the method."

---

**Total: ≈ 4:50.**
