# Money Map 2 — dev log

Newest entry first. Factual and concise; partial work is stated as partial.

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
