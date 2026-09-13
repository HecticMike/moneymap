/**
 * End-to-end check of fast capture, in WebKit at iPhone size.
 *
 * The parser and ranking have unit tests; this proves the wiring — that typing
 * into the one field really does set category and date, that a chip overrides
 * the guess, that the entry saves, and that it is still there after a reload.
 *
 *   npm run dev
 *   node scripts/verify-capture.mjs
 */
import { webkit, devices } from 'playwright';
import { claimPhone } from './_helpers.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? null;

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 15'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await claimPhone(page, 'Miguel');

const amount = page.getByLabel('Amount, or amount with a description');
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

// --- free text is understood, and shown back before saving -------------------
await amount.fill('45.20 tesco yesterday');
await page.waitForTimeout(400);

const understood = await page.locator('form').innerText();
check('amount parsed from free text', /£45\.20/.test(understood));
check('category guessed from "tesco"', /supermarket/i.test(understood));
check('submit button confirms the amount', /add £45\.20/i.test(understood));

// The date word must be consumed, not left sitting in the note.
check('date word stripped from the note', !/“.*yesterday.*”/i.test(understood));

// --- a chip overrides the guess ---------------------------------------------
await page.getByRole('button', { name: /fuel/i }).first().click();
await page.waitForTimeout(300);
const afterChip = await page.locator('form').innerText();
check('chip overrides the parsed category', /fuel/i.test(afterChip));

// Typing more must not silently undo the chip.
await amount.fill('45.20 tesco yesterday please');
await page.waitForTimeout(400);
const afterMoreTyping = await page.locator('form').innerText();
check('continued typing does not undo the chip', /category[\s\S]{0,40}fuel/i.test(afterMoreTyping));

// --- save it -----------------------------------------------------------------
await page.getByRole('button', { name: /^add £/i }).click();
await page.waitForTimeout(800);

const afterSave = await page.locator('body').innerText();
check('entry saved', /1 entries/i.test(afterSave));
check('saved under the chosen category', /fuel/i.test(afterSave));
check('input cleared ready for the next entry', (await amount.inputValue()) === '');

// --- second entry, plain number only ----------------------------------------
await amount.fill('8');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^add £/i }).click();
await page.waitForTimeout(800);
check('plain amount still works', /2 entries/i.test(await page.locator('body').innerText()));

// --- chips learn from what was just entered ---------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const afterReload = await page.locator('body').innerText();
check('entries survive a reload', /2 entries/i.test(afterReload));

if (shot != null) await page.screenshot({ path: shot, fullPage: true });

check('no console or page errors', problems.length === 0);

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
