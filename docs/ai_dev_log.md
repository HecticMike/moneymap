# Money Map 2 — dev log

Newest entry first. Factual and concise; partial work is stated as partial.

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
