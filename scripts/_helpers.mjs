/**
 * Shared steps for the browser verification scripts.
 *
 * Import and settings moved behind a sheet, and repeating that flow in four
 * scripts is how they drift out of step with the app — which already happened
 * once, when verify-import silently broke for a whole slice.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Write a backup payload to a temp file and return its path. */
export const writeBackup = (payload) => {
  const file = join(mkdtempSync(join(tmpdir(), 'mm-')), 'money-map-data.json');
  writeFileSync(file, JSON.stringify(payload));
  return file;
};

export const openSettings = async (page) => {
  // `exact` matters: Playwright matches accessible names by substring, and the
  // currency indicator is labelled "…Change in settings."
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(400);
};

export const closeSettings = async (page) => {
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(400);
};

/** Answer the first-run "whose phone is this" prompt, if it is showing. */
export const claimPhone = async (page, person) => {
  const prompt = page.getByRole('button', { name: person, exact: true }).first();
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.click();
    await page.waitForTimeout(300);
  }
};

/**
 * Import a backup through the settings sheet, leaving the sheet closed.
 *
 * Returns the sheet's text as it was *before* closing, because the import
 * report is rendered inside the sheet — a caller checking the page body after
 * this returns would never see it.
 */
export const importBackup = async (page, file) => {
  await openSettings(page);
  await page.getByRole('button', { name: /import from a file instead/i }).click();
  await page.waitForTimeout(300);
  await page.setInputFiles('input[type=file]', file);
  await page.waitForTimeout(1200);

  const reportText = await page.getByRole('dialog').innerText();

  await closeSettings(page);
  await page.waitForTimeout(400);
  return reportText;
};

/** innerText of the section whose heading matches. */
export const sectionText = (page, heading) =>
  page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    const section = [...document.querySelectorAll('section')].find((el) =>
      re.test(el.innerText.trim().slice(0, 60))
    );
    return section?.innerText ?? '';
  }, heading);
