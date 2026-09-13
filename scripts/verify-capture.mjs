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

const amount = page.getByLabel(/^amount/i);
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

// --- the keypad toggle -------------------------------------------------------
// iOS shows a keypad with no letters for inputmode=decimal, which made the
// whole type-a-description feature unreachable on the phone it was built for.
check('starts on the number keypad', (await amount.getAttribute('inputmode')) === 'decimal');
check('starts with a numeric placeholder', (await amount.getAttribute('placeholder')) === '0.00');

await page.getByRole('button', { name: /switch to the letter keyboard/i }).click();
await page.waitForTimeout(400);
check('toggling asks for the letter keyboard', (await amount.getAttribute('inputmode')) === 'text');
check('placeholder now shows what can be typed', /tesco/.test((await amount.getAttribute('placeholder')) ?? ''));
check('the field keeps focus after the swap', await amount.evaluate((el) => el === document.activeElement));

await page.getByRole('button', { name: /switch back to the number keypad/i }).click();
await page.waitForTimeout(400);
check('toggling back returns to numbers', (await amount.getAttribute('inputmode')) === 'decimal');

// --- dictated text ------------------------------------------------------------
// iOS dictation writes numbers as words, so this is what actually arrives in
// the field when someone uses the microphone on the letter keyboard.
await page.getByRole('button', { name: /switch to the letter keyboard/i }).click();
await page.waitForTimeout(300);
await amount.fill('forty five pounds twenty fuel yesterday');
await page.waitForTimeout(500);
const dictated = await page.locator('form').innerText();
check('understands a dictated amount', /add £45\.20/i.test(dictated));
check('understands a dictated category', /fuel/i.test(dictated));

await page.getByRole('button', { name: /^add £/i }).click();
await page.waitForTimeout(800);
check('a dictated entry saves', /3 entries/i.test(await page.locator('body').innerText()));
check('saving returns to the number keypad', (await amount.getAttribute('inputmode')) === 'decimal');

if (shot != null) await page.screenshot({ path: shot, fullPage: true });

check('no console or page errors', problems.length === 0);

console.log(JSON.stringify({ results, problems }, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
