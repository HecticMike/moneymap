/**
 * End-to-end check of the import path in a real browser.
 *
 * The unit tests cover the parser in isolation; this proves the whole chain —
 * file → parse → merge → IndexedDB → render → survives a reload — actually
 * works in the engine the household runs (WebKit-family, iPhone viewport).
 *
 *   npm run dev
 *   node scripts/verify-import.mjs
 */
import { chromium, devices } from 'playwright';
import { claimPhone, importBackup, writeBackup } from './_helpers.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? null;

// Shaped exactly like a money-map v1 Drive backup, including the awkward cases.
const backup = {
  expenses: [
    { id: 'a', amount: 45.2, category: 'living_home_supermarket', date: '2026-08-15T00:00:00.000Z', note: 'Tesco', user: 'Miguel', createdAt: '2026-08-15T18:00:00.000Z', updatedAt: '2026-08-15T18:00:00.000Z' },
    { id: 'b', amount: 2400, category: 'income_salary', date: '2026-08-28T00:00:00.000Z', note: '', user: 'Ines', createdAt: '2026-08-28T09:00:00.000Z', updatedAt: '2026-08-28T09:00:00.000Z' },
    { id: 'c', amount: 62.4, category: 'mobility_transport_fuel', date: '2026-09-02T00:00:00.000Z', note: 'Shell', user: 'Miguel', createdAt: '2026-09-02T08:00:00.000Z', updatedAt: '2026-09-02T08:00:00.000Z' },
    { id: 'd', amount: 18, category: 'leisure_lifestyle_eating_out', date: '2026-09-05T00:00:00.000Z', note: 'Lunch', user: null, createdAt: '2026-09-05T13:00:00.000Z', updatedAt: '2026-09-05T13:00:00.000Z' },
    // No timestamps — must be backfilled from the date.
    { id: 'e', amount: 9.99, category: 'leisure_lifestyle_subscriptions', date: '2026-09-01T00:00:00.000Z', note: 'Netflix' },
    // Category that no longer exists — must land in Other, not be dropped.
    { id: 'f', amount: 30, category: 'category_removed_long_ago', date: '2026-09-03T00:00:00.000Z', note: 'Mystery' },
    // Unusable — must be skipped and reported.
    { id: 'g', amount: 'not-a-number', category: 'other', date: '2026-09-04T00:00:00.000Z' }
  ],
  tombstones: [{ id: 'deleted-one', deletedAt: '2026-08-01T00:00:00.000Z' }],
  syncedAt: '2026-09-06T00:00:00.000Z',
  version: 2
};

const file = writeBackup(backup);

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await claimPhone(page, 'Miguel');
const importReport = await importBackup(page, file);

const afterImport = await page.locator('body').innerText();

const whereItGoes = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /^where it goes/i.test(el.innerText.trim())
  );
  return section?.innerText ?? '';
});

// The real test of IndexedDB persistence: reload and see if it survived.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
const afterReload = await page.locator('body').innerText();

if (shot != null) await page.screenshot({ path: shot, fullPage: true });

const check = (name, condition) => ({ name, pass: Boolean(condition) });

// Matching is case-insensitive throughout: the design uses `text-transform:
// uppercase` widely, and innerText reports text as *rendered*, so a label
// written "6 entries" in JSX comes back as "6 ENTRIES".
const results = [
  check('import reported 6 of 7 entries', /6 of 7 entries imported/i.test(importReport)),
  check('flagged the one unreadable entry', /1 skipped as unreadable/i.test(importReport)),
  check('moved the dead category to Other', /1 moved to Other/i.test(importReport)),
  // Entries 'e' and 'f' both arrive without createdAt/updatedAt. 'g' is
  // rejected on its amount before timestamps are ever considered.
  check('backfilled both sets of missing timestamps', /2 timestamps backfilled/i.test(importReport)),
  check('carried the deletion over', /1 deletions carried over/i.test(importReport)),
  check('entry count rendered', /6 entries/i.test(afterImport)),
  check('income total rendered', /£2,400\.00/.test(afterImport)),
  check('group rollup rendered', /Living & Home/i.test(afterImport) && /Mobility & Transport/i.test(afterImport)),
  // Income must not be counted as spending. Scoped to the breakdown section,
  // since the salary legitimately appears elsewhere on the page.
  check('income kept out of the spending breakdown', !/£2,400\.00/.test(whereItGoes)),
  check('spending groups add up in the breakdown', /£45\.20/.test(whereItGoes)),
  check('survived a reload (IndexedDB)', /6 entries/i.test(afterReload)),
  check('totals survived a reload', /£2,400\.00/.test(afterReload)),
  check('no console or page errors', problems.length === 0)
];

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();

process.exit(results.every((r) => r.pass) ? 0 : 1);
