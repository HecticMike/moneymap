/**
 * Check that the two views really are different views, in WebKit at iPhone size.
 *
 * The point of the setting is that spending mode ignores income *entirely* —
 * not that it hides a line. If income can still be seen in the insights with
 * spending selected, the mode is decorative.
 *
 *   npm run dev
 *   node scripts/verify-views.mjs
 */
import { webkit, devices } from 'playwright';
import { claimPhone, closeSettings, importBackup, openSettings, writeBackup } from './_helpers.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? null;

const now = new Date();
let id = 0;
const entry = (monthsBack, day, amount, category, note = '') => {
  const date = new Date(now.getFullYear(), now.getMonth() - monthsBack, day, 12, 0, 0);
  return {
    id: `v${id++}`,
    amount,
    category,
    date: date.toISOString(),
    note,
    user: 'Miguel',
    createdAt: date.toISOString(),
    updatedAt: date.toISOString()
  };
};

const expenses = [];
for (let back = 5; back >= 1; back -= 1) {
  expenses.push(entry(back, 2, 2400, 'income_salary', 'Payroll'));
  expenses.push(entry(back, 1, 1250, 'living_home_rent'));
  expenses.push(entry(back, 4, 200, 'living_home_supermarket', 'Tesco'));
}
// This month so far, on days that have certainly happened.
expenses.push(entry(0, 1, 2400, 'income_salary', 'Payroll'));
expenses.push(entry(0, 1, 1250, 'living_home_rent'));
expenses.push(entry(0, 1, 260, 'living_home_supermarket', 'Tesco'));

const file = writeBackup({ expenses, tombstones: [], syncedAt: now.toISOString(), version: 2 });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

await page.goto(url, { waitUntil: 'networkidle' });
await claimPhone(page, 'Miguel');
await importBackup(page, file);

const main = () => page.locator('main').innerText();

// --- spending is the default -------------------------------------------------
const spending = await main();
check('defaults to the spending view', /what you chose/i.test(spending));
check('no balance card by default', !/balance this month/i.test(spending));
// The salary is £2,400 and appears in the Recent list, which is correct — but
// it must not appear as an insight.
const spendingInsights = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((el) =>
    /what you chose/i.test(el.innerText.slice(0, 40))
  );
  return section?.innerText ?? '';
});
check('income left out of the spending insights', !/income/i.test(spendingInsights));
check('spending insights still show the spend', /£260\.00/.test(spendingInsights));

// --- switch to balance -------------------------------------------------------
await openSettings(page);
const sheet = await page.getByRole('dialog').innerText();
check('the setting is offered', /what to show/i.test(sheet));
await page.getByRole('dialog').getByRole('button', { name: 'Balance', exact: true }).click();
await page.waitForTimeout(400);
await closeSettings(page);
await page.waitForTimeout(500);

const balance = await main();
check('balance card appears', /balance this month/i.test(balance));
check('shows income', /£2,400\.00/.test(balance));
// 2400 in, 1510 out this month.
check('shows the net', /£890\.00/.test(balance));
check('shows a savings rate', /of what came in/i.test(balance));
check('says the month is not finished', /still in progress|so far/i.test(balance));
check('keeps the spending view underneath', /what you chose/i.test(balance));
check('shows the six-month history', /last six months/i.test(balance));

// --- and the choice sticks ---------------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
check('the setting survives a reload', /balance this month/i.test(await main()));

// --- back again --------------------------------------------------------------
await openSettings(page);
await page.getByRole('dialog').getByRole('button', { name: 'Spending', exact: true }).click();
await page.waitForTimeout(400);
await closeSettings(page);
await page.waitForTimeout(500);
check('switching back removes the balance card', !/balance this month/i.test(await main()));

// --- per-person card visibility ----------------------------------------------
check('cards are on by default', /committed each month/i.test(await main()));

await openSettings(page);
const sheetBefore = await page.getByRole('dialog').innerText();
check('says it is on the defaults', /currently on the defaults/i.test(sheetBefore));
check('card list is labelled for this person', /miguel's cards/i.test(sheetBefore));

await page.getByRole('switch', { name: /committed each month/i }).click();
await page.waitForTimeout(300);
check('offers a way back once customised', /back to the defaults/i.test(await page.getByRole('dialog').innerText()));
await closeSettings(page);
await page.waitForTimeout(400);
check('turning a card off hides it', !/committed each month/i.test(await main()));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
check('the card stays hidden after a reload', !/committed each month/i.test(await main()));

// --- the other person is unaffected ------------------------------------------
// This is the whole point of keying preferences by person: Ines turning cards
// off on a shared phone must not change what Miguel sees, and vice versa.
await openSettings(page);
await page.getByRole('dialog').getByRole('button', { name: 'Ines', exact: true }).first().click();
await page.waitForTimeout(400);
const inesSheet = await page.getByRole('dialog').innerText();
check("switching person shows that person's cards", /ines's cards/i.test(inesSheet));
check('the other person is still on the defaults', /currently on the defaults/i.test(inesSheet));
await closeSettings(page);
await page.waitForTimeout(400);
check("the other person sees the card Miguel hid", /committed each month/i.test(await main()));

// --- and switching back restores the first person's choices ------------------
await openSettings(page);
await page.getByRole('dialog').getByRole('button', { name: 'Miguel', exact: true }).first().click();
await page.waitForTimeout(400);
await closeSettings(page);
await page.waitForTimeout(400);
check('switching back restores his override', !/committed each month/i.test(await main()));

// --- the period is remembered ------------------------------------------------
await page.getByRole('button', { name: '1Y', exact: true }).click();
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const yearSelected = await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === '1Y');
  return button?.getAttribute('aria-pressed') === 'true';
});
check('the chosen period survives a reload', yearSelected);

// --- and the defaults are one tap away ---------------------------------------
await openSettings(page);
await page.getByRole('dialog').getByRole('button', { name: /back to the defaults/i }).click();
await page.waitForTimeout(400);
check('resetting says so', /currently on the defaults/i.test(await page.getByRole('dialog').innerText()));
await closeSettings(page);
await page.waitForTimeout(400);
check('resetting brings the card back', /committed each month/i.test(await main()));

if (shot != null) await page.screenshot({ path: shot, fullPage: true });
check('no console or page errors', problems.length === 0);

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
