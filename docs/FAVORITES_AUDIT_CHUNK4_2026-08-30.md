# Favorites audit chunk 4 — runtime policy, metadata context, deep worker lifecycle and pager identity

Date: 2026-08-30

Production baseline audited: BetterSearch v0.15.1, `main` at `966a8922f3eff3a15f91c2c7d5601f1b6358d869`.

Status: source audit / design evidence only. No production behavior changes are included in this audit package.

## Executive summary

After the count/owner/query/IndexedDB work in audit chunk 3, this pass followed the remaining generation assumptions downstream into runtime policy and UI state.

The main findings are:

1. Extension storage is cross-tab mirrored, but live `favCfg` / `favUiPrefs` objects are not automatically refreshed from another tab's changes.
2. Whole-object config and UI-preference saves can overwrite unrelated newer changes from another tab.
3. Automatic deep-worker policy reads stale in-memory config, while manual deep Cancel uses a dynamically read durable key. These two policies therefore have different cross-tab guarantees.
4. Destination-sensitive auxiliary metadata has a missing context-generation stale-response guard. A late response from destination A can apply after destination B became current as long as the Favorites dataset itself did not change.
5. Metadata coverage can be unresolved for the active destination while local filtering/sorting still consumes stale live values.
6. Global deep metadata job identity is reasonable, but queued-job retirement on unfavorite is tied to the old global favorite model. After owner-specific membership is fixed, one owner's unfavorite must not retire work still useful to another owner.
7. `pagehide` is treated as proof that a deep worker ended. BFCache can fire `pagehide` for a document that may later return, so `event.persisted` must be part of the worker-death optimization.
8. The v0.15.1 local/native pager semantic alias remains live on current `main`: module 95 correctly marks/excludes local pagination, while module 95a still discovers native pagers by aria-label alone.

These do not replace the chunk-3 P0 data-integrity work. They refine the boundaries that later runtime/render releases must use.

---

## 1. Persistence synchronization is not runtime synchronization

The extension prelude maintains an up-to-date mirror of extension storage through `storage.onChanged`.

That does not mean a loaded BetterSearch runtime uses the newest values.

Favorites initializes long-lived objects:

```text
favCfg
favUiPrefs
```

from `GM_getValue()` and then mutates them locally.

No shared listener updates those objects when another tab changes the underlying values.

This distinction explains how two tabs can both have access to the same persistent storage while still making policy decisions from different configurations.

See `FAVORITES_CONFIG_AND_WORKER_POLICY_MULTITAB_AUDIT_2026-08-30.md`.

---

## 2. Whole-object settings writes create a lost-update race

Both main Favorites config and UI preferences are written as whole objects.

Example:

```text
A and B load same config
A changes autoSync and writes
B changes sort from its stale copy and writes
B's full stale object can restore A's previous autoSync value
```

The same applies to layout preferences because order/visibility arrays and sync preferences share one `favUiPrefs` object.

Future configuration work needs both:

- live propagation;
- a conflict/merge protocol or smaller independent persistence domains.

---

## 3. Manual pause and automatic worker policy currently have unequal guarantees

Manual deep Cancel is stored separately and dynamically checked with `GM_getValue()` before future queue claims/resume.

`autoScanMissingMetadata` is read from the tab-local `favCfg` object.

So one tab can successfully publish a manual pause that another extension tab observes quickly, while switching automatic scanning off in Settings does not have the same guarantee for already-loaded tabs.

This is a policy ownership inconsistency, not merely a stale checkbox problem.

---

## 4. Metadata needs its own semantic context generation

Auxiliary metadata requests are already keyed by destination context when deduplicating requests.

But after the network await, stale-response rejection checks only Favorites dataset identity.

If destination context changes without dataset change:

```text
request A starts
context B becomes current
request B finishes
request A finishes later
A still passes dataset-only stale guard
```

A can then mutate live records and persistence with old-context data.

Because filtering/sorting consumes live record values directly, this can affect visible results rather than merely causing another later request.

See `FAVORITES_METADATA_CONTEXT_GENERATION_AUDIT_2026-08-30.md`.

---

## 5. Metadata coverage currently conflates "no deep job pending" with "complete"

The coordinator reports:

```text
unresolved
pending = deepQueued
complete = !deepQueued
```

That leaves room for auxiliary values to be unresolved for the current destination while `complete` is true.

Future code should expose distinct concepts:

```text
resolved
unresolved
pending
context generation
render-safe state
```

The immediate bug fix remains rejecting stale context before it mutates records; the naming/coverage cleanup prevents later callers from repeating the same mistake.

---

## 6. Deep metadata job identity and membership interest must be separated

A global `listing:<id>` metadata job can efficiently serve multiple owners/scopes.

But direct unfavorite currently retires a queued job globally.

After v3 fixes owner-specific Favorites membership, retirement must answer:

```text
Does any active verified membership/current requirement still need this metadata?
```

not:

```text
Did this one owner just unfavorite the listing?
```

The queue can remain globally deduplicated while maintaining owner/scope-generation interest separately.

See `FAVORITES_DEEP_QUEUE_INTEREST_AND_BFCACHE_AUDIT_2026-08-30.md`.

---

## 7. BFCache breaks the unconditional pagehide death assumption

The cross-page deep queue writes an ended-worker marker on every `pagehide`.

A BFCache navigation can produce `pagehide` with `event.persisted=true` even though the document may later return.

The IndexedDB worker lease/CAS protects the final queue row well enough to reduce corruption, but a false death hint can still cause duplicate work and stale restored-tab ownership state.

Required contract:

```text
pagehide persisted=false
-> fast worker-ended hint allowed

pagehide persisted=true
-> document is frozen, not proven dead
```

On persisted `pageshow`, re-read durable lease state before assuming the old worker still owns anything.

---

## 8. The native/local pager alias is confirmed on current source

Module 95 creates a local pager that intentionally looks like Etsy's pager:

```text
<nav aria-label="Favorite Items Page Results" data-ebsf-local-pagination>
```

Module 95's own native-pager helper correctly excludes that marker.

Module 95a does not. It queries all navs with that aria-label and prefers the visible one.

Local mode hides the real Etsy pager and displays the BetterSearch pager, so 95a can read local selected page 2 as Etsy native page 2 even if Etsy's hidden pager is actually page 1.

The native click selector also matches local pager buttons.

The smallest correction is semantic selector isolation plus a combined hidden-native/visible-local fixture. No visual redesign is needed.

See `FAVORITES_PAGER_SEMANTIC_ALIAS_AUDIT_2026-08-30.md`.

---

## 9. Revised implementation ordering

The prior recommended order remains mostly intact.

### Data Release A

- stable owner identity;
- atomic mutable writer primitives;
- queue mutation atomics;
- DB versionchange cooperation.

### Data Release B

- IndexedDB v3 immutable generations;
- owner-specific membership;
- global listing metadata separated from owner membership;
- deep-job interest/retirement semantics updated with membership migration.

### Small bounded UI correction — may ship independently

- exclude `[data-ebsf-local-pagination]` from module 95a native pager discovery/click handling;
- add dual-pager regression fixture.

### Query / metadata generation release

- verified native-query generation;
- metadata destination/context generation;
- stale-response rejection before live/durable mutation;
- clearer metadata coverage state.

### Runtime policy release

- live config/UI preference propagation;
- safe cross-tab config merge/conflict domains;
- auto worker policy convergence;
- BFCache-aware worker lifecycle;
- delivery-target singleton/parity work.

---

## 10. Additional regression matrix

Add these to the broader audit matrix:

```text
config A + stale config B whole-object write
UI prefs A + stale UI prefs B write
autoScan disabled in B while worker A is loaded
destination A request + destination B request + late A response
owner A unfavorite while owner B still needs same listing metadata job
pagehide persisted=true + pageshow restore
hidden native pager page 1 + visible local pager page 2
local pager click must not set native page intent
```

Tests should model combined states. Static assertions that two variables have different names are not sufficient when both event handlers/selectors still match the same DOM element.

---

## 11. Scope of this audit

This pass does not claim that every source-level race was observed in the existing Diagnostics capture. Findings are classified from current production source unless explicitly connected to earlier capture evidence.

No raw account data, query text, listing IDs, HARs or Diagnostics ZIP contents are committed.

The current visual contract remains unchanged.