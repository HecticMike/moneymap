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
import { claimPhone, closeSettings, importBackup, openSettings, writeBackup } from './_helpers.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? null;

const now = new Date();
const iso = (daysAgo) => new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

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

const entries = [
  entry('Miguel', 'living_home_supermarket', 'Tesco', 45, 2),
  entry('Miguel', 'living_home_supermarket', 'Tesco', 52, 9),
  entry('Miguel', 'living_home_supermarket', 'Tesco', 48, 16),
  entry('Ines', 'personal_health_personal_care', 'Hairdresser', 35, 4),
  entry('Ines', 'personal_health_personal_care', 'Hairdresser', 35, 32),
  entry('Ines', 'personal_health_personal_care', 'Hairdresser', 38, 60),
  // A repeated habit of hers that is NOT yet saved, so the suggestions have
  // something to propose. Hairdresser is already a favourite and is correctly
  // excluded.
  entry('Ines', 'personal_health_fitness', 'Pilates', 18, 3),
  entry('Ines', 'personal_health_fitness', 'Pilates', 18, 10),
  entry('Ines', 'personal_health_fitness', 'Pilates', 18, 17)
];

// A favourite each, already saved — as if created on the other phone and synced.
const favourites = [
  { id: 'fav-miguel', label: 'Tesco', person: 'Miguel', category: 'living_home_supermarket', currency: 'GBP', amount: null, note: 'Tesco', useCount: 3, lastUsedAt: iso(2), createdAt: iso(30), updatedAt: iso(2) },
  { id: 'fav-ines', label: 'Hairdresser', person: 'Ines', category: 'personal_health_personal_care', currency: 'GBP', amount: null, note: 'Hairdresser', useCount: 2, lastUsedAt: iso(4), createdAt: iso(60), updatedAt: iso(4) },
  { id: 'fav-shared', label: 'Rent', person: null, category: 'living_home_rent', currency: 'GBP', amount: 1250, note: '', useCount: 5, lastUsedAt: iso(12), createdAt: iso(90), updatedAt: iso(12) }
];

const file = writeBackup({
  app: 'moneymap',
  schema: 4,
  entries,
  tombstones: [],
  favourites,
  favouriteTombstones: [],
  syncedAt: now.toISOString()
});

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
await claimPhone(page, 'Miguel');
check('stops asking once answered', !/whose phone is this/i.test(await page.locator('body').innerText()));

await importBackup(page, file);

const form = () => page.locator('form').innerText();

// --- Miguel's own tab --------------------------------------------------------
check('favourites synced in from the backup', /tesco/i.test(await form()));
check('shared favourite visible to Miguel', /rent/i.test(await form()));
check("wife's personal favourite hidden on his tab", !/hairdresser/i.test(await form()));

// --- switch to Inês and log for her ------------------------------------------
await page.locator('form').getByRole('button', { name: 'Ines', exact: true }).first().click();
await page.waitForTimeout(400);
const inesTab = await form();
check('her favourites appear on her tab', /hairdresser/i.test(inesTab));
check('shared favourite visible to her too', /rent/i.test(inesTab));
check('his personal favourite hidden on her tab', !/tesco/i.test(inesTab));

await page.getByRole('button', { name: /hairdresser/i }).first().click();
await page.waitForTimeout(400);

await page.getByLabel(/^amount/i).fill('42');
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^add £/i }).click();
await page.waitForTimeout(900);

const afterSave = await page.locator('body').innerText();
check('entry saved', /10 entries/i.test(afterSave));
// The whole point: logged from his phone, attributed to her, no retyping.
const recent = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /^recent/i.test(el.innerText.trim())
  );
  return section?.innerText ?? '';
});
check('recent row shows Personal Care for Ines', /personal care[\s\S]{0,80}ines/i.test(recent));

// --- deletion takes two taps -------------------------------------------------
const deleteButton = page.getByRole('button', { name: /delete personal care entry/i }).first();
await deleteButton.click();
await page.waitForTimeout(300);
const armed = await page.locator('body').innerText();
check('first tap arms rather than deletes', /10 entries/i.test(armed) && /delete\s*no/i.test(armed.replace(/\n/g, ' ')));

await page.getByRole('button', { name: /^no,/i }).first().click();
await page.waitForTimeout(300);
check('cancelling leaves the entry alone', /10 entries/i.test(await page.locator('body').innerText()));

await deleteButton.click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
await page.waitForTimeout(700);
check('second tap deletes', /9 entries/i.test(await page.locator('body').innerText()));

// --- suggestions live in settings now ----------------------------------------
await openSettings(page);
await page.getByRole('dialog').getByRole('button', { name: 'Ines', exact: true }).nth(1).click();
await page.waitForTimeout(400);
const sheet = await page.getByRole('dialog').innerText();
check('proposes her unsaved habit', /pilates/i.test(sheet));
check('does not re-propose what she already has', !/\+\s*hairdresser/i.test(sheet));
check('currency setting lives in settings', /capture in/i.test(sheet));
check('favourites are managed in settings', /favourites/i.test(sheet));

if (shot != null) await page.screenshot({ path: shot, fullPage: true });
await closeSettings(page);

check('no console or page errors', problems.length === 0);

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
