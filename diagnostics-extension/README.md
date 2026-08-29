# Etsy BetterSearch Diagnostics

Development-only Chrome extension for recording difficult Etsy BetterSearch browser/runtime problems.

## What it captures

- Chrome DevTools Protocol network traffic and a generated HAR 1.2 export.
- Request/response headers, initiators, status, timing, post data, and optional response bodies.
- DOM mutations and timestamped state snapshots for the Favorites sidebar, BetterSearch rail, native/local result grids, native/local pagers, toolbar and collection strip.
- Navigation/lifecycle events, Resource Timing / paint / long-task timing, user interactions, console/runtime errors.
- Manual problem markers. Pressing **Mark problem** immediately records state plus optional CDP screenshot and DOMSnapshot, then opens an optional note field.
- Automatic markers for known invariants such as a disappearing rail, sidebar-host replacement, both grids/pagers being visible, no result grid being visible, HTTP errors, uncaught exceptions, and malformed `/users//collections/` requests.

Every event includes an ISO/wall-clock timestamp and monotonic timing relative to navigation/recording so network and DOM events can be correlated precisely.

## Workflow

1. Build the repo with `npm run build`.
2. In Chrome, load `dist/diagnostics-chrome` as an unpacked extension.
3. Keep Chrome DevTools closed for the Etsy tab; DevTools and `chrome.debugger` cannot own the same target simultaneously.
4. Open Etsy Favorites and expand the floating diagnostics panel.
5. Press **Record & Reload** to attach CDP before reloading and capture startup/hydration from the beginning of the new document. The page-side heavy recorder only starts after the background confirms that Chrome still has the debugger attached.
6. Reproduce the problem. Press **Mark problem** whenever something visually wrong happens; the description is optional.
7. Finish in either of these ways:
   - press **Stop & Export ZIP** in the Diagnostics panel; or
   - press Chrome's debugger-banner **Cancel** control. Diagnostics treats Chrome's `canceled_by_user` detach as Stop + Export and requests the same retained ZIP export automatically.
8. Upload the resulting ZIP for analysis. It contains `network/network.har` plus the richer raw timeline/DOM/marker data, so a separate DevTools HAR should normally not be necessary.

If a banner-Cancel export is interrupted or fails, the stopped recording remains available through **Export ZIP**. It is not automatically rebuilt on later Etsy page loads, so merely enabling Diagnostics or reopening Etsy stays passive.

## Build output

The normal BetterSearch extension remains in:

- `dist/chrome`
- `dist/firefox`

This diagnostics extension is built separately into:

- `dist/diagnostics-chrome`

It is intentionally not bundled into the production BetterSearch extension because the `debugger` permission is powerful and only needed during diagnostics.

## Evidence gaps exposed by the 2026-08-29 full Favorites capture

The first large end-to-end capture was successful enough to reconstruct several production failures, but it also showed that DOM/network evidence alone still leaves too much BetterSearch-internal state to infer after the fact. See `docs/FAVORITES_DIAGNOSTICS_AND_INDEXEDDB_AUDIT_2026-08-29.md` for the sanitized analysis.

Future important-state snapshots should include a compact, privacy-safe BetterSearch state block with:

```text
scope/dataset/view identity
dataset generation
committed + pending native query
query commit reason/source
catalogue source + complete generation
scope lastCompleteSyncAt
records / filtered / current-server-total counts
render owner + ownership generation/reason
native/local grid connectivity, visibility and card counts
native/local page + pager identity
rail generation + shell reconcile reason
metadata requirement generation + pending/unresolved counts
availability mode + availability-model generation
server/cache/index count authorities
auto-sync enabled + interval + due/suppressed reason
reconcile DOM writes performed vs skipped-as-unchanged
```

The capture also justifies new automatic markers for:

- local empty result while the hidden native grid already contains cards;
- local grid ownership while Etsy's native pager remains visible;
- server/cache/index Favorites totals disagreeing;
- more than one BetterSearch rail generation in one document;
- excessive reconcile/no-op mutation bursts;
- attempted ownerless Favorites scope creation/persistence;
- implausibly long native query being committed as durable dataset identity.

These fields should be sanitized in Diagnostics output. Do not embed account IDs, raw cookie/session data, full IndexedDB dumps, or private marker-note text in routine summary fields.

### Performance interpretation

The 2026-08-29 recording captured 274k+ DOM mutations and therefore adds meaningful observer/export overhead itself. Use its mutation structure and invariant failures as evidence, but do not treat absolute long-task duration as a clean BetterSearch benchmark.

A later lightweight mode should be able to record only lifecycle counters/state transitions and skip full DOM-mutation payloads when the goal is measuring performance rather than reconstructing exact DOM history.
