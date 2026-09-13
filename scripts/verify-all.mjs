/**
 * Run every browser verification against a dev server, and report as one.
 *
 * Exists because of a real miss: `verify-import` broke when App.tsx was
 * restructured and went unnoticed for a slice, because only the newest suite
 * was being run each time. CI covers the unit tests but not these — they need
 * a dev server and real browsers — so this is the one command to run before
 * shipping a UI change.
 *
 *   npm run dev
 *   npm run verify:all
 */
import { spawn } from 'node:child_process';

const url = process.argv[2] ?? 'http://localhost:5173/';
const suites = ['verify-import', 'verify-capture', 'verify-insights', 'verify-favourites'];

const run = (suite) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [`scripts/${suite}.mjs`, url], { encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (out += chunk));
    child.on('close', (code) => {
      let results = [];
      try {
        results = JSON.parse(out).results ?? [];
      } catch {
        /* Crashed before printing — reported as a failure below. */
      }
      resolve({ suite, code, results, raw: out });
    });
  });

let failed = 0;
for (const suite of suites) {
  const result = await run(suite);
  const passes = result.results.filter((r) => r.pass).length;
  const failures = result.results.filter((r) => !r.pass);

  if (result.code === 0) {
    console.log(`PASS  ${suite.padEnd(18)} ${passes} checks`);
  } else {
    failed += 1;
    console.log(`FAIL  ${suite.padEnd(18)} ${passes} passed, ${failures.length} failed`);
    for (const failure of failures) console.log(`        ✗ ${failure.name}`);
    if (result.results.length === 0) console.log(result.raw.trim().split('\n').slice(-6).join('\n'));
  }
}

console.log(failed === 0 ? '\nAll browser checks passed.' : `\n${failed} suite(s) failing.`);
process.exit(failed === 0 ? 0 : 1);
