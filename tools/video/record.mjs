/**
 * Record the app segments of the demo video.
 *
 * One Playwright video per app scene. The narration timeline in
 * work/timeline.json drives when each scroll happens, so the on-screen action
 * lands on the sentence that talks about it.
 *
 *   node tools/video/record.mjs http://127.0.0.1:8080
 */
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const work = join(here, "work");
const videoDir = join(work, "raw");
mkdirSync(videoDir, { recursive: true });

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const VIEW = { width: 1920, height: 1080 };

const timeline = JSON.parse(readFileSync(join(work, "timeline.json"), "utf8"));
const appScenes = timeline.scenes.filter((s) => s.kind === "app");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scroll the viewport. `to` is "top", a pixel offset, or "panel:<title>". */
async function scrollTo(page, to) {
  await page.evaluate((target) => {
    if (target === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (String(target).startsWith("panel:")) {
      const wanted = target.slice("panel:".length).toLowerCase();
      const panel = [...document.querySelectorAll(".panel")].find((p) => {
        const t = p.querySelector(".panel__title");
        return t && t.textContent.toLowerCase().includes(wanted);
      });
      if (panel) {
        const top = panel.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top, behavior: "smooth" });
      }
      return;
    }
    window.scrollTo({ top: Number(target), behavior: "smooth" });
  }, to);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const results = [];

/** A scene's recording is only valid for the exact steps + timing it was made with. */
const sceneHash = (scene) =>
  createHash("sha1")
    .update(
      JSON.stringify([
        scene.route,
        scene.steps,
        scene.lines.map((l) => `${l.id}@${l.start.toFixed(3)}`),
        scene.duration.toFixed(3),
      ]),
    )
    .digest("hex")
    .slice(0, 12);

const cachePath = join(work, "recordings.json");
const cache = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8"))
  : {};

for (const scene of appScenes) {
  const hash = sceneHash(scene);
  const previous = cache[scene.id];
  if (previous && previous.hash === hash && existsSync(previous.file)) {
    results.push(previous);
    console.log(`record ${scene.id}  (cached)`);
    continue;
  }
  const context = await browser.newContext({
    viewport: VIEW,
    recordVideo: { dir: videoDir, size: VIEW },
  });
  const page = await context.newPage();

  const t0 = Date.now();
  await page.goto(`${BASE}${scene.route}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(1400); // let the charts settle
  const offset = (Date.now() - t0) / 1000;

  const lineStart = (id) => scene.lines.find((l) => l.id === id)?.start ?? 0;

  const origin = Date.now();
  const at = async (seconds) => {
    const due = origin + seconds * 1000;
    const wait = due - Date.now();
    if (wait > 0) await sleep(wait);
  };

  for (const step of scene.steps ?? []) {
    let when = 0;
    if (step.atLine) when = lineStart(step.atLine);
    else if (typeof step.at === "number") when = step.at;
    await at(when);

    if (step.do === "scroll") {
      await scrollTo(page, step.to);
      // let the smooth scroll finish before the next beat
      await sleep(700);
    } else if (step.do === "wait") {
      await sleep(step.ms ?? 500);
    }
  }

  await at(scene.duration);
  const video = page.video();
  await page.close();
  await context.close();

  const file = await video.path();
  results.push({
    id: scene.id,
    file,
    offset: Number((offset + 0.15).toFixed(3)),
    hash,
  });
  console.log(
    `record ${scene.id}  offset ${(offset + 0.15).toFixed(2)}s  ${scene.route}`,
  );
}

await browser.close();
writeFileSync(cachePath, JSON.stringify(results, null, 2) + "\n");
console.log(`\n${results.length} segments`);
