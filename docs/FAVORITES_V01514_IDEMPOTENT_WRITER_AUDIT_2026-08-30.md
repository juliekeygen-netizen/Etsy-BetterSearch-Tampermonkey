# Favorites v0.15.14 idempotent-writer audit

Date: 2026-08-30

## Scope

This pass follows the v0.15.13 runtime-mutation quiescence work. v0.15.13 stopped the sole Favorites runtime body observer from treating mutations wholly inside BetterSearch-owned presentation surfaces as native lifecycle signals. The remaining question was whether BetterSearch still performs no-op child-list mutations inside Etsy-owned DOM, where the observer must remain sensitive.

No private listing IDs, titles, account identifiers, query text, or diagnostic notes are recorded here.

## Source-proven remaining feedback path

The historical page-shell collection-header writer in `src/86-favorites-page-shell.js` rebuilt the native collection metadata subtree on every reconcile with `meta.replaceChildren()`. The later metadata layer in `src/91-favorites-triple-audit-hardening.js` then removed and recreated the privacy-label text node.

Those writes occur inside Etsy's native collection header, not inside a BetterSearch-owned portal. They therefore remain legitimate lifecycle signals to the v0.15.13 runtime observer and can create a narrower reconcile -> native-header child mutation -> lifecycle reconcile feedback path.

## v0.15.14 resolution

The existing final integration module, `src/103-favorites-v0157-diagnostics-fixes.js`, now owns persistent header/progress reconciliation. No new production module or observer was added.

The final `favUpdateScopeHeader0120()` no longer delegates to the historical destructive collection-header updater. Instead it dispatches directly to final All/collection metadata writers.

The final metadata writers:

- preserve Etsy's existing native collection metadata subtree;
- preserve the existing privacy-label text node when possible;
- change its `nodeValue` only when the semantic label changes;
- remove duplicate historical text nodes once, then become quiescent;
- compare All/collection count text before writing;
- keep the full `N favorites · M shown` wording invariant;
- keep the final count source in `favScopeCounts0120()` unchanged.

Progress reconciliation now compares status text and the progress-position custom properties before writing. Final toolbar custom-property and ownership-marker writes touched by module 103 also use compare-before-write behavior.

## Regression coverage

`tests/favorites-v01514-idempotent-writers.test.mjs` executes the final label helper with mutation counters and verifies:

- repeated identical privacy reconciliation performs zero append/remove/text-value writes;
- a real label change updates only the existing text node;
- duplicate legacy text is repaired once and the second pass is quiescent;
- an unchanged CSS custom property does not call `setProperty()`;
- the final scope-header owner does not call the historical destructive updater;
- the final collection writer contains no `replaceChildren()` path;
- progress and final toolbar custom properties use compare-before-write helpers.

The first behavior CI run failed only because an older v0.15.7 test fixture sliced too much of module 103 after the new runtime-bound writer block was inserted. All new v0.15.14 tests passed in that run. The fixture was narrowed back to the genuinely pure helper prefix and its raw `removeProperty()` assertion was updated for the guarded removal helper. The corrected exact behavior head passed repository checks, all tests, Chrome, Firefox, Diagnostics Chrome, and all artifact uploads before release promotion.

## Audit findings deliberately deferred

These findings are not part of the v0.15.14 release boundary and require their own behavior gates.

### Count authority fail-closed inputs

`src/104-favorites-v0157-filter-state-sync.js` currently converts raw count fields with `Number(props[field])`. JSON `null` therefore converts to numeric zero and can be mistaken for an authoritative Etsy zero. Empty strings and booleans have similar coercion risk. A follow-up should require an explicitly numeric, finite, non-negative integer count and reject null/undefined/blank/boolean inputs before conversion.

The same module currently accepts a complete BetterSearch dataset count when the computed current dataset key is empty (`!currentKey || loadKey === currentKey`). A follow-up should fail closed when current identity is unavailable instead of treating an unkeyed complete dataset as current.

### Lower-priority geometry writes

The stable rail portal still writes its left/top/width/max-width/custom-width geometry on scheduled geometry frames without first comparing the current inline value. Those are attribute/style mutations rather than child-list mutations, so they do not recreate the v0.15.13 runtime feedback path, but they remain a candidate for a later no-op/performance pass.

The historical shared-toolbar geometry layer also contains older direct custom-property writes. Module 103's final exact geometry owner is guarded, but a later cleanup can make the older asynchronous geometry helper itself idempotent rather than relying on the final writer to settle the same values.

## Invariants retained

- Etsy owns native grid and native pager in native mode.
- BetterSearch local grid/pager ownership still requires the v0.15.12 signed atomic render transaction.
- Native page identity and BetterSearch local-result page identity remain separate.
- v0.15.11 count provenance remains the source of total-count semantics.
- v0.15.13 keeps one semantic runtime body observer; v0.15.14 adds none.
- The rail remains outside Etsy ownership in its body-level BetterSearch portal.
- Teardown does not reparent Etsy-owned sidebar children.
