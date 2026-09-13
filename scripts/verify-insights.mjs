/**
 * End-to-end check of the insights, in WebKit at iPhone size.
 *
 * Builds six months of plausible household history *relative to today*, so the
 * run is not tied to a fixed date, imports it, and checks that the comparison,
 * the movers, the recurring detection and the drill-down all render.
 *
 *   npm run dev
 *   node scripts/verify-insights.mjs
 */
import { webkit, devices } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? null;

const now = new Date();
const today = now.getDate();

let id = 0;
const entry = (monthsBack, day, amount, category, note = '') => {
  const date = new Date(now.getFullYear(), now.getMonth() - monthsBack, day, 12, 0, 0);
  return {
    id: `f${id++}`,
    amount,
    category,
    date: date.toISOString(),
    note,
    user: id % 2 === 0 ? 'Miguel' : 'Ines',
    createdAt: date.toISOString(),
    updatedAt: date.toISOString()
  };
};

const expenses = [];

// Six months back through last month: full months of ordinary spending.
for (let back = 6; back >= 1; back -= 1) {
  expenses.push(entry(back, 1, 1250, 'living_home_rent'));
  expenses.push(entry(back, 5, 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'));
  expenses.push(entry(back, 3, 85 + back, 'living_home_utilities', 'Electric'));
  expenses.push(entry(back, 2, 2400, 'income_salary', 'Payroll'));
  expenses.push(entry(back, 4, 62, 'living_home_supermarket', 'Tesco'));
  expenses.push(entry(back, 8, 48, 'living_home_supermarket', 'Tesco'));
  expenses.push(entry(back, 6, 22, 'leisure_lifestyle_eating_out', 'Lunch'));
  expenses.push(entry(back, 19, 30, 'leisure_lifestyle_eating_out', 'Dinner'));
  expenses.push(entry(back, 12, 55, 'mobility_transport_fuel', 'Shell'));
}

// This month so far — only days that have actually happened, and with eating
// out deliberately blown out so there is a mover to find.
const soFar = (day) => Math.min(day, today);
expenses.push(entry(0, soFar(1), 1250, 'living_home_rent'));
expenses.push(entry(0, soFar(5), 9.99, 'leisure_lifestyle_subscriptions', 'Netflix'));
expenses.push(entry(0, soFar(3), 91, 'living_home_utilities', 'Electric'));
expenses.push(entry(0, soFar(2), 2400, 'income_salary', 'Payroll'));
expenses.push(entry(0, soFar(4), 60, 'living_home_supermarket', 'Tesco'));
expenses.push(entry(0, soFar(6), 240, 'leisure_lifestyle_eating_out', 'Birthday dinner'));
expenses.push(entry(0, soFar(7), 180, 'leisure_lifestyle_eating_out', 'Weekend away meals'));

const file = join(mkdtempSync(join(tmpdir(), 'mm-')), 'money-map-data.json');
writeFileSync(file, JSON.stringify({ expenses, tombstones: [], syncedAt: now.toISOString(), version: 2 }));

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', file);
await page.waitForTimeout(1500);

const body = await page.locator('body').innerText();
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

check('all entries imported', new RegExp(`${expenses.length} entries`, 'i').test(body));

// --- the month comparison ----------------------------------------------------
check('this-month panel rendered', /this month so far/i.test(body));
check('comparison against a baseline shown', /usual/i.test(body));
// The honesty requirement: the comparison must say which days it compared.
check('like-for-like window labelled', /same days of/i.test(body));
check('did not claim insufficient history', !/not enough history/i.test(body));

// --- movers ------------------------------------------------------------------
check('movers panel rendered', /what moved/i.test(body));
check('caught the eating-out blowout', /leisure & lifestyle/i.test(body));

// --- recurring ---------------------------------------------------------------
check('committed spend panel rendered', /committed each month/i.test(body));
check('detected rent as committed', /rent/i.test(body));
check('detected the subscription', /netflix/i.test(body));
// Rent 1250 + Netflix 9.99 + Electric ~89 = about £1,349. Crucially this must
// NOT include the monthly dinner or the monthly fuel stop.
check('committed total is bills only', /£1,3\d\d\.\d\d/.test(body));
check('regular habits shown separately', /regular, but a choice/i.test(body));
// Salary recurs monthly but is income, not committed spending. Scoped to the
// actual section element — slicing the page text by character count runs
// straight into the Recent list below, which legitimately lists Payroll.
const committedSection = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((element) =>
    /committed each month/i.test(element.innerText.slice(0, 60))
  );
  return section?.innerText ?? '';
});
check('committed section located', committedSection !== '');
check('income excluded from committed spend', !/payroll|salary/i.test(committedSection));

// The split that stops the committed figure from lying: the bills list must not
// contain discretionary repeats, even though they are genuinely regular.
const billsOnly = committedSection.slice(0, committedSection.search(/regular, but a choice/i));
check('eating out kept out of the bills list', !/eating out/i.test(billsOnly));
check('fuel kept out of the bills list', !/fuel/i.test(billsOnly));
check('rent and subscriptions are in the bills list', /rent/i.test(billsOnly) && /netflix/i.test(billsOnly));

// --- drill-down --------------------------------------------------------------
await page.getByRole('button', { name: /living & home/i }).first().click();
await page.waitForTimeout(400);
const expanded = await page.locator('body').innerText();
check('group expands into its categories', /rent/i.test(expanded) && /utilities/i.test(expanded));

if (shot != null) await page.screenshot({ path: shot, fullPage: true });
check('no console or page errors', problems.length === 0);

console.log(JSON.stringify({ entries: expenses.length, results, problems }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
