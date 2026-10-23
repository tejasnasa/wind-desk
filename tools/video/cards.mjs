/**
 * Render the Part 1 / Part 2 slide cards to 1920x1080 PNGs.
 *
 * The cards reuse the application's own design tokens (paper ground, maritime
 * teal, rust / pine signal colours, Archivo + IBM Plex Mono) so the technical
 * half of the video reads as the same product as the client half.
 *
 *   node tools/video/cards.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const work = join(here, "work");
const outDir = join(work, "cards");
mkdirSync(outDir, { recursive: true });

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const TOKENS = `
  --paper:#eef1f4; --surface:#ffffff; --surface-sunk:#e7ebf0;
  --ink:#101822; --ink-soft:#55626e; --ink-faint:#8a95a1;
  --rule:#c9d2dc; --rule-soft:#e0e5eb;
  --sea:#0e6e7d; --sea-deep:#08454f; --sea-wash:rgba(14,110,125,.13);
  --sea-line:rgba(14,110,125,.4);
  --rust:#b4531b; --rust-wash:rgba(180,83,27,.14);
  --pine:#3f6212; --pine-wash:rgba(63,98,18,.14); --amber:#9a7500;
`;

const BASE = `
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  :root{${TOKENS}}
  body{
    width:1920px;height:1080px;overflow:hidden;
    background:var(--paper);color:var(--ink);
    font-family:'Archivo',ui-sans-serif,system-ui,sans-serif;
    font-size:22px;line-height:1.5;-webkit-font-smoothing:antialiased;
    display:flex;flex-direction:column;
  }
  .ground{position:absolute;inset:0;pointer-events:none;
    background-image:
      linear-gradient(to right,var(--rule-soft) 1px,transparent 1px),
      linear-gradient(to bottom,var(--rule-soft) 1px,transparent 1px);
    background-size:96px 96px;opacity:.55}
  .frame{position:relative;z-index:2;display:flex;flex-direction:column;
    height:100%;padding:72px 96px 64px}
  .body{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;
    justify-content:center;padding-bottom:8px}
  .body--top{justify-content:flex-start}
  .rule{height:1px;background:var(--rule);margin:0}
  .kicker{font-family:'IBM Plex Mono',monospace;font-size:20px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--sea);font-weight:500}
  .kicker--muted{color:var(--ink-faint)}
  h1{font-size:104px;font-weight:700;letter-spacing:-.025em;line-height:1.02}
  h2{font-size:58px;font-weight:600;letter-spacing:-.018em;line-height:1.1}
  h3{font-size:30px;font-weight:600;letter-spacing:-.01em}
  p{color:var(--ink-soft);font-size:24px;line-height:1.55}
  .mono{font-family:'IBM Plex Mono',monospace}
  .lead{font-size:30px;color:var(--ink);max-width:1180px;font-weight:500}
  .sub{font-size:24px;color:var(--ink-soft)}
  .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;
    font-family:'IBM Plex Mono',monospace;font-size:17px;color:var(--ink-faint);
    letter-spacing:.04em;padding-top:26px;border-top:1px solid var(--rule)}
  .wordmark{font-weight:700;letter-spacing:.16em;font-size:19px;color:var(--ink)}
  .wordmark em{font-style:normal;color:var(--sea)}
  .card{background:var(--surface);border:1px solid var(--rule);border-radius:4px;
    padding:26px 28px;box-shadow:0 1px 2px rgba(16,24,34,.05)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:26px}
  .tag{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:16px;
    letter-spacing:.1em;text-transform:uppercase;padding:5px 11px;border-radius:3px;
    background:var(--sea-wash);color:var(--sea-deep);font-weight:500}
  .tag--rust{background:var(--rust-wash);color:var(--rust)}
  .tag--pine{background:var(--pine-wash);color:var(--pine)}
  ul{list-style:none}
  li{position:relative;padding-left:26px;margin-bottom:12px;color:var(--ink-soft);font-size:22px}
  li::before{content:'';position:absolute;left:0;top:12px;width:11px;height:2px;background:var(--sea)}
  .accent{color:var(--rust)}
  .good{color:var(--pine)}
`;

/** Wrap slide body markup in the shared frame. */
function frame({ kicker, body, footLeft, footRight, variant = "" }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style>
<style>${variant}</style></head><body>
<div class="ground"></div>
<div class="frame">
  ${kicker ? `<div class="kicker" style="margin-bottom:26px">${kicker}</div>` : ""}
  <div class="body">${body}</div>
  <div class="foot">
    <span class="wordmark">WIND<em>·</em>DESK</span>
    <span>${footLeft ?? ""}</span>
    <span>${footRight ?? ""}</span>
  </div>
</div></body></html>`;
}

/* ----------------------------------------------------------------- slides */

const slides = {};

/* -- title / section / close / end ------------------------------------- */

slides.title = (s) =>
  frame({
    kicker: "Pilot delivery · National wind · January 2026 decisions",
    body: `<div style="display:grid;grid-template-columns:1.15fr .85fr;gap:70px;align-items:center">
    <div>
      <h1>${s.heading}</h1>
      <div class="rule" style="width:180px;margin:30px 0 30px;background:var(--sea);height:3px"></div>
      <p class="lead">${s.subheading}</p>
      <p class="sub" style="margin-top:22px;font-size:21px">Built on Elexon's public <span class="mono">FUELHH</span> actuals and <span class="mono">WINDFOR</span> forecasts.</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px">
      ${[
        ["2,123 MW", "mean absolute error at gate closure"],
        ["+1,840 MW", "systematic bias — wind over-forecast"],
        ["+46%", "skill against a persistence forecast"],
      ]
        .map(
          ([v, l]) =>
            `<div class="card" style="border-left:3px solid var(--sea);padding:20px 24px">
        <div class="mono" style="font-size:38px;font-weight:600;color:var(--sea-deep);letter-spacing:-.02em">${v}</div>
        <div style="font-size:19px;color:var(--ink-soft);margin-top:4px">${l}</div>
      </div>`,
        )
        .join("")}
      <div class="mono" style="font-size:17px;color:var(--ink-faint);margin-top:6px">31 delivery days · 744 hourly samples · Jan 2026</div>
    </div>
  </div>`,
    footRight: "data.elexon.co.uk · FUELHH + WINDFOR",
  });

slides.section = (s) =>
  frame({
    kicker: "",
    body: `<div style="margin:auto 0;display:flex;align-items:center;gap:56px">
      <div style="width:14px;height:320px;background:var(--sea)"></div>
      <div>
        <div class="kicker kicker--muted" style="margin-bottom:18px">Part two</div>
        <h1 style="font-size:88px">${s.subheading}</h1>
        <p class="sub" style="margin-top:26px">${s.meta}</p>
      </div>
    </div>`,
    footRight: "Wind Desk · technical review",
  });

slides.close = (s) =>
  frame({
    kicker: "What I would build next",
    body: `<div style="margin:auto 0">
      <h2 style="font-size:70px">${s.heading}</h2>
      <p class="lead" style="margin-top:16px">${s.subheading}</p>
      <div class="grid3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:46px">
        ${[
          "Rolling out-of-sample calibration",
          "Other renewables & interconnector",
          "Residual requirement → purchase quantity",
        ]
          .map(
            (
              t,
              i,
            ) => `<div class="card" style="border-left:3px solid var(--sea)">
          <div class="kicker kicker--muted" style="margin-bottom:10px">0${i + 1}</div>
          <div style="font-size:23px;font-weight:500;line-height:1.35">${t}</div>
        </div>`,
          )
          .join("")}
      </div>
    </div>`,
    footRight: "Wind-only · January-only · as scoped",
  });

slides.end = (s) =>
  frame({
    kicker: "Wind Desk · day-ahead wind forecast & accuracy portal",
    body: `<div style="margin:auto 0">
      <h1>${s.heading}</h1>
      <div class="rule" style="width:180px;margin:30px 0 30px;background:var(--sea);height:3px"></div>
      <p class="lead">${s.subheading}</p>
    </div>`,
    footRight: "github.com/<anonymous-repo>",
  });

/* -- architecture ------------------------------------------------------- */

slides.architecture = () =>
  frame({
    kicker: "Shape of the system",
    body: `<h2>Three layers, one snapshot in between</h2>
    <div style="display:flex;flex-direction:column;gap:16px;margin-top:34px">
      <div class="card" style="display:grid;grid-template-columns:300px 1fr 340px;align-items:center;gap:26px;border-left:4px solid var(--sea)">
        <div><span class="tag">Ingestion</span><div style="margin-top:10px;font-weight:600;font-size:24px">Elexon client → SQLite</div></div>
        <div class="mono" style="font-size:18px;color:var(--ink-soft)">FUELHH (actuals) · WINDFOR (forecasts)<br/>retry + backoff · chunked windows · idempotent upserts<br/><span style="color:var(--sea-deep)">data_run: exact query, row counts, timestamps</span></div>
        <div class="mono" style="font-size:18px;color:var(--ink-soft)">backend/app/data/<br/>elexon.py · ingest.py</div>
      </div>
      <div class="card" style="display:grid;grid-template-columns:300px 1fr 340px;align-items:center;gap:26px;border-left:4px solid var(--amber)">
        <div><span class="tag" style="background:rgba(154,117,0,.14);color:var(--amber)">Analytics core</span><div style="margin-top:10px;font-weight:600;font-size:24px">Pure functions, no I/O</div></div>
        <div class="mono" style="font-size:18px;color:var(--ink-soft)">grids.py (hourly ⇄ half-hourly) · decision.py (gate-closure vintage)<br/>metrics.py (MAE/RMSE/bias/quantiles) · bands.py (empirical band)</div>
        <div class="mono" style="font-size:18px;color:var(--ink-soft)">backend/app/analytics/</div>
      </div>
      <div class="card" style="display:grid;grid-template-columns:300px 1fr 340px;align-items:center;gap:26px;border-left:4px solid var(--pine)">
        <div><span class="tag tag--pine">Product layer</span><div style="margin-top:10px;font-weight:600;font-size:24px">FastAPI → React</div></div>
        <div class="mono" style="font-size:18px;color:var(--ink-soft)">/api/decision/{day} · /api/accuracy/* · /api/meta<br/>SPA served from the same origin</div>
        <div class="mono" style="font-size:18px;color:var(--ink-soft)">backend/app/api/routes.py<br/>frontend/src/</div>
      </div>
    </div>
    <p class="sub" style="margin-top:26px">SQLite by choice: ~30k rows, so <span class="mono">docker compose up</span> is dependency-free and the pre-seeded store ships inside the serverless bundle. The SQLAlchemy layer is URL-driven — Postgres is a connection string.</p>`,
    footRight: "SQLAlchemy · FastAPI · React · TypeScript · Vite · Recharts",
  });

/* -- API migration ------------------------------------------------------ */

slides["api-migration"] = () =>
  frame({
    kicker: "Problem 1",
    body: `<h2>The API in the brief is retired</h2>
    <div class="grid2" style="margin-top:30px;grid-template-columns:1fr 1fr">
      <div class="card" style="border-top:3px solid var(--rust)">
        <span class="tag tag--rust">The brief says</span>
        <div class="mono" style="font-size:21px;margin-top:16px;color:var(--ink)">bmrs.elexon.co.uk<br/>/api-documentation/endpoint/datasets/FUELHH/stream</div>
        <p style="margin-top:16px;font-size:21px">That host now serves a single-page shell. No error, no data — just a different document.</p>
      </div>
      <div class="card" style="border-top:3px solid var(--pine)">
        <span class="tag tag--pine">What actually works</span>
        <div class="mono" style="font-size:21px;margin-top:16px;color:var(--ink)">data.elexon.co.uk/bmrs/api/v1<br/>FUELHH · WINDFOR</div>
        <p style="margin-top:16px;font-size:21px">Key-free, same resource names, different query parameters. Documented in the published OpenAPI spec.</p>
      </div>
    </div>
    <div class="card" style="margin-top:24px">
      <div class="kicker kicker--muted" style="margin-bottom:16px">Parameter names are asserted in the client</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;font-family:'IBM Plex Mono',monospace;font-size:19px">
        <div>
          <div style="color:var(--ink-faint);margin-bottom:8px">FUELHH · actuals</div>
          <div style="color:var(--sea-deep)">fuelType[]=WIND</div>
          <div style="color:var(--sea-deep)">settlementDateFrom / settlementDateTo</div>
        </div>
        <div>
          <div style="color:var(--ink-faint);margin-bottom:8px">WINDFOR · forecasts</div>
          <div style="color:var(--sea-deep)">publishDateTimeFrom / publishDateTimeTo</div>
          <div style="color:var(--rust)">✕ publishDate — silently ignored</div>
        </div>
      </div>
    </div>
    <p class="sub" style="margin-top:22px">The legacy <span class="mono">publishDate</span> parameter is accepted and dropped: the request looks successful and returns the wrong window. Taking the names from the OpenAPI document and asserting them in the client is the fix.</p>`,
    footRight: "backend/app/data/elexon.py",
  });

/* -- grid alignment ----------------------------------------------------- */

slides.grids = () =>
  frame({
    kicker: "Problem 2",
    body: `<h2>The two datasets are on different grids</h2>
    <div class="grid2" style="margin-top:28px;grid-template-columns:1fr 1fr">
      <div class="card">
        <span class="tag">Actuals · FUELHH</span>
        <div style="margin-top:16px;font-size:22px;font-weight:600">Half-hourly · 48 settlement periods a day</div>
        <div style="display:flex;gap:6px;margin-top:18px">
          ${Array.from({ length: 16 })
            .map(
              (_, i) =>
                `<div style="flex:1;height:26px;background:var(--ink);opacity:${i % 2 ? 0.35 : 0.75}"></div>`,
            )
            .join("")}
        </div>
        <p style="margin-top:16px;font-size:20px">Every 30 minutes the outturn is metered.</p>
      </div>
      <div class="card">
        <span class="tag tag--rust">Forecast · WINDFOR</span>
        <div style="margin-top:16px;font-size:22px;font-weight:600">Hourly · 73 target hours per publication</div>
        <div style="display:flex;gap:6px;margin-top:18px">
          ${Array.from({ length: 8 })
            .map(
              (_, i) =>
                `<div style="flex:1;height:26px;background:var(--sea);opacity:${0.45 + i * 0.07}"></div>`,
            )
            .join("")}
        </div>
        <p style="margin-top:16px;font-size:20px">One value covers the whole hour. No 30-minute ramp exists.</p>
      </div>
    </div>
    <div class="grid2" style="margin-top:24px;grid-template-columns:1fr 1fr">
      <div class="card" style="border-left:3px solid var(--pine)">
        <div style="font-weight:600;font-size:23px">Primary metrics · hourly</div>
        <p style="margin-top:10px;font-size:21px">Forecast hour vs the <b>energy-weighted mean</b> of the two settlement periods in that hour. Both sides are hour-long averages — no resolution is invented.</p>
      </div>
      <div class="card" style="border-left:3px solid var(--amber)">
        <div style="font-weight:600;font-size:23px">Settlement-period view · step-hold</div>
        <p style="margin-top:10px;font-size:21px">The hourly forecast is held flat across the hour. Energy is preserved exactly — asserted in a test — and the view is labelled <b>indicative</b>.</p>
      </div>
    </div>
    <p class="sub" style="margin-top:20px">We deliberately do <b>not</b> interpolate onto half-hours: that would fabricate a 30-minute ramp the publisher never published. Error sign is fixed: <span class="mono">forecast − outturn</span>, so positive means the desk was short.</p>`,
    footRight: "backend/app/analytics/grids.py",
  });

/* -- decision rule ------------------------------------------------------ */

slides.decision = () =>
  frame({
    kicker: "Problem 3",
    body: `<h2>“The latest forecast” is a decision rule</h2>
    <div class="card" style="margin-top:26px;border-left:4px solid var(--sea)">
      <div class="mono" style="font-size:26px;color:var(--sea-deep);line-height:1.5">
        vintage = max( p.publish_time )<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;where p.publish_time ≤ cut_off<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;and cut_off = D−1 at 11:00 Europe/London
      </div>
    </div>
    <div style="margin-top:30px">
      <div style="font-size:21px;color:var(--ink-faint);font-family:'IBM Plex Mono',monospace;margin-bottom:12px">PUBLICATIONS ON 05 JAN 2026 (UTC)</div>
      <div style="position:relative;height:74px">
        <div style="position:absolute;left:0;right:0;top:34px;height:2px;background:var(--rule)"></div>
        ${[
          "02:30",
          "04:30",
          "07:30",
          "09:30",
          "11:30",
          "15:30",
          "18:30",
          "22:30",
        ]
          .map((t, i) => {
            const left = 2 + i * 13.2;
            const usable = i <= 3;
            return `<div style="position:absolute;left:${left}%;top:0;text-align:center;transform:translateX(-50%)">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;color:${usable ? "var(--sea-deep)" : "var(--ink-faint)"}">${t}</div>
          <div style="width:13px;height:13px;border-radius:50%;margin:9px auto 0;background:${usable ? "var(--sea)" : "var(--rule)"}"></div>
        </div>`;
          })
          .join("")}
        <div style="position:absolute;left:47.5%;top:-6px;bottom:-4px;width:3px;background:var(--rust)"></div>
        <div style="position:absolute;left:47.5%;top:-34px;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:19px;color:var(--rust);font-weight:600">cut-off 11:00</div>
      </div>
      <p class="sub" style="margin-top:22px">The 09:30 publication is the newest information that existed before the auction closed; 11:30 lands after it. Because the rule is parameterised by cut-off, the same endpoint answers “what did we know at 10:00?” — that is what builds the information timeline, and how the desk rehearses a decision.</p>
    </div>`,
    footRight: "backend/app/analytics/decision.py",
  });

/* -- bands -------------------------------------------------------------- */

slides.bands = () =>
  frame({
    kicker: "Turning error into a quantity",
    body: `<h2>From measured error to a tradeable band</h2>
    <div class="grid2" style="margin-top:28px;grid-template-columns:1fr 1fr">
      <div class="card">
        <div style="font-weight:600;font-size:24px">Empirical, not assumed</div>
        <p style="margin-top:10px;font-size:21px">No normal distribution is fitted. The band is the measured quantiles of the decision-horizon sample — 744 hourly errors at the gate-closure cut-off.</p>
        <ul style="margin-top:16px">
          <li>Absolute error quantiles → the <b>planning band</b></li>
          <li>Downside quantiles → the <b>procurement margin</b></li>
          <li>Level-scaled variant → errors relative to the day's mean output</li>
        </ul>
      </div>
      <div class="card" style="border-left:3px solid var(--sea)">
        <div style="font-weight:600;font-size:24px">Result for January 2026</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:10px 22px;margin-top:18px;font-family:'IBM Plex Mono',monospace;font-size:20px">
          <span style="color:var(--ink-faint)">P50 band</span><span>1,714 MW</span>
          <span style="color:var(--ink-faint)">P80 band</span><span>3,410 MW</span>
          <span style="color:var(--ink-faint)">P95 band</span><span>5,584 MW</span>
          <span style="color:var(--ink-faint)">Downside P95</span><span class="accent">1,146 MW · 27.5 GWh/day</span>
          <span style="color:var(--ink-faint)">Daily energy bias</span><span class="accent">+44,167 MWh (16%)</span>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:24px;border-left:3px solid var(--amber)">
      <div style="font-weight:600;font-size:23px">Why the planning band is the more conservative of the two</div>
      <p style="margin-top:10px;font-size:21px">The absolute-error band and the level-scaled band are both computed; at P50, P80 and P95 the larger is taken, so the buffer never understates the risk a windy day carries.</p>
    </div>`,
    footRight: "backend/app/analytics/bands.py",
  });

/* -- tests -------------------------------------------------------------- */

slides.tests = () =>
  frame({
    kicker: "Codebase and practices",
    body: `<h2>What a reviewer should not have to take on trust</h2>
    <div class="grid2" style="margin-top:28px;grid-template-columns:1.05fr 1fr">
      <div class="card">
        <div style="font-weight:600;font-size:24px;margin-bottom:16px">33 pytest tests</div>
        <div style="display:flex;flex-direction:column;gap:12px;font-size:21px">
          ${[
            [
              "Metric maths",
              "MAE, RMSE, bias, quantiles, MAPE near-zero guard, energy totals, lead-time bucketing — against hand-computed fixtures",
            ],
            [
              "Decision logic",
              "publication exactly on the cut-off · after it · incomplete coverage · none at all",
            ],
            [
              "Grid alignment",
              "hourly aggregation is energy-weighted; step-hold preserves energy exactly",
            ],
            [
              "API surface",
              "selected vintage, daily aggregate consistency, window defaults, CSV export, empty-day handling",
            ],
          ]
            .map(
              ([k, v]) =>
                `<div style="display:grid;grid-template-columns:210px 1fr;gap:16px;padding-top:12px;border-top:1px solid var(--rule-soft)">
            <span style="color:var(--sea-deep);font-weight:600">${k}</span><span style="color:var(--ink-soft)">${v}</span>
          </div>`,
            )
            .join("")}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="card" style="border-left:3px solid var(--pine)">
          <div style="font-weight:600;font-size:23px">Front-end gate</div>
          <p style="margin-top:8px;font-size:21px">TypeScript type-check + production Vite build, plus a headless UI check that fails on any console error or failed request.</p>
        </div>
        <div class="card" style="border-left:3px solid var(--sea)">
          <div style="font-weight:600;font-size:23px">Twelve-factor configuration</div>
          <p style="margin-top:8px;font-size:21px">Every setting is environment-driven. The same image runs locally, in Docker and on Vercel.</p>
        </div>
        <div class="card" style="border-left:3px solid var(--amber)">
          <div style="font-weight:600;font-size:23px">Lineage in the product</div>
          <p style="margin-top:8px;font-size:21px">Every ingestion run records its exact query, row counts and timestamps — and that table is in the UI.</p>
        </div>
      </div>
    </div>`,
    footRight: "backend/tests/ · make test",
  });

/* -- deployment --------------------------------------------------------- */

slides.deploy = () =>
  frame({
    kicker: "Deployment",
    body: `<h2>One command locally, a static build plus a function in the cloud</h2>
    <div class="grid2" style="margin-top:28px;grid-template-columns:1fr 1fr">
      <div class="card" style="border-top:3px solid var(--sea)">
        <span class="tag">Container path</span>
        <div style="margin-top:14px;font-weight:600;font-size:23px">docker compose up</div>
        <p style="margin-top:8px;font-size:21px">API on :8000, SPA on :8080 behind nginx, with <span class="mono">/api</span> proxied to one origin. The combined image also runs on Heroku.</p>
      </div>
      <div class="card" style="border-top:3px solid var(--pine)">
        <span class="tag tag--pine">Serverless path</span>
        <div style="margin-top:14px;font-weight:600;font-size:23px">Vercel</div>
        <p style="margin-top:8px;font-size:21px">The SPA is a static build; the FastAPI app is a Python function. The SQLite store is bundled and opened read-only — a serverless filesystem is immutable.</p>
      </div>
    </div>
    <div class="card" style="margin-top:24px;border-left:4px solid var(--rust)">
      <div style="font-weight:600;font-size:24px">Limitations, stated plainly</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:16px">
        <div><div style="font-weight:600;font-size:21px">Wind-only, January-only</div><p style="margin-top:6px;font-size:20px">As scoped. The residual requirement is <span class="mono">demand − wind</span>; demand is the desk's own input.</p></div>
        <div><div style="font-weight:600;font-size:21px">The band is in-sample</div><p style="margin-top:6px;font-size:20px">Calibrated on the window it is applied to, so it describes January rather than predicting it. Rolling out-of-sample is next.</p></div>
        <div><div style="font-weight:600;font-size:21px">Half-hourly errors are indicative</div><p style="margin-top:6px;font-size:20px">The published forecast is hourly, so a 30-minute ramp is not observable.</p></div>
      </div>
    </div>`,
    footRight: "docker-compose.yml · vercel.json · Dockerfile · Procfile",
  });

/* ------------------------------------------------------------------ run */

const script = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.promises.readFile(join(here, "script.json"), "utf8"),
  ),
);

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

for (const scene of script.scenes) {
  if (scene.kind === "app") continue;
  const render = slides[scene.variant];
  if (!render)
    throw new Error(`no card template for variant "${scene.variant}"`);
  const html = render(scene);
  writeFileSync(join(work, `card-${scene.id}.html`), html);
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const file = join(outDir, `${scene.id}.png`);
  await page.screenshot({ path: file });
  console.log("card ", file);
}

await browser.close();
