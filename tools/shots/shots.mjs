/**
 * Capture full-page screenshots of the running app with the locally installed
 * Edge (no browser download needed).
 *
 *   node shots.mjs http://127.0.0.1:5173 ../docs/screenshots
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const OUT = process.argv[3] ?? '../docs/screenshots'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const PAGES = [
  { name: '01-overview', path: '/', height: 2400 },
  { name: '02-decision-board', path: '/decision?day=2026-01-06', height: 2600 },
  { name: '03-accuracy', path: '/accuracy', height: 3000 },
  { name: '04-methodology', path: '/methodology', height: 2400 },
]

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()

for (const spec of PAGES) {
  await page.setViewportSize({ width: 1600, height: spec.height })
  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1800)
  const file = join(OUT, `${spec.name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log('captured', file)
}

// A narrower viewport for the responsive check.
await page.setViewportSize({ width: 430, height: 1600 })
await page.goto(`${BASE}/decision?day=2026-01-06`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: join(OUT, '05-mobile-decision.png') })
console.log('captured mobile')

await browser.close()
