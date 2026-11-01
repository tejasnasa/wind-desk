# Part 2 — Technical review (architecture, design, analysis, code, practices)

**Rendered length:** 4:59 · **Audience:** the internal technical lead. **Tone:** a review
conversation — lead with the three hard problems, show how each was resolved, and point at
the code and the tests that prove it.

> The timings below are the ones in the rendered video
> (`tools/video/out/wind-desk-part2-technical-review.mp4`). The narration for every scene
> lives in [`../../tools/video/script.json`](../../tools/video/script.json), which is what
> the build actually reads.

---

## Scene 1 — Section card (4:17 – 4:24)

**Screen:** the Part 2 title card.

> "Part two: the architecture, the design, the analysis, and the code base."

---

## Scene 2 — Shape of the system (4:24 – 4:52)

**Screen:** the layered architecture diagram.

> "Three layers. Ingestion, pulling Elexon's FUEL H H and WINDFOR into SQLite with
> provenance. A pure analytics core with no input output. A FastAPI layer composing
> product views. The front end is React and TypeScript.
>
> SQLite is deliberate: thirty thousand rows, so docker compose up is dependency-free and
> the store ships in the serverless bundle."

---

## Scene 3 — Problem 1: the API in the brief is retired (4:52 – 5:48)

**Screen:** the "brief says / what actually works" comparison, with the parameter table.

> "First problem, and it would have sunk the project silently. The brief points at bmrs
> dot elexon dot co dot uk — that endpoint was retired, and the host now serves a shell
> page.
>
> The live, key-free API is the Elexon Insights API at data dot elexon dot co dot uk,
> slash bmrs, slash api, slash v one. Same resource names, different parameters.
>
> The trap: the legacy publish date parameter is silently ignored. The request looks
> successful and returns the wrong window. No error, just wrong data.
>
> We took the names from the published OpenAPI document and assert them in the client.
> The client also retries with backoff, chunks date windows, and upserts on natural keys,
> so the pipeline is idempotent."

**[ALT]** "Where is that code?" → `backend/app/data/elexon.py` (client) and
`backend/app/data/ingest.py` (upserts + provenance).

---

## Scene 4 — Problem 2: the two datasets are on different grids (5:48 – 6:40)

**Screen:** the half-hourly-vs-hourly diagram and the two alignment rules.

> "Second problem, and this decides whether the numbers mean anything. Actuals are
> half-hourly, forty-eight settlement periods a day. The forecast is hourly. So every
> metric needs an explicit reconciliation, in one place.
>
> Primary metrics compare the forecast hour with the energy-weighted mean of the two
> settlement periods in it. Both sides are hour-long averages, so no resolution is
> invented.
>
> The settlement-period view holds the hourly forecast flat across the hour, which
> preserves energy exactly — asserted in a test. We deliberately do not interpolate onto
> half-hours; that would fabricate a ramp the publisher never published. Sign convention:
> forecast minus outturn, so positive means the desk was short."

---

## Scene 5 — Problem 3: "the latest forecast" is a decision rule (6:40 – 7:18)

**Screen:** the decision rule, and the publication cadence with the cut-off marked.

> "Third problem: the phrase the latest forecast is ambiguous. The app must reproduce the
> desk's information set, not the newest vintage in the database.
>
> The rule is one line, defined once and unit tested: the latest publication with
> publish time less than or equal to the cut-off, eleven o'clock local on D minus one.
> The publisher issues eight vintages a day, so the newest at that cut-off is the
> nine-thirty.
>
> Because the rule is parameterised by cut-off, the same endpoint answers what did we
> know at ten o'clock — which builds the information timeline."

---

## Scene 6 — From measured error to a band (7:18 – 7:41)

**Screen:** the band card — quantiles, and the January numbers.

> "The promise is that the error is quantified in a form a buyer can trade against. We do
> not assume a normal distribution. The band is empirical.
>
> From the decision-horizon sample we take quantiles of the absolute error, the downside
> and the upside, plus a level-scaled variant, because a windy day carries a bigger error."

---

## Scene 7 — Codebase and practices (7:41 – 8:32)

**Screen:** the test map, the front-end gate, twelve-factor config and lineage.

> "The analytics core is pure functions over loaded rows, so the statistics are unit
> tested against hand-computed fixtures: mean absolute error, root mean squared error,
> quantiles, the MAPE near-zero guard, energy totals.
>
> Decision logic is tested at its boundaries: a publication exactly on the cut-off, one
> after it, incomplete coverage, none at all. Grid alignment has an energy-preservation
> test. Thirty-five tests, plus a type check and production build.
>
> Configuration is environment driven and twelve-factor; the same image runs locally, in
> Docker and on Vercel. Every ingestion run records its query, row counts and timestamps,
> and that lineage table is in the interface."

**[ALT]** "How do we refresh the data?" → `make ingest`, or `docker compose run --rm
ingest`, or the token-guarded `POST /api/admin/ingest`.

---

## Scene 8 — Deployment and honest limitations (8:32 – 9:06)

**Screen:** the deployment paths and the limitations panel.

> "Deployment: Docker for the containerised path, Vercel for the live demo. The app is a
> static build, the FastAPI service a Python function, with the SQLite store bundled
> read-only.
>
> And the limitations, which I would rather you hear from me. The pilot is wind-only and
> January-only, as scoped. The band is calibrated in-sample on the month it is applied to,
> so it describes January rather than predicting it. And the settlement-period errors are
> indicative."

---

## Scene 9 — Close (9:06 – 9:16)

**Screen:** the end card.

> "The repository holds the code, the data lineage, the methodology and the tests. Happy
> to go deeper on any part of it."

---

**Total: 4:59** — inside the brief's five-minute limit for Part 2. The whole video is
9:16, inside the ten-minute cap.
