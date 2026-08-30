# Favorites v0.15.16 rail geometry idempotence

Date: 2026-08-30

## Scope

This Phase 2F pass targets a source-proven presentation hot path in the stable Favorites rail portal. It does not change rail ownership, sidebar suppression, filter behavior, render ownership, count authority, durable data, or lifecycle-observer semantics.

No private listing IDs, titles, account identifiers, query text, or diagnostic notes are recorded here.

## Source-proven issue

`src/87a-favorites-stable-rail-ownership.js::favSyncRailPortalGeometry0155()` is scheduled from:

- window scroll;
- window resize;
- the native-sidebar `ResizeObserver`;
- rail-slot installation;
- permanent-rail installation and shell repair.

Before this pass, every accepted geometry frame wrote all five owned inline values unconditionally:

- `left`;
- `top`;
- `width`;
- `max-width`;
- `--ebsf-native-sidebar-width`.

A stable rect therefore produced five same-value inline style writes on every scheduled frame. During vertical scroll, where only the native sidebar's viewport `top` normally changes, width/left values were still rewritten as well.

These are style/attribute mutations rather than child-list mutations, so this was not a recurrence of the v0.15.13 runtime feedback bug. It was nevertheless unnecessary hot-path DOM work and directly contradicted the compare-before-write rule established by the mutation/idempotence audits.

## v0.15.16 resolution

The fix remains in the original stable-rail owner. No later patch module, observer, timer, or alternate geometry owner is added.

A small compare-before-write helper now checks the current inline property value before calling `style.setProperty()`.

The measured sidebar rect is applied through one idempotent function. Geometry formulas and pixel values are unchanged.

The scheduler still:

- coalesces to one pending `requestAnimationFrame`;
- clears its frame token at geometry-frame entry;
- measures the current native sidebar rect;
- rejects disconnected/non-desktop/non-Favorites/invalid-width states exactly as before.

ResizeObserver setup, teardown cancellation/disconnection, body-level portal ownership, native sidebar layout preservation, and mobile release behavior are unchanged.

## Executable regression coverage

The existing `tests/favorites-v0155-stable-rail-ownership.test.mjs` harness now executes the geometry writer against a style object that counts writes.

It verifies:

- first valid rect: exactly 5 writes;
- identical second rect: exactly 0 writes;
- vertical-only rect change: exactly 1 write (`top`);
- width-only rect change: exactly 3 writes (`width`, `max-width`, custom sidebar-width variable).

Existing tests continue to assert:

- BetterSearch never reparents Etsy sidebar children;
- the rail lives in a body-level BetterSearch portal;
- the native sidebar preserves its layout footprint;
- rail refresh preserves the permanent root identity;
- the final shell observer ignores portal churn;
- teardown never restores or moves Etsy-owned sidebar children.

The exact behavior-only head passed repository checks, the full test suite, Chrome, Firefox, Diagnostics Chrome, and all artifact uploads before release identity was promoted.

## Deferred geometry audit

`src/97-favorites-all-native-header.js::favSharedToolbarGeometry0134()` still contains direct same-value custom-property writes for shared Sort/Search widths on older resize/font/shell callbacks. Module 103's later exact geometry owner is already guarded, but the older asynchronous writer remains a separate source-proven no-op path.

That path has no correctness dependency on the rail portal and should receive its own behavior gate rather than expanding this release after the rail behavior gate is green.
