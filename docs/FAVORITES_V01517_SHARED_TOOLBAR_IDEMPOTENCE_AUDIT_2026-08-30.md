# Favorites v0.15.17 shared-toolbar geometry idempotence audit — 2026-08-30

Status: release audit for the module-97 shared Sort/Search geometry writer.

## Source-proven issue

`src/97-favorites-all-native-header.js::favSharedToolbarGeometry0134()` is reachable from shell repair, resize and font-ready callbacks. Before v0.15.17 it unconditionally rewrote these presentation-only CSS custom properties whenever it ran:

- `--ebsf-shared-sort-width0134` on `document.documentElement`;
- `--ebsf-narrow-sort-width` on the toolbar row;
- `--ebsf-shared-search-width0134` on the toolbar row.

On narrow layouts it also called `removeProperty('--ebsf-shared-search-width0134')` even when the property was already absent.

This was not a child-list ownership bug, but it violated the compare-before-write rule established by the Favorites diagnostics work and could cause avoidable style mutations/layout invalidation during repeated lifecycle callbacks.

## v0.15.17 fix

The original module-97 owner now uses small compare-before-write helpers for those custom properties. Geometry formulas, breakpoints, Sort measurement and Search-width calculation are unchanged.

The behavior gate includes executable style-write counters proving:

1. first desktop reconcile writes the three owned shared properties;
2. an identical second reconcile writes nothing;
3. changing only toolbar-row width writes only the derived Search width;
4. narrow-layout cleanup removes the desktop Search width once and then becomes a no-op.

## Scope deliberately not expanded

This release does not rewrite the historical module-96 cleanup chain or module-98 X-alignment algorithm. Late ownership has changed since the original geometry audit, and current source does not justify changing those paths as part of this narrow release without separate browser evidence.

The next higher-priority correctness audit is cross-tab Favorites config/UI-preference persistence. Current source shows whole-object tab-local writes and requires a dedicated stale-overwrite/generation audit before further geometry micro-optimizations.
