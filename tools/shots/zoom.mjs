import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
await page.goto('http://127.0.0.1:5173/decision?day=2026-01-06', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const table = page.locator('table.dtable').first()
await table.screenshot({ path: 'C:/Projects/New folder/docs/screenshots/zoom-table.png' })

const colours = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('table.dtable tbody tr td:nth-child(5)'))
  return cells.slice(0, 8).map((cell) => ({
    text: cell.textContent?.trim(),
    cls: cell.className,
    colour: getComputedStyle(cell).color,
  }))
})
console.log(JSON.stringify(colours, null, 2))
await browser.close()
