/**
 * End-to-end check of per-person favourites, in WebKit at iPhone size.
 *
 * The flow that actually matters: on Miguel's phone, switch to Inês's tab, tap
 * one of *her* favourites, and have the entry save attributed to her — without
 * retyping anything or changing any other setting.
 *
 *   npm run dev
 *   node scripts/verify-favourites.mjs
 */
import { webkit, devices } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? null;

const now = new Date();
const iso = (daysAgo) =>
  new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

let id = 0;
const entry = (person, category, note, amount, daysAgo) => ({
  id: `e${id++}`,
  amount,
  category,
  date: iso(daysAgo),
  note,
  user: person,
  createdAt: iso(daysAgo),
  updatedAt: iso(daysAgo)
});

// Enough repetition per person that each gets their own suggestions.
const entries = [
  entry('Miguel', 'living_home_supermarket', 'Tesco', 45, 2),
  entry('Miguel', 'living_home_supermarket', 'Tesco', 52, 9),
  entry('Miguel', 'living_home_supermarket', 'Tesco', 48, 16),
  entry('Ines', 'personal_health_personal_care', 'Hairdresser', 35, 4),
  entry('Ines', 'personal_health_personal_care', 'Hairdresser', 35, 32),
  entry('Ines', 'personal_health_personal_care', 'Hairdresser', 38, 60),
  // A repeated habit of hers that is NOT yet saved, so there is something for
  // the suggestions to propose. Hairdresser is already a favourite and is
  // correctly excluded.
  entry('Ines', 'personal_health_fitness', 'Pilates', 18, 3),
  entry('Ines', 'personal_health_fitness', 'Pilates', 18, 10),
  entry('Ines', 'personal_health_fitness', 'Pilates', 18, 17)
];

// A favourite each, already saved — as if created on the other phone and synced.
const favourites = [
  {
    id: 'fav-miguel', label: 'Tesco', person: 'Miguel', category: 'living_home_supermarket',
    currency: 'GBP', amount: null, note: 'Tesco', useCount: 3,
    lastUsedAt: iso(2), createdAt: iso(30), updatedAt: iso(2)
  },
  {
    id: 'fav-ines', label: 'Hairdresser', person: 'Ines', category: 'personal_health_personal_care',
    currency: 'GBP', amount: null, note: 'Hairdresser', useCount: 2,
    lastUsedAt: iso(4), createdAt: iso(60), updatedAt: iso(4)
  },
  {
    id: 'fav-shared', label: 'Rent', person: null, category: 'living_home_rent',
    currency: 'GBP', amount: 1250, note: '', useCount: 5,
    lastUsedAt: iso(12), createdAt: iso(90), updatedAt: iso(12)
  }
];

const file = join(mkdtempSync(join(tmpdir(), 'mm-')), 'money-map-data.json');
writeFileSync(
  file,
  JSON.stringify({ app: 'moneymap', schema: 4, entries, tombstones: [], favourites, favouriteTombstones: [], syncedAt: now.toISOString() })
);

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

await page.goto(url, { waitUntil: 'networkidle' });

// --- this phone is Miguel's --------------------------------------------------
check('asks whose phone this is', /whose phone is this/i.test(await page.locator('body').innerText()));
await page.getByRole('button', { name: 'Miguel', exact: true }).first().click();
await page.waitForTimeout(400);
check('stops asking once answered', !/whose phone is this/i.test(await page.locator('body').innerText()));

await page.setInputFiles('input[type=file]', file);
await page.waitForTimeout(1200);

const form = () => page.locator('form').innerText();

// --- Miguel's own tab --------------------------------------------------------
check('favourites synced in from the backup', /tesco/i.test(await form()));
check('shared favourite visible to Miguel', /rent/i.test(await form()));
check("wife's personal favourite hidden on his tab", !/hairdresser/i.test(await form()));

// --- switch to Inês and log for her ------------------------------------------
await page.getByRole('button', { name: 'Ines', exact: true }).first().click();
await page.waitForTimeout(400);
const inesTab = await form();
check("her favourites appear on her tab", /hairdresser/i.test(inesTab));
check('shared favourite visible to her too', /rent/i.test(inesTab));
check('his personal favourite hidden on her tab', !/tesco/i.test(inesTab));

await page.getByRole('button', { name: /hairdresser/i }).first().click();
await page.waitForTimeout(400);

await page.getByLabel('Amount, or amount with a description').fill('42');
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^add £/i }).click();
await page.waitForTimeout(900);

const afterSave = await page.locator('body').innerText();
check("entry saved", /10 entries/i.test(afterSave));
// The whole point: logged from his phone, attributed to her, no retyping.
check('attributed to Ines, not the phone owner', /£42\.00[\s\S]{0,200}/.test(afterSave));
const recent = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /^recent/i.test(el.innerText.trim())
  );
  return section?.innerText ?? '';
});
check('recent row shows Personal Care for Ines', /personal care[\s\S]{0,80}ines/i.test(recent));

// --- suggestions are per person ---------------------------------------------
const suggestionText = await form();
check('proposes her unsaved habit', /pilates/i.test(suggestionText));
// Already saved as a favourite, so it must not be offered again.
check('does not re-propose what she already has', !/\+\s*hairdresser/i.test(suggestionText));

// His habits must not leak onto her tab.
await page.getByRole('button', { name: 'Miguel', exact: true }).first().click();
await page.waitForTimeout(400);
check('his tab does not propose her habits', !/pilates/i.test(await form()));

if (shot != null) await page.screenshot({ path: shot, fullPage: true });
check('no console or page errors', problems.length === 0);

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
