# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-02

GitHub PR state, exact remote heads, CI, source, tests, and verified artifacts
remain authoritative if they disagree with this snapshot.

## Verified merged production baseline

```text
Release: v0.15.27
main: 936325e0b70723005fc8c05dacbb3534ff0c2236
release integration PR: #75 — merged
post-merge push CI: 33521127261 — success
```

The release combined the independently reviewed behavior gates from PRs #67,
#68, #69, #71, #72, #73, and #74. Their abandoned intermediate identity bumps
were deliberately excluded. The combined behavior gate stayed at v0.15.25 and
passed the complete Node 22 suite (565/565), repository checks, and all three
local delivery-target builds before the v0.15.26 identity promotion. Its exact
release head `fccb28ba56f4682344ad4c27f16ce488bf794443` also passed GitHub CI
run `33520794029`; the production merge then passed the required push CI above.

The candidate adds:

- local Favorite action confirmation/bridge fencing;
- focused rail draft preservation and sort-portal lifetime cleanup;
- owner/generation-safe collection lifecycle handling;
- IndexedDB `versionchange` cooperation;
- first-runtime-wins protection for accidental userscript + extension overlap;
- portable CRLF static-source test normalization.

## Deferred/manual validation

Before treating the release as browser-proven, exercise own Favorites and a
public profile in Chrome, Firefox, and Tampermonkey; include a rapid heart
action, filter text focus/blur, collection create during route change, and an
intentional duplicate-runtime installation. No private diagnostics are tracked.

## Next independent work

PRs #77–#81 are merged. Their `main` merge heads were independently verified
by push CI: #77 `33640759152`, #78 `33641562157`, #79 `33642073497`, #80
`33642624166`, and #81 `33643152934`, all successful. Current `main` is
`ee2abc8`.

A new private focused capture has three manual markers and useful layout
screenshots, but its rapid options were not active: its summary has zero
animation-frame windows and zero marker-burst screenshots. Source reconciliation
found that `controls.js`, loaded after `content.js`, is the final recorder-panel
owner and did not rehydrate the durable session options. The active independent
Diagnostics behavior gate repairs that final owner before requesting another
rapid-transition capture. It does not change production Favorites routing or
ownership.

The collection-pill handler still intentionally performs a full document
navigation. Do not introduce a synthetic SPA route or inferred filtering fix
until a repaired capture proves a lasting semantic mismatch after the route has
settled.
