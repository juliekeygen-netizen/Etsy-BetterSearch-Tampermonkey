# Etsy BetterSearch — Codex Release Handoff

## Released baseline: v0.15.29

```text
Date: 2026-09-03
Release PR: #89 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/89 — MERGED
Release merge SHA: d56664c2d23f5b484e22cfdc1fe2c63e2e8f4216
Release PR CI: 33685077464 — SUCCESS
Required merged-main CI: 33685137704 — SUCCESS
BetterSearch: 0.15.29
Diagnostics Chrome: 0.2.10
```

## Released scope

This release promotes the already-proven diagnostic/UI repairs:

- All Favorites has its requested separate toolbar row and correctly placed
  native Search clear control (PR #86).
- Ships from -> Anywhere remains visibly selected while staying a neutral
  filter choice (PR #87).
- Cache fallback cards use Etsy-shaped card/heart/badge structure; stale
  collection props cannot write memberships to a destination collection; and
  Diagnostics capture choices persist through an ordinary reload (PR #88).

The release promotion aligns all 90 userscript `@require` cache-busters with
the shared `0.15.29` identity and promotes the independently shipped
Diagnostics manifest to `0.2.10`. Historical release documents retain their
historical versions. No private diagnostic archive, browser HTML, screenshot,
URL, listing information, account data, or marker note is tracked.

## Verification and artifact audit

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.29
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 579/579
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome 0.15.29, Firefox 0.15.29, Diagnostics Chrome 0.2.10
git diff --check                                        PASS
GitHub release PR CI                                    PASS — 33685077464
GitHub merged-main CI                                   PASS — 33685137704
```

Artifact inspection confirmed 90/90 userscript cache-busters at `0.15.29`,
Chrome and Firefox manifests at `0.15.29`, Diagnostics Chrome at `0.2.10`, and
the built collection-currentness, fallback-card/heart, and preference-owner
boundaries in their delivery targets.

## Manual browser checks still valuable

Test cache-backed cards at desktop and mobile widths; compare badge/action
layout to native cards; check a live versus off-page heart; change collections
rapidly; and verify Diagnostics options survive a normal page refresh. These
are Etsy-selector/timing smoke checks, not known CI failures.

## Next independent task

Continue `docs/CODEX_NEXT_WORK_PLAN.md` from clean `main`, starting with the
highest-value browser-verified issue rather than reimplementing historical
findings already covered by the current runtime chain.
