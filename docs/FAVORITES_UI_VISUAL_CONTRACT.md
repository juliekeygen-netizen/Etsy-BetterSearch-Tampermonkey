# Favorites UI visual contract

Baseline: v0.12.15, frozen for the v0.13 architecture/performance refactor.

This document defines the current Favorites UI as an acceptance contract. Refactors to routing, caching, IndexedDB, synchronization, observers, startup, and catalogue ownership must preserve this behavior unless a later change is explicitly requested and approved.

## General rules

- Do not redesign the Favorites shell as part of architecture/performance work.
- All and collection pages must keep the current Etsy-native visual language and spacing.
- Responsive behavior must continue to work across wide desktop, narrow desktop, tablet, and phone widths.
- Sort, Settings, Search, the collection strip, the permanent filter rail, and metadata rows must not jump, overlap, flash, or change dimensions merely because data is being hydrated/refreshed.
- Search geometry is the v0.12.15 baseline: All and collection pages share the same Search width/track math and right-edge alignment at the same viewport/zoom.
- Search keeps the thin 1px neutral outline from v0.12.15.
- Typing into Search must not shift the toolbar horizontally.

## Desktop All

The generated All header deliberately mirrors Etsy's real collection header structure.

Visible structure:

```text
[ collection strip: All | + | real collections ... ]

All                                  [ Sort ] [ Settings ] [ Search ... ]
Private collection | N favorites · M shown

[ product grid ]
```

Requirements:

- `All` uses Etsy's collection title typography and baseline.
- All retains invisible, non-interactive edit/+ geometry twins so its title/toolbar dimensions remain identical to a real collection header.
- The invisible geometry must never be focusable, clickable, or visible.
- The complete metadata wording is always used: `Private collection | N favorites · M shown`.
- No compact `Private | N · M` mode may return.
- The metadata row remains below the title/toolbar row.

## Desktop collection

Visible structure remains Etsy-native:

```text
[ collection strip: All | + | real collections ... ]

Collection title [edit] [+]            [ Sort ] [ Settings ] [ Search ... ]
Public/Private collection | N favorites · M shown

[ product grid ]
```

Requirements:

- Native collection edit/+ controls remain real Etsy controls.
- BetterSearch must not replace their behavior.
- Sort width remains the measured baseline width from the final v0.12.15 geometry.
- Search remains within the listing/content right boundary.
- The collection toolbar and All toolbar align to the same right edge.

## Tablet / narrow desktop

- Title/metadata and toolbar use the current responsive arrangement from modules 96-98.
- Sort remains usable and does not consume arbitrary extra width.
- Settings keeps its fixed icon-button width.
- Search consumes remaining available width without overlapping neighbors or escaping the content margin.
- The permanent desktop rail follows the existing breakpoint behavior; this refactor must not change that breakpoint.

## Phone / very narrow width

- The current v0.12.15 stacked/native-style header remains unchanged.
- The complete Public/Private collection metadata wording remains visible in its own row.
- Filter / Sort / Settings / Search remain usable without overlap.
- Collection strip remains horizontally draggable without native text/link dragging.

## Loading/progress

- `Loading favorites…` / related progress must not insert an extra row above the title.
- Progress remains aligned to the far right of the metadata baseline, out of document flow, as implemented before this refactor.
- Data/cache work must not cause the header or toolbar to flash/rebuild visibly.

## Pagination

- Etsy owns the native pagination DOM.
- BetterSearch must not recreate, clone, move, or structurally rewrite Etsy's pager as part of this refactor.
- Existing 20-item local page behavior must not regress while route/cache work is implemented.

## Regression expectation

Any refactor PR touching Favorites routing, data, cache, sync, startup, or lifecycle must run the visual-contract regression test and the existing responsive/native-boundary tests. Architecture changes are not considered successful if they improve performance while regressing this UI contract.
