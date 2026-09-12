# Money Map 2 — Claude Code project instructions

## Read order before making changes
1. My current prompt
2. `docs/ai_dev_log.md` — what is done, what is partial, what is blocked
3. `README.md` — architecture and the slice plan

## Authority order
- My current prompt wins over everything below it.
- `ai_dev_log.md` is a handoff and status file, not a task list to pick from.
- If my prompt conflicts with the dev log, follow my prompt.

## What this app is
A tool for **understanding** household spending, not a budget tracker. When a
feature could go either way, favour the one that explains where money went over
the one that polices a limit.

## Non-negotiables
- **The visual identity is settled.** Midnight/ocean ground, `#facc15` yellow,
  Space Grotesk, zero border radius, uppercase wide-tracking labels. Do not
  redesign it. Colours live in `tailwind.config.ts`; use the `brand-*` tokens
  and never raw hex in components.
- **`domain/` and `sync/` stay pure.** No React, no I/O, no `Date.now()` buried
  inside a calculation. That is what makes them testable, and they are where
  the data-loss risk lives.
- **Never recompute `baseAmount` or `rateToBase` on read.** They are frozen at
  capture on purpose. Recomputing silently rewrites history as FX moves.
- **Never change `mergeLedgers` without running its tests.** Commutativity and
  idempotence are correctness requirements, not nice-to-haves. A merge that
  loses either one corrupts data slowly and invisibly.
- **Category IDs are frozen.** They match money-map v1 so the import stays an
  identity mapping. Add new ones; do not rename or remove existing ones.
- **The original repo is off-limits.** `HecticMike/money-map` runs on two real
  phones. This app reads its Drive file (`money-map-data.json`) and never writes
  to it — we write `money-map-data-v3.json`.

## Working rules
- One slice at a time; keep scope small and self-contained.
- Prefer verifying existing work over extending it.
- Do not invent major features unless asked.
- Tests gate deployment. If the suite is red, fix it rather than routing around.
- Mobile-first: both users are on iPhones running this as a home-screen PWA.
  Assume a thumb, one hand, and a shop queue.

## Definition of done
Update `docs/ai_dev_log.md` with: the goal, what was completed, files changed,
checks run, known issues, and the next recommended task. Mark work complete only
if the code changed and was actually verified. State partial work as partial.

## Preferred output at the end of a session
A short summary, files changed, checks run, known issues, and the recommended
next task. No essays.
