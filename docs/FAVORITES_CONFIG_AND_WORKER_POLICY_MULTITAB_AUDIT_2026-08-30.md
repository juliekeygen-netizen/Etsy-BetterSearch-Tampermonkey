# Favorites config and worker-policy multi-tab audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `966a8922f3eff3a15f91c2c7d5601f1b6358d869`.

This document extends `FAVORITES_MULTITAB_AND_DELIVERY_TARGET_AUDIT_2026-08-30.md`. It distinguishes persistence synchronization from live runtime synchronization and records concrete stale-config/lost-update cases.

## 1. Extension storage mirror is cross-tab, live Favorites config is not

`extension/platform-prelude.js` loads extension storage into an in-memory `ebsExtStore` and updates that mirror through `storage.onChanged`.

The shared Favorites runtime then initializes:

```text
favCfg = normalize(GM_getValue(FAV_STORAGE_KEY))
favUiPrefs = normalize(GM_getValue(FAV_UI_PREFS_STORAGE_KEY))
```

Those are long-lived JavaScript objects. There is no shared configuration-change subscription that re-normalizes them when another tab changes the underlying storage value.

Therefore these statements are both true:

```text
extension storage mirror has the newer value
live favCfg/favUiPrefs in an already-loaded tab may still have the older value
```

The distinction matters because feature decisions read the live objects, not `GM_getValue()` every time.

## 2. Whole-object `favCfg` writes can lose another tab's changes

`favSaveConfig()` normalizes the current in-memory object and writes the entire Favorites configuration under one key.

A valid interleaving is:

```text
Tab A loads config revision 10
Tab B loads config revision 10

A changes autoSync=true
A saves whole object -> revision conceptually 11

B still has revision-10 object
B changes sort=price
B saves whole stale object

result:
sort=price
but A's newer autoSync change can be restored to the old value
```

This is not fixed merely because extension `storage.onChanged` updates `ebsExtStore`: B's `favCfg` object is not rebuilt from that mirror before its whole-object save.

The shared Tampermonkey path has the same project-level risk: no `GM_addValueChangeListener` usage exists in the current source tree, while the same whole-object `favSaveConfig()` path is used.

## 3. UI preferences have the same stale whole-object pattern

`src/66-favorites-settings-sort-polish.js` defines one `FAV_UI_PREFS_STORAGE_KEY`, initializes `favUiPrefs` once, and `favSaveUiPrefs()` writes the whole normalized preferences object.

Later layout modules expand the same object with:

- auto-sync interval;
- filter-availability mode;
- filter section order/visibility;
- filter option order/visibility;
- sort menu order/visibility;
- auto-open behavior.

So two tabs editing unrelated preferences can overwrite each other in the same way as `favCfg`.

This is especially easy with the layout editor because it edits several nested arrays and then persists the full preference object.

## 4. Manual deep Cancel is stronger than the auto-scan setting

The cross-page queue deliberately stores manual pause under `FAV_DEEP_MANUAL_PAUSE_KEY0110`.

Before a queue claim or resume, `favDeepPauseStored0110()` calls `GM_getValue()` again. In the extension target this reads the storage mirror that is updated by `storage.onChanged`.

So an explicit Cancel in another extension tab has a reasonable cross-tab propagation path.

`autoScanMissingMetadata` is different. `favDeepResumeExistingQueue0110()` and `favDeepMaybeAutoScan0110()` read:

```text
favCfg.autoScanMissingMetadata
```

from the tab's long-lived configuration object.

Therefore:

```text
Tab A has autoScanMissingMetadata=true in memory
Tab B switches it off and persists config
extension storage/mirror updates
Tab A favCfg can remain true
Tab A can continue treating automatic queue resume as enabled
```

The manual pause key is dynamically consulted; the ordinary configuration flag is not.

## 5. Auto-sync interval and auto-sync enablement can also be stale

Auto-sync policy depends on both:

```text
favCfg.autoSync
favUiPrefs.autoSyncIntervalHours
```

Both are long-lived objects.

A loaded tab can therefore evaluate sync eligibility using stale policy after another tab changes the setting or interval.

The durable catalogue lock may still deduplicate some actual crawling, but stale policy can create unnecessary attempts/UI state and interacts badly with the known non-atomic localStorage fallback lock.

## 6. Required configuration ownership contract

The implementation should choose one explicit model instead of relying on storage side effects.

Recommended minimum contract:

```text
persistent value changes
-> parse + normalize
-> update the existing live object in place where handler references require identity stability
-> classify which runtime policies changed
-> schedule the smallest safe reconcile
```

Examples:

```text
filter/sort change
-> reapply current results

autoSync / interval change
-> update sync scheduler policy

autoScanMissingMetadata change
-> stop future automatic claims/resume when disabled

layout preference change
-> rebuild/reconcile visible controls only
```

For the extension target, the platform prelude already observes storage changes and can expose a shared change event to the concatenated runtime.

For Tampermonkey, use the userscript manager's supported value-change mechanism where available, with a safe fallback for managers that do not expose remote-tab notifications.

## 7. Whole-object write conflict still needs a policy

Live propagation alone narrows but does not eliminate simultaneous-write races.

Options include:

### Option A — per-setting/per-domain keys

Store independent policy groups separately, for example:

```text
favorites.filters
favorites.sync-policy
favorites.deep-policy
favorites.ui-layout
```

This lowers conflict scope significantly.

### Option B — revisioned field-level merge

Persist:

```text
revision
writerId
updatedAt
field/domain revisions
```

and merge from the latest persisted value before committing a change.

### Option C — extension background coordinator

The browser extension can serialize config mutations in its background context, but Tampermonkey still needs an equivalent shared semantic contract. Do not let extension-only coordination make the two delivery targets silently diverge.

## 8. Do not turn every preference into IndexedDB

The v3 Favorites index migration is about catalogue truth and membership generations. User configuration does not need to be mixed into that database merely to solve multi-tab writes.

The important requirement is:

> one canonical config mutation protocol with live change propagation and bounded conflict domains.

## 9. Tests currently missing

Add executable multi-context tests for:

```text
A changes autoSync, B changes sort from stale copy
-> both changes survive

A changes layout order, B changes availability mode
-> both survive

B disables autoScan while A has an automatic worker queued
-> A performs no new automatic claim

B manual-Cancels deep work
-> A sees durable pause before next claim

storage event arrives while settings modal is open
-> controls and live objects converge without recursive save loop
```

Do not call the extension storage layer cross-tab correct merely because `storage.onChanged` updates the raw mirror.

## 10. Priority

This is a P1 runtime-policy issue, with one data-loss aspect: whole-object configuration saves can overwrite unrelated newer settings.

It should be addressed after or alongside the planned atomic data-writer foundation, and before relying on cross-tab automatic worker policy as a correctness boundary.