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
import { claimPhone, closeSettings, importBackup, openSettings, writeBackup } from './_helpers.mjs';

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

const file = writeBackup(fixture);

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices[deviceName] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await claimPhone(page, 'Miguel');
await importBackup(page, file);

// Measured twice: the main screen, and the settings sheet — a whole surface
// that would otherwise never be checked.
const measure = () => page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const out = {
    viewport,
    horizontalScroll: null,
    overflowing: [],
    overlaps: [],
    /** Fails the audit. */
    smallTargets: [],
    /** Reported only — short but wide enough to be safe. */
    tightTargets: []
  };

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

    // Tap targets, in two tiers.
    //
    // Apple asks for 44x44pt. Taken literally that also condemns segmented
    // controls, which iOS itself ships at 32pt — because a short *but wide*
    // control is a different risk: a vertical mis-tap lands on nothing, whereas
    // a small square button next to a delete icon lands on the delete icon.
    //
    // So: genuinely cramped targets fail the audit; short-but-wide ones are
    // reported for review and do not. Nothing below 32pt is excused.
    if (
      /^(button|a|select|input)$/i.test(el.tagName) &&
      el.type !== 'file' &&
      el.type !== 'hidden' &&
      !el.hasAttribute('data-backdrop') &&
      el.closest('[inert]') == null
    ) {
      const height = Math.round(rect.height);
      const width = Math.round(rect.width);

      if (height < 32 || (height < 44 && width < 72)) {
        out.smallTargets.push({ el: describe(el), height, width });
      } else if (height < 44) {
        out.tightTargets.push({ el: describe(el), height, width });
      }
    }
  }

  // Controls that visually collide with a sibling.
  //
  // Two exclusions, both principled rather than convenient: a modal backdrop is
  // *meant* to cover the page, and anything inside an `inert` subtree is not
  // interactive at all — if a control behind an open sheet is still reachable,
  // that is a modal bug caught by the missing `inert`, not an overlap.
  const controls = [...document.querySelectorAll('input, select, button')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || el.type === 'file') return false;
    if (el.hasAttribute('data-backdrop')) return false;
    if (el.closest('[inert]') != null) return false;
    return true;
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

const main = await measure();
if (shot != null) await page.screenshot({ path: shot, fullPage: true });

await openSettings(page);
const sheet = await measure();
await closeSettings(page);

console.log(
  JSON.stringify({ device: deviceName, main, sheet, jsErrors: problems }, null, 2)
);
await browser.close();

const isClean = (f) =>
  f.horizontalScroll == null &&
  f.overflowing.length === 0 &&
  f.overlaps.length === 0 &&
  f.smallTargets.length === 0;

process.exit(isClean(main) && isClean(sheet) && problems.length === 0 ? 0 : 1);
