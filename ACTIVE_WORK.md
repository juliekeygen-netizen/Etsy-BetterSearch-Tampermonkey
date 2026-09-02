# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-02

GitHub PR state, exact remote heads, CI, source, tests, and verified artifacts
remain authoritative if they disagree with this snapshot.

## Verified merged production baseline

```text
Release: v0.15.28
main: fd63c43704f11aa4283316805f1432f4736d30fc
release integration PR: #84 — merged
post-merge push CI: 33654527080 — success
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

PR #82 repaired final-owner rehydration of Diagnostics rapid-capture options;
PR #83 applied the requested desktop collection two-row toolbar layout. Both
were merged and their `main` CI runs succeeded before release PR #84 promoted
them to v0.15.28. The exact release merge also passed its required `main` CI.

The next high-value task is manual browser validation, not another speculative
routing rewrite: reload the unpacked Diagnostics build, enable all rapid
options, reproduce a short focused collection handoff, then inspect the frame
trace/burst output. Separately confirm the collection title/privacy row remains
above Sort/Settings/Search at desktop and narrow responsive widths. The final
collection-pill handler still intentionally performs full navigation; do not
introduce a synthetic SPA route without that repaired evidence.
