/**
 * Layout audit in WebKit at iPhone size — the engine the household actually
 * runs, which Chromium does not stand in for. Form controls in particular are
 * sized very differently by WebKit.
 *
 * Finds problems by measurement rather than by eye: horizontal overflow,
 * elements escaping the viewport, overlapping controls, and tap targets below
 * Apple's 44px minimum.
 *
 *   npm run dev
 *   node scripts/audit-layout.mjs [url] [device] [screenshot]
 */
import { webkit, devices } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const deviceName = process.argv[3] ?? 'iPhone 15';
const shot = process.argv[4] ?? null;

const fixture = {
  expenses: [
    { id: 'a', amount: 45.2, category: 'living_home_supermarket', date: '2026-08-15T00:00:00.000Z', note: 'Tesco', user: 'Miguel', createdAt: '2026-08-15T18:00:00.000Z', updatedAt: '2026-08-15T18:00:00.000Z' },
    { id: 'b', amount: 2400, category: 'income_salary', date: '2026-08-28T00:00:00.000Z', note: '', user: 'Ines', createdAt: '2026-08-28T09:00:00.000Z', updatedAt: '2026-08-28T09:00:00.000Z' },
    { id: 'c', amount: 1250.75, category: 'living_home_rent', date: '2026-09-01T00:00:00.000Z', note: 'Monthly rent payment for the flat', user: 'Miguel', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' },
    { id: 'd', amount: 62.4, category: 'mobility_transport_travel_commuting', date: '2026-09-02T00:00:00.000Z', note: 'A deliberately long note to see how the recent list copes with overflow', user: 'Ines', createdAt: '2026-09-02T08:00:00.000Z', updatedAt: '2026-09-02T08:00:00.000Z' }
  ],
  tombstones: [],
  syncedAt: '2026-09-06T00:00:00.000Z',
  version: 2
};

const file = join(mkdtempSync(join(tmpdir(), 'mm-')), 'money-map-data.json');
writeFileSync(file, JSON.stringify(fixture));

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices[deviceName] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', file);
await page.waitForTimeout(1200);

const findings = await page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const out = { viewport, horizontalScroll: null, overflowing: [], overlaps: [], smallTargets: [] };

  if (document.documentElement.scrollWidth > viewport + 1) {
    out.horizontalScroll = {
      scrollWidth: document.documentElement.scrollWidth,
      viewport
    };
  }

  const describe = (el) => {
    const text = (el.textContent ?? '').trim().slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : '';
    return `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''} "${text}" .${cls}`;
  };

  // An element wider than the viewport is harmless if an ancestor clips it —
  // which is exactly what `truncate` does to a long note. getBoundingClientRect
  // reports the unclipped layout box, so without this every ellipsised label
  // looks like an overflow bug.
  const isClipped = (el) => {
    for (let node = el.parentElement; node != null; node = node.parentElement) {
      const { overflowX } = getComputedStyle(node);
      if (overflowX === 'hidden' || overflowX === 'clip' || overflowX === 'auto' || overflowX === 'scroll') {
        return true;
      }
    }
    return false;
  };

  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    // Escapes the viewport horizontally, and nothing clips it.
    if ((rect.right > viewport + 1 || rect.left < -1) && !isClipped(el)) {
      out.overflowing.push({
        el: describe(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right)
      });
    }

    // Interactive controls below Apple's 44pt minimum tap target.
    if (/^(button|a|select|input)$/i.test(el.tagName) && el.type !== 'file' && el.type !== 'hidden') {
      if (rect.height < 44) {
        out.smallTargets.push({ el: describe(el), height: Math.round(rect.height) });
      }
    }
  }

  // Controls that visually collide with a sibling.
  const controls = [...document.querySelectorAll('input, select, button')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.type !== 'file';
  });

  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i].getBoundingClientRect();
      const b = controls[j].getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 2 && overlapY > 2) {
        out.overlaps.push({
          a: describe(controls[i]),
          b: describe(controls[j]),
          overlapX: Math.round(overlapX),
          overlapY: Math.round(overlapY)
        });
      }
    }
  }

  return out;
});

if (shot != null) await page.screenshot({ path: shot, fullPage: true });

console.log(JSON.stringify({ device: deviceName, ...findings, jsErrors: problems }, null, 2));
await browser.close();

const clean =
  findings.horizontalScroll == null &&
  findings.overflowing.length === 0 &&
  findings.overlaps.length === 0 &&
  problems.length === 0;
process.exit(clean ? 0 : 1);
