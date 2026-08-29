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
5. Press **Record & Reload** to attach CDP before reloading and capture startup/hydration from `document_start`.
6. Reproduce the problem. Press **Mark problem** whenever something visually wrong happens; the description is optional.
7. Press **Stop & Export ZIP**.
8. Upload the resulting ZIP for analysis. It contains `network/network.har` plus the richer raw timeline/DOM/marker data, so a separate DevTools HAR should normally not be necessary.

## Build output

The normal BetterSearch extension remains in:

- `dist/chrome`
- `dist/firefox`

This diagnostics extension is built separately into:

- `dist/diagnostics-chrome`

It is intentionally not bundled into the production BetterSearch extension because the `debugger` permission is powerful and only needed during diagnostics.
