# Favorites audit index — Chunk 7 addendum

Date: 2026-08-30

This addendum extends the existing Favorites audit index without rewriting the larger canonical status document.

## Chunk 7 entrypoint

Start with:

- `FAVORITES_AUDIT_CHUNK7_2026-08-30.md`

Focused documents:

- `FAVORITES_ACCESSIBILITY_FOCUS_OWNERSHIP_AUDIT_2026-08-30.md`
- `FAVORITES_ROUTE_TEARDOWN_RESOURCE_LIFETIME_AUDIT_2026-08-30.md`
- `FAVORITES_ACCESSIBILITY_LIFECYCLE_TEST_MATRIX_2026-08-30.md`
- `FAVORITES_RELEASE_IMPLEMENTATION_SEQUENCE_2026-08-30.md`

## New source-proven/high-confidence items

1. Whole desktop rail replacement has no semantic focus preservation.
2. Section-body `replaceChildren()` can destroy the focused filter control.
3. Local grid full replacement can destroy a focused card during background/metadata reapply.
4. Local pager activation rebuilds the button group without a keyboard focus destination.
5. Module-101 hydration can replace a focused/working local card and unrelated matching local cards.
6. Current mobile Filters path has weaker modal focus handling than Settings.
7. Layout editor/context/reorder behavior needs a keyboard-equivalent path.
8. Favorites route exit has no single teardown for every body-level surface/resource.
9. Recreated Sort roots can leave hidden `data-ebsf-orphaned` portals in `document.body`.
10. Some observer/target references are bounded but remain alive until later rebind/page unload because route teardown does not own them.

## Positive patterns to reuse

- module-101 hydration stop helper;
- module-91 listener cleanup for collection scroller;
- bounded collection-creation observer;
- current filter disclosure ARIA + reduced-motion handling;
- Settings normal focus trap/return behavior;
- rename dialog focus entry/return behavior.

## Implementation readiness

The audit is now sufficient to begin production work. The recommended bounded sequence is documented in `FAVORITES_RELEASE_IMPLEMENTATION_SEQUENCE_2026-08-30.md`.

Immediate first runtime patch recommended:

```text
A1 — exclude BetterSearch local pagination from every module-95a native pager discovery/click-intent path, with a two-simultaneous-pager integration test.
```

Then proceed through owner/snapshot generation correctness before the larger lifecycle/render consolidation.

## Next validation work

Future auditing should be targeted to implementation PRs and fresh browser proof rather than broad source exploration. The lifecycle release specifically requires fresh sanitized Diagnostics aggregates to verify that mutation/rail-generation/geometry churn materially falls from the existing baseline.