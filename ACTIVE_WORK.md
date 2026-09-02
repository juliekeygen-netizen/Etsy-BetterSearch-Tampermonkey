# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-02

GitHub PR state, exact remote heads, CI, source, tests, and verified artifacts
remain authoritative if they disagree with this snapshot.

## Verified merged production baseline

```text
Release: v0.15.26
main: 9f18b2acc572b744f87400114ebeedfd7d96878b
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

The active work is `codex/fix-diagnostics-valid-empty-state-marker`, now being
integrated with that current `main`. It suppresses only the Diagnostics
false-positive marker for a structurally verified, visible native empty
Favorites collection. Its reconciled exact-head CI run `33641358486` succeeded;
it does not alter production behavior.

The user-provided refresh and collection-transition capture also proved a
native-to-local handoff flash. The newly added frame trace/burst exporter must
be merged and used for a focused repeat capture before changing the final
collection-navigation or grid-ownership owner. Do not treat shorter filter
movement as source-proven without that evidence.
