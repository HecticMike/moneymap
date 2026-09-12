# Money Map

Understand where the money actually goes.

An offline-first PWA for a two-person household, built to answer *"is this month
unusual?"* and *"where does it go?"* rather than to police a budget. Successor to
[money-map](https://github.com/HecticMike/money-map), which stays running and
untouched.

## Status

**Slice 1 of 5 — foundation.** The data layer is done and tested. Capture, sync
and insights are not built yet. See [docs/ai_dev_log.md](docs/ai_dev_log.md).

| Slice | | |
|---|---|---|
| 1 | Foundation + migration | ✅ done |
| 2 | Automatic Drive sync | next |
| 3 | Fast capture | |
| 4 | Insights | |
| 5 | Polish | |

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 46 tests
npm run typecheck
npm run build
```

Drive sync needs a Google OAuth client id:

```bash
echo "VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com" > .env.local
```

The id is a public identifier, not a credential — it ships in the built bundle.
`http://localhost:5173` must be an authorised JavaScript origin on the client.

## How it works

**Local-first.** Entries live in IndexedDB on each device. Google Drive holds a
JSON backup that the two phones merge through — there is no server, no account,
and no third party holding the data.

**Merging, not overwriting.** Each device keeps its own copy and
[`mergeLedgers`](src/sync/merge.ts) reconciles them: last-write-wins per entry,
with tombstones so a deletion on one phone is not resurrected by the other. The
merge is commutative and idempotent, and both properties are covered by tests —
a merge lacking them corrupts data slowly and invisibly.

**Frozen exchange rates.** Money is captured in GBP or EUR. The rate is resolved
once, at capture, and stored *on the entry*. A July trip to Lisbon therefore
reads the same in December. Reporting rolls everything up to GBP via
`baseAmount`, which is never recomputed on read.

## Layout

```
src/
  domain/     types, categories and groups, money maths   ← pure, fully tested
  sync/       merge engine, Drive file format + importer  ← pure, fully tested
  storage/    IndexedDB
  App.tsx     slice 1 shell: import a backup, see the totals
```

`domain/` and `sync/` hold no React and no I/O, which is why they can be tested
directly and why they are where the risk is concentrated.
