# Chrome / Firefox extension architecture

BetterSearch is being converted without forking the feature implementation into separate browser-specific copies.

## Current source of truth

The existing ordered modules under `src/` remain the shared implementation. The Tampermonkey entry file still declares their runtime order with `@require`.

The extension builder reads that same order and concatenates the same modules into one generated `content.js` file. This means a module cannot accidentally be added to Tampermonkey but forgotten from Chrome/Firefox, or vice versa.

```text
etsy-bettersearch.user.js
        |
        | @require order
        v
      src/*
        |
        +-------------------------+
        |                         |
        v                         v
 Tampermonkey runtime      scripts/build.mjs
                                  |
                     +------------+------------+
                     |                         |
                     v                         v
               dist/chrome               dist/firefox
```

`dist/` is build output and should not become hand-edited source.

## Why the first extension build still looks userscript-like

The existing modules were written around three synchronous Tampermonkey APIs:

- `GM_getValue`
- `GM_setValue`
- `GM_addStyle`

Rewriting every module before proving extension parity would create unnecessary regression risk. Instead, `extension/platform-prelude.js` provides that small API surface inside the generated extension bundle.

At startup the extension:

1. waits for `browser.storage.local` / `chrome.storage.local` to load;
2. fills an in-memory settings cache;
3. exposes synchronous `GM_getValue` reads from that cache;
4. mirrors `GM_setValue` writes back to extension storage asynchronously;
5. implements `GM_addStyle` with a normal `<style>` element;
6. only then runs the existing shared BetterSearch modules.

This preserves the initialization assumptions of the current code while moving persistence out of Tampermonkey.

## Chrome build

Chrome uses Manifest V3 with:

```text
background.service_worker = background.js
permissions = storage
host_permissions = https://www.etsy.com/*
content script = content.js at document_idle
```

The service worker remains minimal. The persistent metadata/deep-scan queue currently lives in the shared Etsy content context so Tampermonkey, Chrome, and Firefox use identical behavior; queue records themselves are durable IndexedDB data.

## Firefox build

Firefox uses Manifest V3 too, but the generated manifest uses Firefox's background-script form rather than Chrome's service-worker declaration. The Firefox build also gets a stable Gecko extension ID.

The feature source and generated `content.js` are otherwise the same as Chrome.

## Background/content responsibilities over time

### Today

**Content script**

- all existing marketplace behavior
- reconstructed Favorites shell with a permanent desktop filter rail, horizontal real-collection selector, mobile filter overlay, and no BetterSearch-created duplicate pager
- filter-layout schema v2 with instance IDs and shared binding keys for moved/duplicated controls
- existing Etsy DOM integration
- same-site fetches already used by BetterSearch
- extension settings through the compatibility adapter
- versioned Favorites IndexedDB interface and cheap metadata/scope observations
- conservative authoritative Favorites synchronization, cancellation, progress, and auto-sync freshness decisions
- persistent deep-listing jobs, authenticated fetching, retries, parsing, and progress while a Favorites page is active

The v0.12.0 shell/filter modules are appended to the same userscript order as every other shared module. They override the older compatibility layer at runtime without changing IndexedDB stores, queue job formats, or platform adapters, so Tampermonkey and both MV3 bundles execute the same final behavior.

**Background**

- minimal runtime shell / health ping

### Future deep-index architecture

**Content script**

- observe Favorites page/scope changes
- native-style Filters/Sort UI
- render current results
- observe direct heart/unfavorite actions
- request metadata needed by active filters
- show scan/index status

**Background**

- own persistent metadata job queue
- fetch/deep-parse listing pages where browser permissions/session behavior allow
- retry/backoff
- stale-field refresh
- listing/shop deduplication
- durable resume after browser worker suspension/restart
- send indexed updates back to relevant Etsy tabs

**Database (implemented)**

- listing records
- shop records
- Favorite scope memberships
- metadata freshness/versioning
- persistent deep-scan jobs

## Browser storage strategy

### Phase 0/1

Use `storage.local` for the existing relatively small settings/rules because that maps cleanly to the current GM storage behavior.

### Metadata foundation (implemented)

The large Favorites index is not stored in one settings object. `src/61a-favorites-index.js` provides a versioned IndexedDB abstraction with separate `listings`, `shops`, and `scopes` stores, provenance-aware field merging, batched observations, partial/complete scope semantics, and dormant unfavorite records. `src/61b-favorites-sync.js` owns conservative same-site pagination, runtime job state, cancellation/stale-job rejection, and 12-hour auto-sync freshness checks.

The public API hides the backing store and works in the Etsy page/content context for Tampermonkey, Chrome, and Firefox. A future service-worker owner can adopt the same database/message interface without changing filter semantics.

## Tampermonkey compatibility

Tampermonkey remains supported.

It will keep loading the raw `src/` modules directly through `@require`. Future shared parser/filter code should avoid extension-only assumptions unless it sits behind a platform adapter.

The biggest unavoidable difference is background lifetime:

- Extension and Tampermonkey: queue data persists across reloads/restarts and processing resumes while a matching Etsy Favorites page is alive.

Feature semantics should otherwise remain the same where practical.

The shared UI keeps **Favorites sync** separate from **Deep metadata scan**. Deep scans fetch individual listing pages through the persistent queue; cheap sync never masquerades as that work.

## Settings migration

Extension settings are **not automatically imported from Tampermonkey** in the first conversion.

That is intentional because Tampermonkey storage is private to the userscript manager and should not be scraped through brittle workarounds.

Later migration should use a versioned explicit export/import format:

```json
{
  "format": "etsy-bettersearch-settings",
  "version": 1,
  "settings": {},
  "marketplaceRules": [],
  "favoritesRules": []
}
```

A large metadata index should be a separate optional export.

## Build commands

From the repository root:

```bash
npm run check
npm test
npm run build
```

`npm run build` creates:

```text
dist/
  chrome/
    manifest.json
    content.js
    background.js
    BUILD_INFO.json
  firefox/
    manifest.json
    content.js
    background.js
    BUILD_INFO.json
```

The build output version comes from the userscript's `@version`. `package.json`, every userscript `@require ?v=...` cache-buster, and the extension manifests are checked for version consistency.

## GitHub Actions

`CI and extension builds` runs on pushes, pull requests, and manual dispatch:

1. syntax/consistency check;
2. Node tests;
3. Chrome build;
4. Firefox build;
5. upload both browser builds as GitHub Actions artifacts.

`Release browser builds` runs for `v*` tags and can also be run manually. Tag runs create/update the GitHub release and attach:

- Chrome ZIP
- Firefox ZIP
- Tampermonkey userscript

## Rules for future refactors

- Prefer extracting reusable pure functions over copying code into extension files.
- Do not make `dist/` the source of truth.
- Keep browser-specific code under `extension/` or a clearly named platform adapter.
- If a new source module is part of both userscript and extensions, add it to the userscript `@require` order; the extension builder will pick it up automatically.
- If a feature genuinely requires background capability, expose it through message/data interfaces instead of directly reaching extension APIs from unrelated UI modules.
- Preserve an `unknown` metadata state all the way through filtering.
- Add tests before moving major scan responsibilities from content to background.
