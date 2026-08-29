# Favorites multi-tab and delivery-target audit — 2026-08-30

**Scope:** current v0.15.1 shared BetterSearch source, Tampermonkey entry, Chrome/Firefox extension build and persistent Favorites database/queue behavior.

This is a source audit. Where browser-realm/storage interaction requires live verification, that is called out explicitly rather than guessed.

## Executive summary

The project has good cross-tab protection in some narrow places, especially deep-queue job claims and same-dataset complete catalogue refresh. It does **not** yet have a single coherent multi-tab runtime contract.

Important findings:

1. Each tab/content-script/userscript runtime has independent JavaScript state (`favCfg`, `favUiPrefs`, `favState`, runner/controller flags, query state, etc.).
2. Deep queue job claiming itself is strongly hardened with IndexedDB readwrite claims, worker leases, heartbeats and compare-and-set terminal transitions.
3. User cancellation and challenge-page suppression are only in-memory booleans/controllers in the current tab. They are not a durable/global queue pause. Another Etsy tab can therefore remain eligible to continue automatic deep work.
4. The extension platform prelude mirrors `storage.local` changes into an internal raw-value map, but already-created `favCfg` / `favUiPrefs` objects are not automatically re-normalized/replaced when another tab changes storage. Cross-tab settings propagation is therefore incomplete even in the extension.
5. Tampermonkey declares no value-change listener grant/bridge at all, so its live tabs have even less explicit cross-tab settings propagation.
6. Scope/listing observations have a cross-tab stale read/modify/write race because the read and write are split across transactions. Deep queue atomicity does not protect general Favorites scope persistence.
7. Running the Tampermonkey BetterSearch and browser-extension BetterSearch simultaneously is currently an unsafe split-brain configuration: separate runtime/settings realms can touch the same Etsy DOM and may touch the same site-origin persistence/locks, while no cross-delivery singleton is established in source.
8. Future IndexedDB schema upgrades need `versionchange` cooperation from other tabs; current DB open code only rejects blocked upgrade and does not close older open connections on version change.

---

# 1. Delivery targets share feature source but not runtime memory

The Tampermonkey userscript loads the ordered `src/*` modules directly.

The extension builder reads that same userscript order and concatenates the same modules into one generated `content.js` async IIFE.

Therefore behavior/source parity is intentionally high, but every execution context still gets its own in-memory globals:

```text
favCfg
favUiPrefs
favState
native query state
deep runner promise/controller
worker IDs
local timers/observers
shell state
```

A second tab is not a second view onto the first tab's JavaScript objects.

Any state that must coordinate across tabs must therefore use an explicit shared mechanism:

```text
IndexedDB
Web Locks
localStorage lease
extension storage + onChanged
userscript manager value-change API
background messaging
DOM/shared-page marker
```

or be intentionally tab-local.

---

# 2. What is already genuinely cross-tab safe

## Deep queue job claim

`src/75-favorites-phase5-multitab-lease.js` claims the next queued deep job in one IndexedDB readwrite transaction.

Each running job gets:

```text
workerId
leaseUntil
```

The worker renews the lease during long requests and terminal completion/failure uses compare-and-set semantics against the current worker ID.

This correctly prevents the classic stale-worker case where a tab wakes after losing its lease and overwrites a job already reclaimed by another tab.

Current tests explicitly assert this design.

## Complete catalogue same-dataset ownership

`src/61b-favorites-sync.js` uses Web Locks when available and a localStorage lease fallback otherwise to stop two tabs from doing the same complete catalogue crawl concurrently.

The fallback heartbeat extends the lease during slow work.

This is useful and should remain after the IndexedDB generation migration, but peer completion should move from timestamp-based proof to exact generation-ID handoff.

---

# 3. Deep-scan Cancel is not global — SOURCE-PROVEN MULTI-TAB BUG

Current user-cancel behavior ultimately sets:

```text
favDeepAutoResumeSuppressed0103 = true
favDeepRunnerController.abort()
```

Both are tab-local JavaScript state.

The same is true when a challenge page is detected: the current worker sets its local suppression flag and aborts its local runner.

No durable queue-level value such as:

```text
autoScanPausedGlobally
pausedReason
pausedAt
```

is written.

Therefore:

```text
Tab A deep worker running
user presses Cancel in A
A aborts and suppresses its own auto-resume
Tab B still has its own suppression=false
B may later populate/claim queued work
```

Likewise, a verification/challenge response in one tab does not inherently prevent another tab from continuing automatic deep requests.

This is especially important for the challenge path: the intended safety policy should be browser/profile-wide for this BetterSearch data owner, not only one tab's event loop.

## Required durable pause contract

Create a persistent coordinator state, for example:

```text
DeepQueueControl {
  autoRunEnabled
  paused
  pauseReason: user | challenge | error-policy
  pausedAt
  resumeAfter?
  revision
}
```

Every tab checks it before populating/claiming automatic work.

Manual Scan missing / Update all may intentionally clear a user pause, but this must be an explicit global transition.

A challenge pause should have conservative semantics and must not be bypassed merely by opening another Etsy tab.

---

# 4. Existing extension storage change listener is only a raw-value mirror

`extension/platform-prelude.js`:

1. reads all `browser.storage.local` / `chrome.storage.local` before shared modules execute;
2. stores values in `ebsExtStore`;
3. exposes synchronous `GM_getValue()` against that Map;
4. persists `GM_setValue()` asynchronously;
5. listens for `storage.onChanged` and updates the raw Map.

This means a future `GM_getValue(key)` in tab B can see tab A's extension-storage write.

However most BetterSearch settings are loaded once into live objects such as:

```text
favCfg = favNormalizeConfig(GM_getValue(...))
favUiPrefs = favNormalizeUiPrefs(GM_getValue(...))
```

Those objects are then mutated/read directly by UI/runtime code.

`storage.onChanged` does **not** automatically update these existing objects or trigger a UI/reapply reconciliation.

So the platform prelude's raw Map is cross-tab-aware, while the feature's current live configuration is generally not reactive to that change.

## Required extension config contract

Add one shared feature-level settings event/adapter:

```text
remote persistent settings changed
-> normalize into live config objects while preserving reference contracts where required
-> invalidate affected caches
-> reapply/reconcile current page once
```

Avoid letting every module subscribe independently.

---

# 5. Tampermonkey live settings propagation is even less explicit

The userscript metadata currently grants:

```text
GM_getValue
GM_setValue
GM_addStyle
```

There is no declared/use of a value-change-listener bridge in the shared entry.

Therefore another Tampermonkey tab changing a stored setting does not have a project-owned mechanism that pushes the new value into already-instantiated `favCfg` / `favUiPrefs` in this tab.

This is not necessarily a visible bug for every preference; many users expect settings changes to take effect after reload. But the project should decide and document the intended multi-tab behavior rather than having Chrome extension and Tampermonkey drift accidentally.

Possible contract:

```text
persistent config changes are propagated live across BetterSearch tabs
```

or

```text
persistent config is tab-local until reload except for explicit global queue/safety controls
```

Safety controls such as deep-scan pause should be global regardless.

---

# 6. General Favorites scope persistence is not cross-tab atomic

Deep queue tests prove job-store atomicity, but they do not cover `favIndexObserveRecordsNow()` scope membership.

That function:

```text
readonly transaction -> read old scope/listings
compute merged state in tab JS
later readwrite transaction -> replace rows
```

The in-module Promise queue serializes only callers in the same runtime.

Another tab can read the same old scope before the first tab commits and later overwrite its result.

This creates lost-update and stale-complete-overwrite races documented in `FAVORITES_AUDIT_CHUNK3_2026-08-30.md` and the v3 migration plan.

Cross-tab catalogue crawler locking does not solve generic partial/current-page/metadata persistence.

Storage-layer atomicity/generation rules must.

---

# 7. Duplicate BetterSearch delivery targets can run simultaneously — NEW ARCHITECTURAL RISK

The repo supports:

- Tampermonkey userscript;
- Chrome extension;
- Firefox extension.

There is no source-level global singleton identifying one BetterSearch feature runtime as the owner of the Etsy page.

Per-runtime flags such as `runtimeObserverBound0121` exist only in that runtime's JavaScript realm.

If the Tampermonkey script and Chrome extension are both enabled on the same Etsy page, both can independently:

- find the same Etsy sidebar/search/grid;
- install/wrap BetterSearch UI;
- attach observers/listeners;
- call same-site Favorites endpoints;
- operate on BetterSearch's site-origin IndexedDB/localStorage coordination mechanisms where accessible;
- use different persistent config stores (Tampermonkey GM storage vs extension `storage.local`).

Even if DOM selectors cause one runtime to “find” nodes created by the other instead of duplicating every node, that is not safe ownership — they can still both believe they own and repair the same DOM.

## Required policy now

Until a cross-delivery singleton is implemented, documentation/testing should treat this as unsupported:

> Run either the BetterSearch Tampermonkey userscript or the BetterSearch browser extension, not both simultaneously.

The separate Diagnostics extension is different and should remain compatible because it is observational/development tooling, not a second BetterSearch feature owner.

## Future singleton

A DOM-visible ownership marker can cross isolated JavaScript worlds more reliably than a module global, for example a document/documentElement marker containing:

```text
delivery target
version
runtime instance token
```

Startup protocol:

1. check for live BetterSearch owner marker;
2. if another feature runtime already owns the page, second runtime becomes inert and logs a clear warning;
3. owner updates/removes marker on lifecycle teardown where possible;
4. stale marker detection is bounded and does not allow two simultaneous owners.

Do not use a marker that conflicts with Diagnostics.

A service-worker/background-owned lock is another option for extension tabs but would not by itself coordinate Tampermonkey.

---

# 8. Shared persistence + separate settings can create split-brain behavior

The extension's settings live in extension storage. Tampermonkey settings live in userscript-manager storage.

The feature code's Favorites index/lease architecture is designed around browser/site APIs in the Etsy page/content context.

Therefore a simultaneous dual-delivery configuration can conceptually have:

```text
runtime A config != runtime B config
but shared/overlapping catalogue/index coordination
and shared DOM
```

This is worse than merely seeing duplicate buttons.

Live browser verification should explicitly determine the exact IndexedDB/localStorage sharing behavior of the supported content-script/userscript realms, but the code should not depend on dual-delivery coexistence even if some storage turns out isolated.

A singleton policy avoids the entire unsupported configuration.

---

# 9. Extension startup differs from Tampermonkey startup

Both target `document_idle` for the feature runtime, but the generated extension bundle first waits for an asynchronous full `storage.local.get(null)` before executing shared modules.

Tampermonkey's raw shared modules execute under the userscript manager with synchronous `GM_getValue` semantics.

Consequences worth browser-testing:

- exact initial shell/props hydration timing can differ;
- extension may start slightly later after Etsy's DOM advances;
- late start can sometimes avoid a transient state and sometimes miss an earlier stable identity source;
- owner latching must therefore not depend on one delivery target's accidental timing advantage.

The correct identity/lifecycle architecture should tolerate either timing.

---

# 10. `GM_setValue()` durability timing differs in the extension adapter

The extension adapter:

```text
updates local ebsExtStore immediately
fires storage.local.set asynchronously
logs failure asynchronously
```

Shared callers do not await that durable write.

This is normally acceptable for UI preferences, but global safety/coordinator transitions should not rely on fire-and-forget GM compatibility calls if correctness requires confirmation before work starts/stops.

Deep queue global pause, migrations and generation commits belong in explicit durable coordinator APIs, not generic unawaited preference writes.

---

# 11. Future IndexedDB upgrades need cooperative old tabs

Current DB open code rejects `onblocked`, but an already-open DB connection does not install `db.onversionchange` and close itself.

A v3 schema rollout with multiple Etsy tabs can therefore be blocked by an older tab retaining a v2 connection.

The migration plan requires:

```text
db.onversionchange -> close connection + invalidate local DB handle/work
```

and a clear recovery path if another stale tab still blocks the upgrade.

This is both a migration issue and a multi-tab runtime issue.

---

# 12. Multi-tab count/UI state is currently per-tab

`favState.total`, records, filtered results, render ownership and native query state are tab-local.

A background complete sync in one tab updates IndexedDB, but another already-loaded tab does not automatically adopt that generation merely because the database changed. It typically needs its own scheduled refresh/re-entry/other trigger.

After v3, consider a small generation broadcast:

```text
scope generation committed
-> other BetterSearch tabs for same owner/scope learn generationId
-> if their local generation is older, schedule cache re-prime/reapply
```

Delivery-independent options include BroadcastChannel where appropriate or a storage/database signal; extension background messaging alone would not cover Tampermonkey.

Do not broadcast full record payloads. Broadcast identity/generation and let each tab read durable data.

---

# 13. Required test matrix

## Two tabs, same delivery target

- same dataset complete refresh deduplicates;
- unrelated datasets may refresh independently;
- partial scope observations cannot lose updates;
- stale tab cannot overwrite newer active generation;
- peer generation commit is adopted correctly;
- deep job claim cannot duplicate;
- Cancel in tab A globally stops future automatic deep claims in tab B;
- challenge in A pauses automatic deep work in B;
- manual resume/update intentionally clears global pause;
- settings propagation follows the documented contract.

## Tampermonkey vs extension parity

Run equivalent fixtures/browser smoke tests for:

- owner latch;
- cache startup;
- query commit;
- catalogue lease;
- IndexedDB generation commit;
- deep global pause;
- config persistence/reload behavior.

## Duplicate delivery target

Enable userscript + BetterSearch extension deliberately in a dev profile.

Expected future behavior:

```text
one feature runtime wins ownership
second becomes inert
one rail/toolbar/listener/controller owner
clear console/diagnostic notice
```

## Upgrade

- old tab DB connection closes on versionchange;
- v3 upgrade proceeds;
- old runtime cannot continue writing v2-shaped rows after version change;
- reloaded tab joins v3 generation state.

---

# 14. Diagnostics additions useful for multi-tab bugs

Diagnostics currently records one tab deeply. Add lightweight BetterSearch-exposed state so a capture can show:

```text
feature runtime instance ID
delivery target (tampermonkey/chrome/firefox)
owner generation
DB schema version
active catalogue generation
catalogue lock owner/token
scope revision
pending index writes
current deep worker ID/job lease
global deep pause state
local deep runner state
last remote generation/config notification
```

For privacy, IDs can be session-redacted/hashed where appropriate.

A future two-tab diagnostic procedure should record both tabs or at minimum expose shared coordinator state in each capture.

---

# 15. Recommended implementation order

1. establish v3 generation/atomic storage semantics;
2. add stable owner latch;
3. make deep auto-run pause/challenge state durable/global;
4. add scope-generation broadcast/re-prime;
5. define and implement settings propagation contract;
6. add duplicate feature-runtime singleton;
7. browser-test Tampermonkey vs Chrome/Firefox parity;
8. then move more durable work into extension background only where a platform abstraction keeps userscript behavior intentional.

Do not move the queue wholesale into the extension background before deciding the Tampermonkey equivalent. The current shared-source architecture is valuable; platform-specific ownership should be introduced behind explicit interfaces.