/**
 * Headless smoke check for the running app.
 *
 * Loads every page, fails on console errors / failed requests, and asserts
 * that the key panels actually rendered (not just that the HTML shell did).
 *
 *   node check.mjs http://127.0.0.1:8080
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

/** page path -> a selector that must exist once the data has loaded */
const PAGES = [
  { path: "/", must: [".recharts-wrapper", ".stat", ".panel", ".ribbon"] },
  {
    path: "/decision?day=2026-01-06",
    must: [".recharts-wrapper", "table"],
  },
  { path: "/accuracy", must: [".recharts-wrapper", ".stat", ".ribbon"] },
  { path: "/methodology", must: [".panel", "h1"] },
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) =>
  problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`),
);
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
});

let failed = false;
for (const spec of PAGES) {
  const before = problems.length;
  await page.goto(`${BASE}${spec.path}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(1200);
  for (const sel of spec.must) {
    const n = await page.locator(sel).count();
    if (n === 0) {
      problems.push(`missing "${sel}" on ${spec.path}`);
      failed = true;
    }
  }
  const found = problems.length - before;
  console.log(
    `${found === 0 ? "ok  " : "FAIL"} ${spec.path}${found ? ` (${found} issue(s))` : ""}`,
  );
}

await browser.close();

if (problems.length) {
  console.log("\nproblems:");
  for (const p of [...new Set(problems)]) console.log(" -", p);
  process.exit(1);
}
console.log("\nall pages clean");
