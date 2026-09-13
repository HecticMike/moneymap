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
import { claimPhone, importBackup, writeBackup } from './_helpers.mjs';

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

const file = writeBackup({ expenses, tombstones: [], syncedAt: now.toISOString(), version: 2 });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await claimPhone(page, 'Miguel');
await importBackup(page, file);

const body = await page.locator('body').innerText();
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

check('all entries imported', new RegExp(`${expenses.length} entries`, 'i').test(body));

// --- the headline is choices, not total spend --------------------------------
check('choices panel rendered', /what you chose/i.test(body));
check('comparison against a baseline shown', /usual/i.test(body));
// The honesty requirement: the comparison must say which days it compared.
check('like-for-like window labelled', /same days of/i.test(body));
check('did not claim insufficient history', !/not enough history/i.test(body));

// This month: rent 1250 + Netflix 9.99 + electric 91 are obligations; Tesco 60
// plus two meals out (240 + 180) are choices. The headline must be the 480 the
// household decided, not the 1,830 that left the account.
const chosenSection = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /what you chose/i.test(el.innerText.slice(0, 40))
  );
  return section?.innerText ?? '';
});
// Scoped to the display-sized figure: the total legitimately appears lower
// down as context ("£1,830.99 out in total"), so asserting its absence across
// the whole section would be testing the wrong thing.
const headlineFigure = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /what you chose/i.test(el.innerText.slice(0, 40))
  );
  return section?.querySelector('.text-display')?.textContent ?? '';
});
check('headline is chosen spend', /£480\.00/.test(headlineFigure));
check('headline is NOT total spend', !/1,830/.test(headlineFigure));
check('total still shown as context', /£1,830\.99/.test(chosenSection));
check('obligations reported separately', /£1,350\.99/.test(chosenSection));
check('obligations labelled as already spoken for', /already spoken for/i.test(chosenSection));

// --- where the choices went --------------------------------------------------
check('choices breakdown rendered', /where the choices went/i.test(body));
const choicesSection = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /where the choices went/i.test(el.innerText.slice(0, 40))
  );
  return section?.innerText ?? '';
});
check('caught the eating-out blowout', /eating out/i.test(choicesSection));
// 420 of 480 chosen = 88%. Out of total spend it would be a trivial 23% —
// which is the dilution the whole split exists to remove.
check('share is out of chosen spend, not everything', /8[0-9]%/.test(choicesSection));
check('obligations kept out of the choices list', !/rent/i.test(choicesSection));
check('offers the lever', /back to usual would free/i.test(choicesSection));

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

// --- the breakdown is period-scoped again ------------------------------------
check('range selector rendered', /1M/.test(body) && /1Y/.test(body));
const before = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /where it goes/i.test(el.innerText.slice(0, 40))
  );
  return section?.innerText ?? '';
});
await page.getByRole('button', { name: '1M', exact: true }).click();
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /where it goes/i.test(el.innerText.slice(0, 40))
  );
  return section?.innerText ?? '';
});
check('changing the range changes the figures', before !== after);

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
