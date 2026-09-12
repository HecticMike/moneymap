/**
 * Render the app in a real browser at iPhone size and capture it.
 *
 * Not part of the test suite — a development aid, so UI is never shipped
 * without anyone having looked at it. Run against a dev server:
 *
 *   npm run dev
 *   node scripts/screenshot.mjs [url] [outfile]
 */
import { chromium, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'screenshot.png';

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

const problems = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

await page.screenshot({ path: out, fullPage: true });

const heading = await page.locator('h1').first().textContent();
const bodyText = await page.locator('body').innerText();

console.log(JSON.stringify({ heading, chars: bodyText.length, problems }, null, 2));

await browser.close();
