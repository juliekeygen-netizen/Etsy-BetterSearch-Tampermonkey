# Favorites Diagnostics Handoff Audit — 2026-09-02

## Scope and privacy

This audit used user-provided local Diagnostics archives, marker notes, and
30fps image-frame exports. Those private materials remain outside Git. This
document records only source-proven behavior and sanitized timing classes; do
not commit raw archives, screenshots, URLs, listing data, account identifiers,
or marker-note text.

## Confirmed diagnostics delivery defects

The rapid-capture controls were durable but visually stale after **Record &
Reload**: the fresh panel retained unchecked markup defaults even when the
resumed session options were true. In addition, the final streaming exporter
did not serialize retained `frame-trace` or `marker-burst-screenshot` events.

PR #79 fixed both paths without changing production Favorites behavior:

- the replacement panel rehydrates every durable checkbox option;
- traces export as `timeline/frame-traces.ndjson`;
- valid burst screenshots export below their marker directory; and
- the archive summary includes the two event-family counts.

The repaired Diagnostics build is required for the next targeted capture. A
30fps video can establish visual states persisting for at least one captured
frame, but it cannot prove or disprove a 1–7ms transient visible only at a
higher display refresh rate. The opt-in animation-frame trace provides the
needed layout/card samples at the browser frame cadence.

## Collection transition: confirmed boundary, no speculative production fix

The final production collection-strip owner is
`src/94-favorites-native-boundary.js`. Its normal primary-click handler:

1. prevents the copied collection pill's default event;
2. stops propagation; and
3. calls `location.assign(link.href)`.

Therefore a collection selection creates a new document. The captured sequence
of native Etsy shell/grid followed by BetterSearch rail, strip, toolbar, and
local-grid installation is an expected consequence of that route boundary, not
an extra Diagnostics-induced mutation.

Do not replace it with `history.pushState` or an ad-hoc fetched DOM swap.
Favorites ownership requires Etsy's native route/grid/pager to be proven
current before BetterSearch can take local ownership. A fake soft navigation
could retain the old collection's native state under the new URL, violating
route, collection-model, and grid-currentness invariants.

## Still-open questions

- Whether allowing Etsy's own native navigation path (rather than forced
  `location.assign`) performs a correct soft navigation for copied collection
  pills is browser behavior that source alone cannot establish.
- The report that collection selectors are absent needs a semantic assertion:
  capture the expected collection-pill count and the final rendered count after
  the native route settles.
- Ships-from/filter interactions showed short native/local grid ownership
  handoffs in the old capture. The old 30fps frames do not establish the
  individual geometry writes or a final incorrect state.

## Focused repeat capture protocol

Use the repaired Diagnostics build and enable:

- Full network/HAR, Marker DOM snapshots, User interactions, DOM lifecycle,
  Marker screenshots, Console/errors, and Automatic problem markers;
- Fast layout/frame trace, Problem screenshot burst, and Semantic mismatch
  markers; and
- Response bodies only when the relevant route response is needed; avoid
  Static/media bodies for this focused UI run.

For each collection switch, mark immediately before activation and again after
the settled result. Record whether the strip should have a particular number
of collection pills, whether the active pill is correct, and whether any old
collection cards remain. For Ships from, mark before selection, immediately
after selection, and when the final product set settles. This supplies
per-animation-frame rectangles, visible-card fingerprints, and bounded burst
screenshots without committing private data.
