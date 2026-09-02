# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-02

GitHub PR state, exact remote heads, CI, source, tests, and verified artifacts
remain authoritative if they disagree with this snapshot.

## Verified merged production baseline

```text
Release: v0.15.26
main: 3f019e1998b849af2d3378236fff69743a7183f9
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

PR #77 (stable desktop Favorites toolbar geometry) was independently reviewed
and merged to `main` at `9f18b2a`; its release identity remains v0.15.26 until
a deliberate release promotion. Its required post-merge CI run `33640759152`
succeeded.

PR #78 (valid native-empty-state Diagnostics marker suppression) was merged to
`main` at `3f019e1` after its reconciled exact-head CI run `33641504532`
succeeded. Its post-merge `main` CI still needs to be recorded.

PR #79 is the active Diagnostics-only behavior gate. It corrects reload-panel
option rehydration and makes the final streaming ZIP export the selected
animation-frame trace and marker screenshot bursts. Its current-main merge
head is locally validated and awaits fresh CI. Once merged, use it for a
focused repeat capture before changing final production collection navigation
or grid ownership. Do not treat shorter filter movement as source-proven
without that evidence.
