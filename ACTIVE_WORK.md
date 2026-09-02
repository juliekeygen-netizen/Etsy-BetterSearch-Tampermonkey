# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-01

GitHub PR state, exact remote heads, CI, source, tests, and verified artifacts
remain authoritative if they disagree with this snapshot.

## Verified merged production baseline

```text
Release: v0.15.26
main: 63c8b6453b443a2f346c20723f6c5da36793a830
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

The active behavior gate is `codex/fix-favorites-stable-toolbar-geometry`,
based on `63c8b6453b443a2f346c20723f6c5da36793a830`. It keeps the v0.15.26
identity and addresses a private 2026-09-01 Diagnostics capture finding: the
final desktop toolbar planner varied width by route-specific title controls.
The branch makes width canonical per viewport or stacks when it cannot fit.

While that branch awaits independent review, start the Diagnostics-only valid
empty-state false-positive audit/fix from clean `main`. Do not treat the
reported startup drawer flicker as a source-proven bug without a focused
before/after capture.
