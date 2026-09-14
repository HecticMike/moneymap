# Money Map 2 — dev log

Newest entry first. Factual and concise; partial work is stated as partial.

---

## 2026-09-14 — Device verification

Confirmed on a real iPhone by the household. Three items that had been shipped
but unverifiable from here are now closed:

- **The ABC button raises the letter keyboard.** The blur-and-refocus-after-mount
  approach works on the device, not just in Playwright.
- **The system dictation key reaches the field**, and the spoken-number
  normalisation handles what it produces.
- **The CSV downloads** from the installed home-screen app.

No code changed. The user guide was updated to cover all three, since it had
described free-text entry without mentioning it is unreachable until the
keyboard is switched.

---

## 2026-09-13 — Notes reach the export

### The question
Does a spoken or typed description end up in the note, so a spreadsheet can
compare one supermarket against another?

### What checking found
1. **Yes.** `£2.5 tesco` → amount 2.50, note `tesco`, category Supermarket.
   Already working.
2. **But casing was inconsistent.** Typed `2.50 Tesco` kept the capital;
   dictated `forty five pounds Tesco` came back `tesco`, because
   `normaliseSpokenAmount` lowercased the whole string to match number words.
   The same shop would have split into two rows in any spreadsheet grouping.
3. **There was no export at all.** v1 had one; it was never ported. The
   analysis being planned was not possible.

### Fixes
- The spoken normaliser now emits every non-number token **exactly as spoken**,
  matching on a lowercased copy. Dictation capitalises proper nouns and that
  capital is worth keeping, precisely because the note is what gets filtered.
- **CSV export** (`src/domain/exportCsv.ts`), in Settings → Export.

### Why CSV and not .xlsx
v1 used SheetJS. Its npm distribution carries known prototype-pollution and
ReDoS advisories, and it pulls roughly 400KB into an app whose entire bundle is
smaller than that. CSV needs no dependency, opens straight into Excel and
Numbers, and will still be readable in ten years — which matters more for a
household's own financial history than cell formatting.

Three details that are easy to get wrong:
- **A byte order mark**, or Excel on Windows renders `£` and `Inês` as mojibake.
- **Formula neutralisation.** A cell starting `=`, `+`, `-` or `@` is *executed*
  when the file opens. A note is free text somebody typed, so it is prefixed
  with an apostrophe — `=HYPERLINK(...)` in a note is a genuine exfiltration
  route out of an innocuous spreadsheet.
- **`Committed` as a column**, so the chosen-versus-owed split travels with the
  data and a pivot table does not have to reconstruct it.

### Files changed
New: `src/domain/{exportCsv,exportCsv.test}.ts`.
Modified: `src/domain/spokenNumbers.ts` (casing), `src/components/Settings.tsx`,
`scripts/verify-capture.mjs`.

### Checks run
- `npm test` — **253 passed** (was 241; +12 on the export)
- `npm run verify:all` — **113 browser checks**; capture now asserts the
  description reaches the note and that a dictated capital survives
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini
- Generated CSV inspected directly; quoting, BOM and column order confirmed
- typecheck and build clean; precache 718 KB

### Known issues / blockers
- **The download itself is untested on a real iPhone.** A blob download works in
  Safari, but behaviour inside an installed home-screen PWA needs confirming on
  a device.
- Notes are still free text, so `Tesco` and `Tescos` remain different strings.
  Grouping by note is a spreadsheet's job, not the app's — but a "tidy up
  similar notes" tool would be a reasonable future addition.
- The keyboard swap remains unverified on a real device (previous entry).
- The user guide mentions neither the ABC button, dictation, nor the export.
- Streak detection still not built; committed split still unvalidated against
  real data; favourites sync unproven across two devices.

### Next recommended task
One pass on a real iPhone covering all three unverified things: that ABC raises
the letter keyboard, that dictation reaches the field, and that the CSV
downloads. Then update the guide to cover them.

---

## 2026-09-13 — Keypad switch and dictation

### The bug
The amount field used `inputMode="decimal"`. On iOS that is a keypad with **no
letters at all and no way to reach any**, so the free-text capture shipped in
slice 3 was unreachable on the only device this app runs on. The placeholder
read `12.50 tesco` — promising something the keyboard forbade.

### Fix
A **123 / ABC** button on the right of the field. Numbers remain the default,
because nearly every entry is just an amount.

The two modes are genuinely different controls:

- **Numbers** — an `<input>`, 36px, tabular figures, the hero of the screen.
- **Text** — a `<textarea>` that wraps and grows. The side buttons leave about
  177px, and no readable size fits a dictated sentence on one line; wrapping is
  the only way to show it. That matters most here, because dictation is exactly
  when you need to read back what was heard.

### Voice
Rather than the Web Speech API — unreliable inside an installed iOS PWA — this
uses **the system keyboard's own dictation key**, which is right there on the
letter keyboard. So the keypad switch *is* the voice feature, with no extra
permission, no new dependency, and nothing to fail silently.

What was missing was the parsing. iOS dictation writes numbers as words, and
British speech puts the pence after the unit. `src/domain/spokenNumbers.ts`
normalises both: "forty five pounds twenty fuel yesterday" → `45.20 fuel
yesterday`, which the existing parser already understands.

**It runs only as a fallback** (`parseEntryInput`), when reading the text
literally finds no amount. Normalising unconditionally would rewrite typed input
too — "table one" would quietly become a £1 entry.

### Two bugs found while building it
- **Swapping input→textarea replaced the element**, so the focus call in the
  click handler targeted the control about to be unmounted. The keyboard closed
  and the field had to be tapped again — defeating the button entirely. Focus
  now happens in an effect after the new element mounts.
- **Dictated text was rendered at 36px**, showing about eleven characters of a
  forty-character sentence. Caught by rendering it, not by any test.

### Files changed
New: `src/domain/{spokenNumbers,spokenNumbers.test}.ts`.
Modified: `src/domain/parseEntry.ts` (`parseEntryInput`),
`src/components/Capture.tsx`, `scripts/{verify-capture,verify-favourites}.mjs`.

### Checks run
- `npm test` — **241 passed** (was 227; +14 on spoken numbers, including the
  full dictated sentence end to end)
- `npm run verify:all` — **110 browser checks**; verify-capture now covers the
  toggle, that focus survives the swap, and that a dictated entry saves
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini
- typecheck and build clean; precache 717 KB

### Known issues / blockers
- **The keyboard swap itself is unverifiable here.** Playwright reports
  `inputmode` and focus, but no headless browser raises an iOS keyboard. Whether
  tapping ABC actually opens the letter keyboard needs a real phone.
- Spoken-number coverage is British English and cardinals only. "Twelve fifty"
  meaning £12.50 is deliberately *not* handled — too ambiguous to guess.
- The user guide artifact does not yet mention the ABC button or dictation.
- Streak detection still not built; committed/discretionary split still
  unvalidated against real data; favourites sync unproven across two devices.

### Next recommended task
Confirm on a real iPhone that ABC raises the letter keyboard and that the
dictation key reaches the field. If it does, add both to the user guide.

---

## 2026-09-13 — Per-person display preferences

### Goal
Keep the shipped defaults as the defaults, and let each person override what
they see.

### Scope decision
Preferences are stored **per device but keyed by person**
(`src/domain/preferences.ts`). Today that distinction is invisible — there is a
phone each, so device scope and person scope are the same thing. It matters the
moment a phone is shared or a third person appears, and keying by person now
costs nothing. If preferences should later follow a person between devices, the
map lifts straight into the synced ledger without reshaping.

Deliberately **not synced**: Inês wanting fewer cards should not change Miguel's
screen, and `owner` explicitly must not sync.

Device-level (not per-person) on purpose: `owner`, and `captureCurrency` —
which tracks where the phone *is*, and the household travels together.

### What is now overridable
- **Which insight cards appear** — trend chart, where the choices went, where it
  goes, committed. The headline is not optional; it is the app.
- **Spending vs Balance view** — moved out of flat settings into the per-person
  map.
- **The "Where it goes" period**, which previously reset to 3M on every app
  open. That was arguably a bug: someone who prefers 1Y had to re-tap it every
  session.

Left alone deliberately: the statistical thresholds (baseline lookback,
`≥20% and ≥£15` for notable, `≥3 occurrences` for recurring). Exposing those
reads as control but mostly lets the warnings be tuned away, and a threshold you
set yourself stops being evidence.

Capture Out/In still resets to Out each session, on purpose. A sticky "In" means
logging a coffee the next morning and silently recording it as income.

### Design details worth keeping
- **Resolution merges, never replaces.** An override written before a card
  existed still gets that card's default, so a new card appears rather than
  reading `undefined` and vanishing.
- **`hasOverrides` drives an explicit "Currently on the defaults" / "Back to the
  defaults"**, so it is always clear whether what you are seeing is the app's
  opinion or your own edit.
- **Legacy `view` migrated** into the owner's slot; without it, updating would
  quietly put whoever chose Balance back onto Spending.

### Files changed
New: `src/domain/{preferences,preferences.test}.ts`.
Rewritten: `src/hooks/useSettings.ts`.
Modified: `src/components/{Settings,Insights}.tsx`, `src/App.tsx`,
`scripts/verify-views.mjs`.

### Checks run
- `npm test` — **227 passed** (was 212; +15 on preference resolution)
- `npm run verify:all` — **100 browser checks**, verify-views now 28, including
  that one person's override does not change the other's screen, that it
  survives a reload, and that the reset works
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini, main + sheet
- typecheck and build clean; precache 713 KB

### Known issues / blockers
- Preferences do not follow a person to a new device. Deliberate for now; the
  shape supports it.
- `HOUSEHOLD` remains a hardcoded two-person constant.
- No streak detection yet.
- Committed/discretionary split still unvalidated against real data.
- Favourites sync still unproven across two devices.
- `icon-512.png` still 309 KB; no UI to re-rate an approximate-FX entry.

### Next recommended task
Streak detection in words over the chosen figure.

---

## 2026-09-13 — Charts

### Goal
Visuals that help read the data, rather than decorate it.

### What was built
- **Trend columns** on the headline card — chosen spend per month with the usual
  level as a reference rule. **Emphasis form**, not categorical: this month in
  the accent, earlier months recessive. Six hues here would bury the one bar the
  reader came for. Per-bar tooltip, and a table twin behind a "Numbers" toggle.
- **Sparklines** on each choice row — six months inline. Single series, so no
  legend: the line is de-emphasis ink and only the end point wears the category
  colour. This answers *"is this creeping up?"*, which a single
  month-versus-average number cannot.

### The colour audit — three real defects
Ran the palette through the validator rather than eyeballing it:

- **Supermarket `#f97316` and Eating Out `#fb923c` measured ΔE 6.5 for *normal*
  vision** (floor is 15). The two largest spending categories rendered as the
  same orange for everyone, not just under CVD. Eating Out re-stepped to
  `#c2410c` → ΔE 15.5.
- **Other and Subscriptions were byte-identical** (`#94a3b8`). Other darkened to
  `#4d566b` → ΔE 25.7.
- **Six group colours cannot clear all-pairs**, and the rows sort by amount so
  adjacency is not fixed. Only **three** slots pass all-pairs. Hence: no stacked
  composition bar — it would have restated the labelled rows *and* introduced a
  colour problem. The rows carry a text label beside every dot, so identity
  never rests on hue.

### The bug only rendering could catch
The first build drew **full-month columns against a same-days baseline** — the
bars and the reference rule measured different things, so the chart asserted a
comparison it had not made. Every column now covers the same slice of its month
(1st through today), matching the headline exactly, labelled "first 13 days of
each month". That also removes the partial-month problem instead of labelling
around it. The rule's label moved above the plot, where it had been colliding
with the tallest column.

### Files changed
New: `src/components/charts/{Sparkline,TrendColumns}.tsx`.
Modified: `src/domain/categories.ts` (two colour fixes),
`src/domain/{choices,choices.test}.ts` (`chosenByMonth`, `span`),
`src/components/Insights.tsx`, `src/components/charts/TrendColumns.tsx`.

### Checks run
- `npm test` — **212 passed** (was 204; +8 on the monthly series)
- `npm run verify:all` — 87 browser checks, all passing
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini, main + sheet
- `validate_palette.js` — 3-slot cap PASSES all-pairs on the dark surface;
  the two re-stepped pairs clear the normal-vision floor
- typecheck and build clean

### Known issues / blockers
- **Category colours beyond the top three rely on their text label.** That is
  legitimate (secondary encoding) but means a colour-only reading of a long
  category list is not dependable. Groups fail the lightness band and the gray
  "Other" fails the chroma floor by design.
- No streak detection yet — the sparkline shows drift, but nothing says "four
  months running" in words.
- Committed/discretionary split still unvalidated against real data.
- Favourites sync still unproven across two devices.
- `icon-512.png` still 309 KB; no UI to re-rate an approximate-FX entry.

### Next recommended task
Streak detection in words over the chosen figure, which the sparklines now make
visible but do not state.

---

## 2026-09-13 — Spending and balance views

### Goal
Two selectable views: spending only (the default and the point of the app) and
balance, a proper budget tracker. The balance side is not a priority now but
should live in the system so it can grow without the app being reshaped later.

### What changed
A `view` setting — `'spending' | 'balance'`, defaulting to spending, stored per
device alongside the owner and capture currency.

**Spending mode ignores income entirely.** Not "hides a line" — the insights
never reference it. That is what makes it a mode rather than a decoration, and
there is a browser check asserting income cannot be found anywhere in the
spending insights.

**Balance mode** adds a card above the spending view: net for the month, in and
out, savings rate against the usual, and six months of paired income/spend bars.
Paired rather than a single net bar, because seeing both at the same scale is
what makes a thin margin obvious. The current month is faded and labelled "so
far" — a month that has had its salary but not yet its rent looks spectacular
until the 1st.

Spending stays underneath in both modes, because it is still the app.

### Bug caught by its own test
`summariseBalance` averaged every completed month in the window, including
months from before the household started logging. Asking for six months with
four of data reported the typical net as £400 instead of £500; asking for twelve
would have reported a third of the truth.

This is the *same* flaw already fixed in the insights baseline, reintroduced in
new code. Now excluded the same way — months entirely before the first entry are
not "a month where they netted nothing", they are months with no data.

### Files changed
New: `src/domain/{balance,balance.test}.ts`, `src/components/Balance.tsx`,
`scripts/verify-views.mjs`.
Modified: `src/hooks/useSettings.ts` (`ViewMode`), `src/components/Settings.tsx`,
`src/components/Insights.tsx` (`showIncome`), `src/App.tsx`,
`scripts/verify-all.mjs`, `package.json`.

### Checks run
- `npm test` — **204 passed** (was 190; +14 on monthly balance)
- `npm run verify:all` — **87 browser checks across 5 suites**, including that
  spending mode leaves income out, that the setting survives a reload, and that
  switching back removes the balance card
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini
- typecheck and build clean; precache 703 KB

### Known issues / blockers
- The balance view is deliberately thin: net, savings rate, six months. No
  budgets, targets or forecasts — the scaffolding is there for those, none of
  it is built.
- Still no trajectory on the spending side (sparklines, streaks).
- Committed/discretionary split leans on recurring detection, still unvalidated
  against real data.
- Favourites sync still unproven across two devices.
- `icon-512.png` still 309 KB; no UI to re-rate an approximate-FX entry.

### Next recommended task
Trajectory on the spending side — sparklines per group and streak detection over
the *chosen* figure. Alternatively, if the balance view turns out to get used,
monthly targets per group would slot straight into it.

---

## 2026-09-13 — Choices, not total spend

### Goal
Push harder on the actual end goal: *know where we're spending more*.

### The reframe
The headline was total spend — £1,830 for the month, most of it rent. That
invites the question "where does the money go?", whose honest answer is "rent,
forever": true, unchanging, and unactionable.

The headline is now **what was chosen**: £480, with £1,350.99 shown separately
as *already spoken for*. Every proportion underneath is a share of the chosen
figure, so Eating Out reads as **88% of what was decided** rather than 23% of
everything. Same data, different denominator, completely different question.

`src/domain/choices.ts` decides what counts as committed from the **actual
entries** — an entry is committed only if it matches a detected, still-active,
committed series. Prorating a modelled monthly commitment would report rent as
partly paid on the 3rd, which is not what happened.

### Also
- **The lever.** Anything meaningfully above its baseline now reads "Back to
  usual would free £398" — the same number as the delta, framed as something
  that can be acted on. Below baseline reads "£55 less than usual".
- **"Where it goes" is period-scoped again** (1M/3M/6M/1Y/All). It had been
  all-time since slice 4, which is 90% rent on day one and gets less useful
  every month. A regression fixed, not a feature.
- A category with nothing spent still appears when its absence is notable
  (fuel: "£55 less than usual" — nobody has filled up yet), but without a 0%
  bar, which was just noise.

### Two process notes
- A Python patch script wrote literal backspace characters where `\b` was
  intended, producing a regex that could never match. Caught because the check
  failed; worth remembering that `\b` in a non-raw Python string is a backspace.
- The range buttons failed the tap-target audit at 32×36, and the first fix was
  to **relax the audit** to a 40px floor. That is motivated reasoning — the
  rule was changed after the design failed it. Reverted; the buttons are 44px.

### Files changed
New: `src/domain/{choices,choices.test}.ts`.
Modified: `src/domain/insights.ts` (`rangeWindow`, `RANGES`, `entryInWindow`),
`src/components/Insights.tsx` (rewritten), `scripts/verify-insights.mjs`.

### Checks run
- `npm test` — **190 passed** (was 170; +20 on the choices split)
- `npm run verify:all` — **72 browser checks**, including that the headline is
  £480 and *not* £1,830, and that obligations never appear among the choices
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini, main + sheet
- typecheck and build clean; precache 698 KB

### Known issues / blockers
- **No trajectory.** "More" still means "more than a six-month average", which
  detects blips, not drift. Sparklines and streak detection ("above average
  four months running") are the natural next step and were the option not
  taken.
- The committed/discretionary split leans entirely on recurring detection,
  which remains unvalidated against real data. If it misses a real bill, that
  bill lands in "choices" and inflates the headline.
- Favourites sync still unproven across two devices.
- `icon-512.png` still 309 KB; no UI to re-rate an approximate-FX entry.

### Next recommended task
Use it for a few weeks, then trajectory — sparklines per group and streak
detection over the *chosen* figure, which is far more informative than a
sparkline including rent, flat by definition.

---

## 2026-09-13 — Settings sheet, delete confirmation, design pass

### Goal
Three requests: move the currency switch into settings and use that place to
manage favourites; make the design more attractive; require confirmation before
a deletion.

### Settings
A bottom sheet behind a gear in the header, holding whose phone this is, the
capture currency, favourite management, Drive status and import. Moving all of
that off the main screen is most of what makes the app feel calmer — the main
screen is now capture, insights and recent entries, nothing else.

**Currency as a setting, not a per-entry toggle**, because that matches how it
is used: the household is in Portugal for a week, not switching between one
coffee and the next. The symbol stays on the amount field — tinted when it is
not GBP — so a forgotten switch is obvious rather than silent, and tapping it
jumps to where it can be changed.

**Favourites split in two.** `FavouriteChips` on the capture screen does one
thing: apply a shortcut in a tap. `FavouriteManager` in settings handles adding,
removing and suggestions. Management clutter has no business sitting between
someone and logging a coffee.

### Delete confirmation
Two-step, inline (`ConfirmButton`): the first tap arms the button, the second
deletes, and it disarms itself after four seconds. `window.confirm` — which v1
used — is a jarring system modal most people dismiss without reading, and it
puts the decision somewhere other than the thing it affects.

### Design
Header with the pixel-M mark and a gear carrying a small sync dot, so sync state
no longer needs a card of its own. Cards gained a hairline top highlight — the
detail that makes a dark surface look lit rather than filled. Better empty state.

### Three bugs found while wiring this up
- **Background controls stayed focusable behind the open sheet**, so it was only
  visually modal. `main` now gets `inert` and `aria-hidden` while it is open.
  Found because the audit reported the backdrop "overlapping" everything.
- **The cancel button showed "No" but was labelled "Cancel"**, so its accessible
  name did not contain its visible text — a WCAG 2.5.3 failure that breaks voice
  control. Now "No, keep it".
- **The sheet's close button was 36×36**, below the 44px minimum.

### Verification scripts
Extracted `scripts/_helpers.mjs`. Import and settings now live behind a sheet,
and repeating that flow in five scripts is how they drift — which already
happened once, when verify-import silently broke for a whole slice.

`audit-layout` now measures the sheet as well as the main screen, and skips the
modal backdrop and anything inside an `inert` subtree — principled exclusions
rather than convenient ones.

One failure along the way was mine: Playwright matches accessible names by
*substring* by default, so `name: 'Settings'` also matched the currency
indicator's "…Change in settings." label.

### Files changed
New: `src/components/Settings.tsx`, `scripts/_helpers.mjs`.
Rewritten: `src/components/Favourites.tsx`, `src/App.tsx`.
Modified: `src/components/{ui,Capture}.tsx`, `src/hooks/useSettings.ts`,
`scripts/{audit-layout,verify-import,verify-insights,verify-capture,verify-favourites}.mjs`.

### Checks run
- `npm test` — **170 passed**
- `npm run verify:all` — **62 browser checks** (was 59; +4 covering the
  two-step delete and settings placement)
- `npm run audit:layout` — clean on iPhone 15 and iPhone 13 Mini, **main screen
  and settings sheet both**
- typecheck and build clean; precache 695 KB

### Known issues / blockers
- The sheet has no focus trap — `inert` on the background handles screen readers
  and tab order in modern browsers, but a full trap would be more robust.
- Favourites still cannot be edited in place, only added and removed.
- Favourites sync remains unproven across two real devices.
- Recurring detection still unvalidated against real data.
- `icon-512.png` still 309 KB; no UI to re-rate an approximate-FX entry.

### Next recommended task
Use it. The remaining items are small, and the useful feedback now is whether
the capture screen feels quicker with management moved out of the way.

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
