# Favorites v0.15.18 multi-tab settings ownership — 2026-08-30

Status: release implementation record resolving the P1 lost-update cases documented in `FAVORITES_CONFIG_AND_WORKER_POLICY_MULTITAB_AUDIT_2026-08-30.md`.

## Problem resolved

Before v0.15.18, Favorites configuration and UI preferences were long-lived tab-local objects persisted through whole-object writes:

- `etsy-bettersearch.favorites.config.v1`
- `etsy-bettersearch.favorites.ui-prefs.v1`

Two tabs could load the same old object, change unrelated fields, and then overwrite one another. Raw extension storage propagation did not fix this because runtime policy read `favCfg` / `favUiPrefs`, and Tampermonkey had no shared value-change listener in the userscript contract.

## Canonical ownership model

v0.15.18 adds the early owner `src/66a-favorites-multitab-config.js`, immediately after the base Favorites settings module.

Each normalized leaf is now independently canonical under a field key derived from its aggregate key. The historical aggregate values remain compatibility mirrors for older BetterSearch versions, but fixed versions overlay canonical leaves before using the aggregate.

A save now performs:

1. normalize the live object;
2. classify only leaves changed relative to this tab's last canonical snapshot as local intent;
3. re-read the latest canonical leaf set;
4. apply only the local dirty leaves to that latest set;
5. normalize the merged state;
6. persist changed leaves plus any normalization corrections;
7. update the existing live object in place;
8. refresh the aggregate compatibility mirror.

Therefore delayed remote notifications do not allow stale unrelated fields to be written back.

## Correlated-setting convergence

Independent leaf keys do not bypass object-level invariants. The storage owner converges the complete normalized state back to canonical leaves after load, local save, and remote updates.

The historical Strict/Multi rule is explicitly preserved as a storage invariant: if independently persisted leaves would make both true, Multi wins and the canonical Strict leaf is corrected to false.

The same convergence mechanism handles derived UI-preference relationships such as `filterAvailabilityMode` and the legacy `hideUnavailableCatalogFilters` compatibility field.

## Live cross-tab propagation

Remote canonical-leaf changes mutate the existing `favCfg` / `favUiPrefs` objects in place. In particular, `favCfg.filters` retains its object identity so already-mounted control handlers do not retain stale nested references.

Remote changes are classified and coalesced into the smallest safe runtime reconcile:

- filter/render changes reapply current results;
- sort changes update/rebuild Sort UI;
- layout-preference changes refresh the visible rail/layout editor;
- open Settings controls converge to remote values;
- auto-sync / deep-auto-scan policy changes update the live policy objects without forcing a result render.

No remote listener calls the save helper recursively.

## Delivery-target parity

Tampermonkey now grants `GM_addValueChangeListener`.

The extension platform prelude now exposes a compatible `GM_addValueChangeListener` surface over `browser.storage.local` / `chrome.storage.local`. It tracks local pending writes so storage echoes from the current tab are dispatched with `remote=false`, while another tab's change is dispatched with `remote=true`.

This keeps one shared persistence/runtime contract across userscript, Chrome extension, and Firefox extension targets.

## Migration and mixed-version behavior

On the first fixed-version load, missing canonical leaves are seeded from the normalized legacy aggregate. Existing leaf keys always take precedence over the aggregate.

This means an older BetterSearch tab may still rewrite the legacy aggregate, but it cannot erase canonical leaf state already created by v0.15.18. A later fixed tab overlays the leaf keys again.

Later modules that expand the UI-preference schema are also covered: when a newly exposed field is first seen, an existing canonical leaf wins; otherwise the new field is seeded once from the normalized live schema.

## Executable regression coverage

The v0.15.18 tests cover:

- stale Tab A changes auto-sync while stale Tab B changes Sort with remote delivery paused: both survive;
- Strict and Multi changed independently: canonical storage converges to the historical invariant;
- remote filter changes update live config and nested filter objects in place;
- remote auto-scan disable reaches the live worker-policy object;
- stale layout-order and availability-mode changes both survive;
- derived UI-preference leaves are corrected in canonical storage;
- late UI-preference schema expansion overlays existing canonical leaves before seeding;
- missing-value detection still works if a userscript manager clones fallback objects;
- the real extension platform prelude distinguishes local storage echo from a remote-tab change.

## Scope

This release changes user configuration / UI-preference persistence only. It does not alter Favorites catalogue membership, IndexedDB generations, native/local pager ownership, or result rendering ownership.
