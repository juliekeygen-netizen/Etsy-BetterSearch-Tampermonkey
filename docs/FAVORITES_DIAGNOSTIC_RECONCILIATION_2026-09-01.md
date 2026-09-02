# Favorites Diagnostics Reconciliation — 2026-09-01

## Scope and privacy

This reconciliation used a user-provided local Diagnostics archive captured on
2026-09-01. The archive was extracted outside the repository and is not
tracked. It contains private browsing and account-adjacent data, so this
document records only sanitized conclusions, timing classes, and aggregate
counts. Do not add the archive, response bodies, screenshots, URLs, listing
data, profile identifiers, query text, or marker notes to version control.

The capture covers several Favorites route, collection, filter, and pagination
transitions over roughly five minutes. It contained no captured HTTP error and
no populated uncaught-exception record. Those observations do not prove that
the UI was correct; the capture includes visual/layout evidence that exposed
the issues below.

## User-marked observations and reconciliation

| Observation | Current conclusion | Evidence and disposition |
| --- | --- | --- |
| Desktop search/sort toolbar flashes and changes width between All and collection routes. | **Confirmed.** | At one unchanged desktop viewport, successive route snapshots measured multiple toolbar widths (approximately 764–804 CSS pixels). Final module `103-favorites-v0157-diagnostics-fixes.js` derived search width from the route-specific title/control width. This behavior gate changes that final owner to use a canonical desktop toolbar width and stack if it cannot fit. |
| Filter/category rail appears to open briefly and then close during startup. | **Browser-evidenced, root cause not yet proven.** | The capture shows short lifecycle/remount windows, but does not establish an incorrect settled ARIA/open state. The final module 104 already reasserts persisted drawer state after the earlier drawer builder. Do not add another competing drawer wrapper without a focused reproduction that captures before/after state and route generation. |
| Diagnostics automatically reported that no grid was visible on an empty collection. | **Confirmed Diagnostics false positive, not a product grid failure.** | The paired DOM/screenshot state is Etsy's normal empty-collection presentation. The automatic marker currently equates missing listing grids with failure. A separate Diagnostics-only change should recognize a valid native empty state before emitting that marker. |
| General loading flashes/weirdness during navigation. | **Partly explained; keep under observation.** | The toolbar geometry issue is source- and capture-proven. The remaining report spans normal full route transitions and needs a narrowed, repeatable capture before a source change can be justified. |

## Toolbar behavior gate

The final toolbar planner in module 103 previously took the minimum of a
canonical desired width and the remaining space after the route-specific title
area. That produced a different inline search width for each collection name
and title-control combination.

The corrected planner computes one desktop toolbar width from the header width.
It keeps that width when it fits; when a route leaves insufficient room, it
uses the established stacked layout. This keeps the visual contract responsive
and prevents title/control overlap without route-specific intermediate widths.

Regression coverage proves both sides of the boundary:

- two title widths that can fit receive identical desktop toolbar geometry;
- a larger title width stacks instead of shrinking the canonical toolbar.

The patch is intentionally limited to the final module 103 planner. It does
not change earlier historical toolbar owners, persisted filter state, route
ownership, native grid ownership, or release identity.

## Follow-up order

1. Review and manually test the stable-toolbar behavior gate at desktop widths
   around the inline/stack threshold, on All and several collection routes.
2. From clean `main`, make a Diagnostics-only false-positive fix for valid
   native empty states, with fixture coverage for the marker predicate.
3. Gather a focused startup rail capture if the apparent open/close flicker
   persists after the toolbar change. Include the initial and settled drawer
   attributes plus route/view generation; only then decide whether a production
   lifecycle patch is warranted.
