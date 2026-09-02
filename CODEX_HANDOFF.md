# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** behavior gate ready to publish for independent audit; release identity
remains v0.15.26.

```text
Date: 2026-09-01
Base main SHA: 63c8b6453b443a2f346c20723f6c5da36793a830
Branch: codex/fix-favorites-stable-toolbar-geometry
Behavior head: 7d03cc01c034b7c62178c738156dc41c825a9967
PR: #77 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/77
PR state: OPEN
Validated review head: a3daae98d46792f23040add0e0048de2219c59c2
Release identity: 0.15.26 (intentionally unchanged)
```

## Problem and evidence

A user-provided private Diagnostics capture recorded Favorites route,
collection, filter, and pagination transitions. The raw archive, screenshots,
DOM snapshots, network bodies, and marker notes remain outside the repository.

One production UI issue is both browser-evidenced and source-proven: at an
unchanged desktop viewport, route snapshots measured several toolbar widths
(about 764–804 CSS pixels). The final toolbar owner,
`src/103-favorites-v0157-diagnostics-fixes.js`, reduced its inline search
width by the current route's title/control width. This matches the reported
All-versus-collection Search width shift.

The same reconciliation found a Diagnostics false-positive marker for a valid
native empty collection, not a missing-grid product failure. It also recorded
a report of startup drawer flicker, but current source already has a final
drawer-state reassertion in module 104 and the capture does not prove an
incorrect settled state. Neither received speculative production changes.

Sanitized evidence and the follow-up order are in
`docs/FAVORITES_DIAGNOSTIC_RECONCILIATION_2026-09-01.md`.

## Changes made

```text
src/103-favorites-v0157-diagnostics-fixes.js
  Final desktop toolbar plan uses a canonical width per header width; if a
  title/control area cannot accommodate it, it selects the existing stacked
  layout rather than shrinking Search for that route.

tests/favorites-v0157-diagnostics-fixes.test.mjs
  Proves fitting title widths get identical geometry and a non-fitting title
  stacks rather than producing a route-specific reduced width.

docs/FAVORITES_DIAGNOSTIC_RECONCILIATION_2026-09-01.md
  Sanitized capture reconciliation; no private diagnostic material tracked.

PROJECT_STATE.md / ACTIVE_WORK.md
  Records the current merged baseline and the Diagnostics-guided work order.
```

Module 103 remains the final toolbar owner; no load-order change was made.
Earlier toolbar modules and their historical constants were deliberately left
untouched.

## Invariants checked

- UI responsiveness: a non-fitting title stacks, avoiding overlap.
- Rendering/ownership: only the final toolbar planner changes; native/local
  grid, pager, route, and filter-state ownership are untouched.
- Lifecycle: no observer, timer, or persistent-state behavior changed.
- Diagnostics privacy: raw private capture data is not committed.

## Local validation

```text
npx --yes --package=node@22 node --test tests/favorites-v0157-diagnostics-fixes.test.mjs
PASS — 10/10 tests

npx --yes --package=node@22 node scripts/check.mjs
PASS — 125 files, 90 userscript modules, v0.15.26 cache-busters

npx --yes --package=node@22 node --test tests/*.test.mjs
PASS — 566/566 tests

npx --yes --package=node@22 node scripts/build.mjs
PASS — Chrome, Firefox, Diagnostics Chrome

git diff --check
PASS
```

Native `npm run ci` was not used because the repository's current Node 26
runtime is incompatible with its VM fixtures; the documented Node 22 commands
above are the exact successful validation environment.

## Artifact audit

Built Chrome and Firefox `content.js` artifacts were inspected after the build.
Both contain module 103's `FAV_TOOLBAR_STABLE_MAX_RATIO01526` and final
`favToolbarPlan0157` implementation, with the canonical cap and stack check.
Diagnostics Chrome builds separately at its independent 0.2.9 identity.

## GitHub CI and PR

```text
PR: #77 (OPEN)
Workflow: CI and extension builds
Run ID: 33523301062
Exact head tested: a3daae98d46792f23040add0e0048de2219c59c2
State: COMPLETED
Conclusion: SUCCESS
```

The successful workflow included repository checks, the complete Node suite,
Chrome/Firefox/Diagnostics builds, and artifact uploads.

## Manual browser testing still needed

At the same desktop viewport, compare Favorites All and several collections:

- routes with adequate title space should retain the same inline Search width;
- a long title/control combination should stack cleanly with no overlap;
- resize through the inline/stack threshold and back;
- confirm Search, Sort, settings, and keyboard focus still work;
- repeat on Chrome extension, Firefox extension, and Tampermonkey as practical.

## Known limitations and reviewer focus

The 0.68 canonical desktop cap is selected to preserve the narrowest
capture-proven desktop geometry while eliminating route-specific intermediate
widths. It has not yet received live Etsy visual testing across every browser
and localization. Review the inline/stack boundary, transform alignment in the
same final module, and whether the fixed cap appropriately preserves the
existing visual contract.

The reported startup drawer flicker and valid-empty-state Diagnostics false
positive are deliberately deferred to separate evidence/fix work.

## Recommended next action

**AUDIT PR BEFORE MERGE.** Do not release-promote or merge this behavior gate
until it has independent code review and manual desktop route/resize testing.

While it waits, start from clean `main` on the Diagnostics-only empty-native-
state false-positive predicate. Do not mix that instrumentation fix into this
production toolbar PR.
