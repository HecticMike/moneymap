# Money Map 2 — dev log

Newest entry first. Factual and concise; partial work is stated as partial.

---

## 2026-09-13 — Visual modernisation

### Goal
Requested: keep the base colours and Space Grotesk, everything else open.

### The two changes that did most of the work
1. **Text is no longer yellow.** v1 set `color: #facc15` on `:root`, so body
   copy, labels, numbers and headings were all the same saturated yellow. When
   everything is the accent, nothing is — and long text in yellow on navy is
   genuinely hard to read. Body is now `ink`; yellow is spent on amounts, active
   states and actions, where it means something. The app still reads as
   midnight-and-yellow, arguably more so.
2. **Surfaces are layered, not uniform.** Every panel used to be the same 1px
   box on the same translucent fill, so eight sections read as eight identical
   rectangles with no grouping. There is now an elevation ladder —
   base → raised → high, with `inset` for content wells — plus real shadows.

### Also
- **Type scale.** v1 lived almost entirely at 10–11px. Proper steps from
  `micro` to `display`, with the month total as a genuine hero figure.
- **Letter-spacing dialled back** from `0.3em` to `0.16em`, and uppercase
  reserved for real section labels so it signals something again.
- **Radius introduced** via two tokens (`card`, `control`). Setting both to 0
  restores v1's hard-edged look in one edit.
- **Motion**: press feedback on every control, rise-in for appearing content,
  bars that grow on render. All disabled under `prefers-reduced-motion`.
- **Shared primitives** (`components/ui.tsx`) — Card, Label, Button, Segmented,
  Chip, Well, Badge. Long class strings repeated at each call site is how a
  design drifts.
- **Bars in the insights** replace the 0.5px hairlines; relative size is the
  thing being communicated.
- Currency became a single swap button rather than a stacked pair: two
  currencies, so tapping to switch beats choosing, and it leaves one proper
  target instead of two cramped ones.
- "Today"/"Yesterday" in the Recent list instead of a date.

### Two bugs caught by looking at the screenshots
- **"Rent" was suggested as a favourite directly beneath the Rent shortcut
  already on screen.** Two causes: the dedup only checked the person's own
  favourites and ignored shared ones, *and* the key fell back to the favourite's
  label when it had no note — producing `living_home_rent:rent`, which entries
  can never generate since they key as `living_home_rent`. Both fixed, with a
  test.
- **Tertiary text and the disabled primary button were too dim.** `ink-faint`
  was below ~4.5:1 at 11px; the button was dimmed by colour *and* a blanket
  opacity. Ink tiers lightened, blanket opacity removed in favour of
  per-variant disabled colours.

### Tap-target rule, refined honestly
The audit flagged the segmented controls. Apple asks for 44×44, but iOS ships
its own segmented control at 32pt — because a short *but wide* control is a
different risk: a vertical mis-tap lands on nothing, whereas a small square
button beside a delete icon lands on the delete icon. The audit now fails on
genuinely cramped targets (`height < 32`, or `< 44` while narrower than 72) and
reports short-but-wide ones without failing.

On measuring, these segments were 35–63px wide — no width to compensate — so
they were raised to the full 44px rather than excused.

### Files changed
New: `src/components/ui.tsx`.
Rewritten: `tailwind.config.ts`, `src/index.css`, `src/App.tsx`,
`src/components/{Capture,Favourites,Insights,SyncPanel}.tsx`.
Modified: `src/domain/{favourites,favourites.test}.ts`,
`scripts/audit-layout.mjs`.

### Checks run
- `npm test` — **170 passed**
- `npm run verify:all` — **59 browser checks, all passing** — so the redesign
  changed no behaviour
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini
- typecheck and build clean; precache 684 KB

### Known issues / blockers
- Reviewed in WebKit-in-Playwright, not on a physical iPhone.
- `radius` is a judgement call: v1 was hard-edged, and "modernise" was read as
  permission to soften. Two tokens to zero reverts it.
- Favourites sync still unproven across two real devices.
- Recurring detection still unvalidated against real data.
- `icon-512.png` still 309 KB; no UI to re-rate an approximate-FX entry.

### Next recommended task
Use it for a fortnight. The outstanding items are small and the useful feedback
now is whether the new look survives daily use — particularly whether yellow
still feels like the app's colour when it is no longer on every word.

---

## 2026-09-13 — Per-person favourites, synced

### Goal
Each person keeps their own chosen shortcuts, they reach the other person's
phone, and either phone can log for either person. Chosen by the household, not
inferred for them.

### Schema change — the risky part
`LedgerState` gained `favourites` and `favouriteTombstones`; the Drive file is
now **schema 4**. The *file name* deliberately did not change. A second file
would leave the two phones reading different backups until both happened to
update, which is worse than a short window where an older client round-trips
and drops the favourites array. Entries are never at risk either way, and a
lost favourite is one tap to re-add.

Both phones should be opened once to pick up the new build before relying on
favourite sync.

### Completed
- **Merge generalised** (`mergeCollection`) — favourites get the *same*
  convergence guarantees as entries rather than a second hand-written
  implementation. Commutativity and idempotence are retested with favourites
  present, including the case where an entry and a favourite share an id.
- **`Favourite.person` does double duty**: whose list it appears in, and who an
  entry made from it is attributed to. That is exactly what makes "log my wife's
  spending from my phone" work. `null` means shared.
- **Device owner setting** (`useSettings`) — asked once, stored locally and
  deliberately *not* synced, since each phone would otherwise overwrite the
  other's answer forever. Defaults the person on new entries and opens the right
  favourites tab.
- **Suggestions per person** (`suggestFavourites`) — proposes patterns from that
  person's own entries, never adds one without a tap, never re-proposes
  something already saved, and never attributes unassigned spending to anyone.
- **Favourites UI** with a tab per person; each tab shows that person's plus the
  shared ones.
- `templates.ts` and `useTemplates.ts` removed — superseded.

### Bug found by looking at the screenshot
A favourite with no fixed amount rendered as **£0.00**. `toFiniteNumber` used
`Number(value)`, and `Number(null)` is `0`, not `NaN` — so an explicit
`amount: null` read as zero. The same coercion would have zeroed a real entry
out of every total in the app had a payload ever carried `amount: null`. Fixed
at the source with regression tests for both cases.

### Process failure worth recording
`verify-import` had been failing **since slice 4** restructured `App.tsx`, and
went unnoticed because only the newest suite was run each time. CI covers unit
tests and typecheck but not the browser checks, which need a dev server and real
browsers.

Added `npm run verify:all`, which runs all four suites and reports as one. Run
it before shipping any UI change.

### Files changed
New: `src/domain/{favourites,favourites.test}.ts`, `src/hooks/useSettings.ts`,
`src/components/Favourites.tsx`, `scripts/{verify-favourites,verify-all}.mjs`.
Modified: `src/domain/types.ts`, `src/sync/{merge,merge.test,ledgerFile,
ledgerFile.test,driveClient,syncEngine.test}.ts`, `src/hooks/useLedger.ts`,
`src/storage/ledgerStore.ts`, `src/components/Capture.tsx`, `src/App.tsx`,
`scripts/verify-import.mjs`, `package.json`.
Removed: `src/domain/templates.ts`, `src/hooks/useTemplates.ts`.

### Checks run
- `npm test` — **169 passed** (was 143)
- `npm run verify:all` — **59 browser checks across 4 suites, all passing**
- `npm run audit:layout` — clean on iPhone 15
- typecheck and build clean

### Known issues / blockers
- Favourites sync is unproven against two real devices. The merge is tested, but
  nothing has watched a favourite created on one phone appear on the other.
- The `HOUSEHOLD` list is still a hardcoded constant. Fine for two people;
  adding or renaming someone means a code change.
- Recurring detection still unvalidated against real data.
- Still no UI to re-rate an approximate-FX entry; `icon-512.png` still 309 KB.

### Next recommended task
**Visual modernisation** — requested explicitly: keep the base colours and Space
Grotesk, everything else open. Worth treating as its own pass with a look at
the current screens first.

---

## 2026-09-13 — Slice 4: insights

### Goal
Answer the two questions the app exists for: *is this month unusual?* and
*what repeats versus what was a one-off?*

### Completed
- **Like-for-like month comparison** (`src/domain/insights.ts`). The trap this
  file exists to avoid: comparing 13 days of September against whole months of
  July and August and reporting a collapse in spending. Every comparison takes
  the *same slice* of each prior month, clamping to short months so a 31st never
  spills past February. The window used is returned and shown ("Same days of
  Mar, Apr, May…").
- **Movement thresholds that keep the feature believable.** A change is only
  flagged when it clears 20% *and* £15 *and* there are at least two prior
  months. Without the absolute floor, "Supplements up 300%" fires on a £2 move
  and nothing else on the screen gets trusted either.
- **Baseline from months that exist.** Only prior windows reaching back to the
  first entry count. Otherwise importing two months of history and averaging
  over six divides by four empty months and reports spending as tripled.
- **Recurring detection** (`src/domain/recurring.ts`) — three occurrences
  minimum, regular spacing (CoV ≤ 0.3) and consistent amounts (CoV ≤ 0.25).
  Handles weekly through annual, normalises to a monthly figure, and marks a
  series lapsed once well past due. Tuned to miss a real subscription rather
  than invent one.
- **Insights UI** (`src/components/Insights.tsx`) — this month vs usual, what
  moved, a tappable group→category breakdown, and committed spend.

### Design flaw caught in review, and fixed
The first build labelled *every* detected repeat "Committed each month — money
that leaves without a decision". The screenshot showed it listing Eating Out and
Fuel: genuinely regular, but nobody is obliged to go to dinner. The figure
overstated how trapped the household was — wrong in the direction that makes
someone feel worse, which is the worst direction to be wrong in.

Now split: **Committed** (rent, utilities, insurance, subscriptions, school
fees, childcare, gym) against **Regular, but a choice**. On the test fixture
that is £1,348.99 versus £107.00 — two different facts, and only one of them is
an obligation.

### Files changed
New: `src/domain/{insights,insights.test,recurring,recurring.test}.ts`,
`src/components/Insights.tsx`, `scripts/verify-insights.mjs`.
Modified: `src/App.tsx` (restructured around Insights), `package.json`.

### Checks run
- `npm test` — **143 passed** (was 106; +37 insights/recurring)
- `npm run verify:insights` — **19/19** in WebKit at iPhone 15, against six
  months of generated history built relative to today
- `npm run audit:layout` — clean on iPhone 15
- typecheck and build clean

Two failures along the way, both mine rather than the app's: a bare `.sort()` on
numbers in a test (lexicographic, so 11.99 sorted before 9.99), and a browser
assertion that sliced page text by character count and ran into the Recent list
below, which legitimately shows Payroll. Both corrected; the second is now
scoped to the section element.

### Known issues / blockers
- **Recurring detection is unvalidated against real data.** It is tuned
  conservatively and well covered by unit tests, but no actual household
  history has been through it. The committed-categories list is a judgement
  call and may need adjusting once it meets real entries.
- Templates remain per-device (slice 3 note stands).
- Still no UI to re-rate an approximate-FX entry.
- `icon-512.png` still 309 KB.
- No physical-device testing; WebKit-in-Playwright only.

### Next recommended task
**Slice 5 — polish**, or better, use the app for a couple of weeks first. The
insights are only as good as the history behind them, and the committed/habitual
split in particular wants real entries before it is tuned further. Outstanding
polish items are small: icon re-encoding, an FX re-rate control, and optionally
syncing templates via the Drive payload.

---

## 2026-09-13 — Slice 3: fast capture

### Goal
Make logging an entry quick one-handed. v1 took five interactions and a scroll
through a 24-item dropdown defaulted to Supermarket regardless of usage.

### Completed
- **Ranked category chips** (`src/domain/suggestions.ts`) — top six categories
  by recency-weighted frequency, 30-day half-life so the chips follow current
  habits instead of ossifying. Falls back to a sensible default set on a cold
  install, always filling the row.
- **Free-text capture** (`src/domain/parseEntry.ts`) — one field takes `12.50`
  or `45.20 tesco 12 sep`. Extracts amount, date (today/yesterday/day
  names/`12 sep`/`01/09`) and category. Date is parsed *first*, or "12 sep"
  has its day eaten as the amount and the entry silently costs £12.
- **Learned associations** — note words are mapped to categories from the
  household's own entries and beat the built-in keyword table, which exists
  only to cover the cold start. Requires two sightings; one is coincidence.
- **Saved templates** (`src/domain/templates.ts`, `useTemplates`) — one tap
  fills category, currency, person and note.
- **Capture rebuilt** (`src/components/Capture.tsx`, replaces `QuickAdd.tsx`) —
  smart field, an Out/In toggle, chips, templates, and date/person/note
  collapsed behind a disclosure. Fast path is now: type amount, tap chip, add.

### Design decisions worth keeping
- **Parsing is shown, never silently applied.** Everything understood is echoed
  above the button ("£45.20 · Supermarket · 12 Sep · "tesco"") and the submit
  button reads `Add £45.20`. The parser may be wrong; it may not be wrong
  invisibly.
- **Explicit choices beat parsing.** Category, date and note are held as
  separate overrides, so typing more never undoes a chip just tapped. Covered
  by a browser check.
- **Guessing stops rather than guesses badly.** `guessCategory` returns null
  when unsure instead of defaulting to something plausible.

### Files changed
New: `src/domain/{suggestions,suggestions.test,parseEntry,parseEntry.test,templates}.ts`,
`src/hooks/useTemplates.ts`, `src/components/Capture.tsx`,
`scripts/verify-capture.mjs`.
Modified: `src/App.tsx`, `src/storage/db.ts` (templates key).
Removed: `src/components/QuickAdd.tsx`.

### Checks run
- `npm test` — **106 passed** (was 67; +21 suggestions/parsing)
- `npm run verify:capture` — **12/12** in WebKit at iPhone 15
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini
- typecheck and build clean; precache 660 KB

One unit test failed first time. The cause was a badly chosen fixture
(`"20 sep 5 dinner"` is genuinely ambiguous) *and* a real parser rule that was
too aggressive: any date past today was read as last year, so `sep 20` typed on
13 Sep jumped back twelve months. Tolerance is now 31 days, which keeps
`25 dec` in September meaning last Christmas while leaving a near-term date
alone.

### Known issues / blockers
- **Templates are per-device.** Chips are derived from synced history so those
  already agree across both phones, but a template saved on one phone does not
  reach the other. Carrying them would mean adding them to the Drive payload —
  a sync-format change, deliberately not bundled into this slice.
- Keyword table is UK/Portugal-biased guesswork and only matters until the
  household's own history takes over. Wrong guesses are visible and
  one-tap-correctable.
- Still no UI to re-rate an approximate-FX entry.
- `icon-512.png` still 309 KB.
- No physical-device testing; WebKit-in-Playwright only.

### Next recommended task
**Slice 4 — insights.** Group rollups already exist in rough form; what is
missing is the part actually asked for: month-vs-month variance ("is this month
unusual?") and recurring-vs-one-off detection. Both are pure functions over the
ledger and belong in `src/domain/` with tests.

---

## 2026-09-12 — iPhone layout fixes

### Goal
Fix visual defects reported from a real iPhone 15: Date and Person fields
overlapping, plus "some inconsistencies".

### Root causes found
Reproduced by adding **WebKit** to the Playwright setup. Chromium does not stand
in for this — the defects are specifically how WebKit sizes and paints form
controls.

1. **Selects rendered lighter than the inputs beside them.** WebKit styles form
   controls itself and overrides Tailwind's `bg-brand-midnight`, so Category and
   Person were visibly grey next to Date and Note. This was the "inconsistency".
2. **Date/Person overlap.** They shared a two-column grid. The native date
   control has a minimum intrinsic width and will not shrink, so at 393px it
   pushed into its neighbour.
3. **Tap targets below Apple's 44pt minimum** — worst was Delete at 26px, on a
   destructive action in a scrollable list.

### Completed
- `appearance: none` plus explicit background on every form control, with a
  brand-yellow chevron drawn as an inline SVG to replace the native arrow.
- Date and Person each take a full row. Person became a **segmented control** —
  bigger targets, one tap instead of a dropdown, no native styling to fight.
- Added **Today / Yesterday** shortcuts next to the date. A capture-speed win
  that arrives early.
- All interactive controls raised to 44px via a `.tap-target` utility.
- Delete is now a 44×44 icon button instead of a 26px "Del".
- `background-attachment: fixed` removed earlier this session stays out; iOS
  repaints it badly.

### New tooling
`scripts/audit-layout.mjs` (`npm run audit:layout`) measures rather than
eyeballs: horizontal overflow, elements escaping the viewport, overlapping
controls, and undersized tap targets — in WebKit at a chosen iPhone profile.

First run flagged a truncated note as overflowing. That was a false positive:
`getBoundingClientRect` reports the unclipped layout box, so any `truncate`d
text looks oversized. The audit now ignores elements clipped by an ancestor.

### Checks run
- `npm run audit:layout` — **clean on iPhone 15 and iPhone 13 Mini**: no
  overflow, no overlaps, no undersized targets, no JS errors
- `npm test` — 67 passed
- `npm run verify:browser` — 12/12
- typecheck and build clean

### Known issues
- Slice 2's list stands: no UI to re-rate an approximate-FX entry;
  `icon-512.png` still 309 KB.
- Only WebKit-in-Playwright, not a physical device. It reproduced the reported
  defects faithfully, but real iOS Safari can still differ on native controls.

### Next recommended task
**Slice 3 — fast capture.** One-tap category chips ranked by actual usage, saved
templates, and free-text entry, on top of the form as it now stands.

---

## 2026-09-12 — Slice 2: automatic Drive sync

### Goal
Remove the manual Push/Pull ritual. Sync should happen by itself, and a
concurrent write from the other phone must never cost an entry.

### Completed
- **Sync engine** (`src/sync/syncEngine.ts`) — `syncOnce` behind a `RemoteStore`
  interface, so the whole algorithm including conflict cases is tested without
  touching Google. Skips the write entirely when the remote already agrees, so
  a cold open with no changes costs one read and zero writes.
- **GIS driven directly** (`src/sync/googleAuth.ts`) — replaces v1's
  `@react-oauth/google` with `prompt: 'consent'`, which forced the full consent
  screen every session. Tokens are held in memory only; only a "has consented"
  boolean is persisted.
- **Drive client** (`src/sync/driveClient.ts`) — find/read/create/update against
  `money-map-data-v3.json`. Recovers if the backup is deleted from Drive
  directly. Query values escaped. The v1 file is opened read-only.
- **Automatic triggers** (`src/hooks/useSync.ts`) — on open, 4s after the last
  edit, on regaining connectivity, on returning to the foreground, and a 5-minute
  idle poll. Exponential backoff to 15 min on repeated failure.
- **Ledger operations** (`src/hooks/useLedger.ts`) — add/update/delete with
  tombstones. Dirty state is tracked by revision counter rather than a boolean,
  so an edit made *during* a sync is not wrongly marked clean.
- **FX resolution** (`src/domain/fx.ts`) — frankfurter.app, cached in IndexedDB,
  nearest-day fallback when offline. Returns null rather than inventing a rate;
  the UI refuses the save instead of freezing a wrong rate onto an entry.
- **Mobile-first capture** (`src/components/QuickAdd.tsx`) — v1's two-column
  desktop grid rebuilt for a thumb, with a currency toggle. Chips, templates and
  free-text sit on top of this in slice 3.
- **Browser verification** — `scripts/verify-import.mjs` drives a real Chromium
  at iPhone 13 size through file → parse → merge → IndexedDB → render → reload.
  12 checks. This closes slice 1's "nothing has looked at the rendered page".

### Design constraint found, and how it is handled
A browser-only app **cannot** hold a refresh token — that needs a client secret,
which cannot ship in a public bundle. `requestAccessToken` also opens a popup,
and popups outside a user gesture are blocked. So the honest ceiling without a
backend is: one tap to authorise (no consent screen after the first time), ~1
hour of genuinely automatic sync, then one tap to resume.

This is implemented as designed rather than papered over: automatic renewal is
attempted silently, a blocked popup is treated as expected rather than as an
error, and the UI shows a single "Reconnect" tap. Truly invisible refresh needs
the Cloudflare token broker, which remains a drop-in swap.

### Files changed
New: `src/sync/{syncEngine,syncEngine.test,googleAuth,driveClient}.ts`,
`src/hooks/{useLedger,useSync}.ts`, `src/domain/{fx,fx.test,people}.ts`,
`src/components/{QuickAdd,SyncPanel}.tsx`, `scripts/{screenshot,verify-import}.mjs`.
Modified: `src/App.tsx` (rewritten), `src/index.css`, `package.json`,
`src/sync/driveClient.ts` type fix.

### Checks run
- `npm test` — **67 passed** (was 46; +13 sync engine, +8 FX)
- `npm run typecheck` — clean
- `npm run build` — clean, precache 645 KB
- `npm run verify:browser` — 12/12 in real Chromium, no console errors, state
  survives a reload

Three browser checks failed on first run. All three were bad assertions, not
app defects: `innerText` reports text as *rendered*, and this design uses
`text-transform: uppercase` widely, so "6 entries" comes back "6 ENTRIES"; and
two fixture entries lack timestamps, not one. Assertions corrected.

Also removed `background-attachment: fixed` from body — it produced a ghost-text
artifact in full-page screenshots and repaints badly on iOS Safari.

### Known issues / blockers
- **The Google OAuth flow itself is unverified.** Every path around it is
  tested, but completing a real sign-in needs a human and a Google account.
  Nothing has yet confirmed a token is obtained, a Drive file written, or two
  devices converging on real data.
- **The iOS standalone-PWA popup question is still open.** Whether OAuth
  completes when launched from the home screen rather than a Safari tab decides
  whether the token broker is needed. Unanswered.
- **Not run against the household's real v1 backup.**
- `icon-512.png` still 309 KB. Slice 5.
- No UI yet for re-rating an approximate-FX entry, though `rateDate` records it.

### Next recommended task
**Verify the real sync round trip before building slice 3.** Connect Drive in
the deployed app, import from v1, confirm `money-map-data-v3.json` appears in
Drive and that v1's file is untouched, then open on the second phone and check
both converge. Everything after this assumes sync works; finding out it does not
is much cheaper now than after two more slices are stacked on it.

---

## 2026-09-12 — Slice 1: foundation + migration

### Goal
Stand up the new app's data layer so later slices have something safe to build
on: entry schema with real currency support, the v1 conflict-resolution engine
ported and *tested*, durable local storage, and a lossless importer for the
existing money-map history.

### Completed
- **Repo scaffolded** — Vite 5 + React 18 + TS 5.6 + Tailwind 3, PWA via
  `vite-plugin-pwa`. Palette, Space Grotesk and the square-edged look carried
  over from v1 unchanged.
- **Entry schema** (`src/domain/types.ts`) — per-entry `currency`, `rateToBase`,
  `rateDate` and a frozen `baseAmount`. Rates are captured once and never
  recomputed, so a Portugal trip does not re-value itself as FX moves.
- **Category groups made explicit** (`src/domain/categories.ts`) — v1 encoded
  five groups in the category *keys* and never used them. `GROUP_META` and
  `groupOf()` expose them; the slice 1 shell already renders a group rollup.
- **Merge engine ported** (`src/sync/merge.ts`) with two real fixes:
  - `entryClock` no longer includes `date`. In v1 it did, so an entry dated in
    the future outranked any later deletion and **could not be deleted** — it
    returned on every sync. Regression test covers this.
  - Equal-timestamp ties break on content signature instead of visit order.
    v1's `>=` made the merge non-commutative, so two phones merging the same
    pair in opposite orders reached different states and never converged.
- **Money handling** (`src/domain/money.ts`) — `roundMoney` corrects float
  representation error before rounding (`1.005` → `1.01`, not `1.00`).
  `parseAmount` accepts `12.50`, `12,50`, `£12.50`, `1,234.56`, `1.234,56`.
- **Storage moved to IndexedDB** (`src/storage/db.ts`) via `idb-keyval` — which
  v1 had as a dependency and never imported — plus `navigator.storage.persist()`.
  localStorage is the first thing iOS evicts under pressure.
- **Importer** (`src/sync/ledgerFile.ts`) reads both the v1 `{expenses:[]}` and
  the new v3 `{entries:[]}` shapes, returns a `ParseReport`, and never throws on
  malformed input.
- **Slice 1 shell** (`src/App.tsx`) — drag-and-drop import of a v1 backup with a
  visible report, plus stored totals and the group rollup. Lets the household
  verify its real history imports correctly before slice 2 automates Drive.
- **CI gates deploy on tests** — `.github/workflows/deploy.yml` runs typecheck
  and the suite before it will build or deploy.

### Carried-over v1 defects fixed
| Defect in v1 | Status |
|---|---|
| `brand-amber` used 25× but never defined — no hover feedback anywhere | Defined in `tailwind.config.ts` |
| `vite.config.js` (stale compiled artifact) shadowed `vite.config.ts` | Only `.ts` exists |
| `index.html` used absolute `/manifest.webmanifest`, 404s under the Pages subpath | Relative paths |
| `background_color: #f1f5f9` on a midnight app — white flash on cold start | Both manifest colours are `#090b1d` |
| Google Fonts `@import` — blocks first paint, fails offline | Self-hosted via `@fontsource`, latin subset |
| `idb-keyval` a dependency, imported zero times | Now the storage layer |
| No tests at all | 46 |

### Files changed
All new. `src/domain/{types,categories,money,money.test}.ts`,
`src/sync/{merge,merge.test,ledgerFile,ledgerFile.test}.ts`,
`src/storage/{db,ledgerStore}.ts`, `src/{App.tsx,main.tsx,index.css,vite-env.d.ts}`,
plus config, `.github/workflows/deploy.yml` and docs.

### Checks run
- `npm test` — **46 passed** (merge 14, ledgerFile 14, money 18)
- `npm run typecheck` — clean under `strict` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes`
- `npm run build` — clean; 158 KB JS (51 KB gzip), precache 602 KB
- `npm run dev` — serves and transforms modules

Precache started at 2666 KB; `public/logo.png` (959 KB, never referenced) and
`icon-1024.png` (884 KB, not in the manifest) were removed, and font subsets
narrowed to latin woff2.

### Known issues / blockers
- **Not verified against the household's real data.** The importer is tested
  against a synthetic v1 payload. It needs one real `money-map-data.json`
  through it before slice 2 is built on top.
- **No browser rendering check.** Build, typecheck and module transforms pass;
  nothing has actually looked at the rendered page.
- **`public/icons/icon-512.png` is 309 KB** for a flat two-colour mark — should
  be ~10 KB re-encoded as a palette PNG. Slice 5.
- **Clock skew** is unhandled and unhandleable without a server: last-write-wins
  compares wall clocks, so a fast-running phone wins conflicts it should lose.
  Documented in `merge.ts`; acceptable for two devices that take network time.
- **Drive is untouched so far.** No auth, no fetch, no write. Slice 2.

### Next recommended task
**Slice 2 — automatic Drive sync.** Replace v1's `prompt: 'consent'` with silent
token renewal, drive the Google Identity Services client directly rather than
through `@react-oauth/google` (the wrapper does not expose the `prompt` control
silent renewal needs), sync on app open / after each entry / on reconnect, and
guard concurrent writes with an `If-Match` etag instead of v1's blind
three-attempt retry loop.

Verify first, before building: that OAuth popups actually complete inside an
installed iOS home-screen PWA. If they do not, the Cloudflare token broker
becomes necessary and it is a drop-in swap.
