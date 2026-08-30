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

## Diagnostics 0.2.8 export lifecycle

`Stop & Export ZIP` is protected and resumable rather than being a best-effort page task:

- the export job is durably secured before the normal ZIP exporter is replayed;
- the backend recording is stopped and retained before the potentially long ZIP build;
- a full-page **Exporting…** overlay makes the protected state obvious and installs browser unload protection;
- the recorder panel mirrors that ownership state: elapsed time is visually frozen at the stopped duration, the primary status remains **Exporting…**, and recorder/settings controls are visibly locked so stale in-memory `Recording` UI cannot be operated;
- detailed `Reading…`, `Compressing…`, `Packing…`, and cleanup progress remains available in the overlay/activity log without replacing the panel's primary Exporting state;
- if the tab/page disappears, the durable job and stopped raw capture survive and can resume from another Etsy document or after a browser restart;
- a failed export keeps the stopped recording for retry instead of silently discarding it.

The final ZIP is also **losslessly compressed**. Text-heavy forensic entries (`.har`, JSON/NDJSON, HTML and text response bodies, logs, etc.) use ZIP raw DEFLATE when available; already-compressed/binary entries such as screenshots remain STORE when appropriate. Compression failure never makes the export fail—the affected entry safely falls back to STORE.

This changes archive size only, not diagnostic content. For the 2026-08-30 validation captures, offline DEFLATE of the exact same entries reduced the larger ~363 MB STORE archive to about ~58 MB and the ~74.6 MB resize archive to about ~10.3 MB, with no events/files removed.

If a banner-Cancel or protected export still fails, the stopped recording remains available through **Export ZIP**. Diagnostics will not discard it until the download path and final cleanup complete.

## Build output

The normal BetterSearch extension remains in:

- `dist/chrome`
- `dist/firefox`

This diagnostics extension is built separately into:

- `dist/diagnostics-chrome`

It is intentionally not bundled into the production BetterSearch extension because the `debugger` permission is powerful and only needed during diagnostics.
