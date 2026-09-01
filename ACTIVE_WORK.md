# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-01

GitHub PR state, exact remote heads, CI, source, tests, and verified artifacts
remain authoritative if they disagree with this snapshot.

## v0.15.26 release integration

```text
Base main: 614ec3d26caa3ce9602b2e47261a15359e24be4a
Branch: codex/release-v0.15.26-integration
PR: #75 https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/75
Release implementation head: f371538370e6c5a95828c7850978233ee5c2fe8a
State: release candidate; GitHub CI pending
```

The release combines the independently reviewed behavior gates from PRs #67,
#68, #69, #71, #72, #73, and #74. Their abandoned intermediate identity bumps
were deliberately excluded. The combined behavior gate stayed at v0.15.25 and
passed the complete Node 22 suite (565/565), repository checks, and all three
local delivery-target builds before the v0.15.26 identity promotion.

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

After this release is merged and its push CI is green, take the next
source-proven item from `docs/CODEX_NEXT_WORK_PLAN.md` from clean `main`.
Prefer lifecycle/accessibility evidence or Diagnostics-guided work; do not
reopen stale pre-v0.15.25 count-authority branches without final-owner proof.
