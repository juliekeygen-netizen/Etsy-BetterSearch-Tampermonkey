# Etsy BetterSearch — Active Work Queue

**Updated:** 2026-09-01

This file is the highest-priority repository record for open implementation
branches. GitHub PR state, exact remote heads, CI, source, tests, and artifacts
remain authoritative if they disagree with this snapshot.

## Verified merged production baseline

```text
Release: v0.15.25
main: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b
post-merge push CI: 33391628427 — success
```

## Open implementation behavior gates

All branches below target `main`, must remain unmerged until independent review,
and had green GitHub Actions at the listed heads.

| PR | Branch / exact head | Scope | CI |
| --- | --- | --- | --- |
| [#67](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/67) | `fix/favorites-v01526-local-card-action-boundary` / `739d5be76dbc29cd8b376b44fba17f9987feb6bc` | local Favorite action confirmation/bridge boundary | `33438714693` success |
| [#68](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/68) | `fix/favorites-v01526-focused-rail-refresh` / `666680fd010114ee150d9013facf881b7acc4da1` | preserves focused Favorite-filter drafts | `33438909512` success |
| [#69](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/69) | `fix/favorites-v01526-sort-portal-lifetime` / `6e108b3d905e88c21421cd17d6d11f01d41b9028` | Sort portal lifecycle/backlink cleanup | `33512954260` success |
| [#71](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/71) | `fix/favorites-collection-lifecycle-generation` / `4c6d84f2b0f5a722922174c41b53b791a7757bc3` | owner-keyed collection model and create-operation fencing | `33493124151` success |
| [#72](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/72) | `fix/favorites-db-versionchange-cooperation` / `f023130db25678688b1a6d6ef6076e28537c816a` | close/invalidate old IndexedDB handles during upgrades | `33494033472` success |

### Coordination

- PRs #67–#69 are v0.15.26-era behavior candidates. Do not independently
  promote or merge them one at a time. After approval, use one integration
  branch from current `main`, resolve final module order, prove combined
  behavior, then perform a single release-identity promotion.
- PRs #71 and #72 are independent behavior gates. Review their final owners and
  artifacts, but do not duplicate their collection or database work.
- The remote `fix/favorites-count-authority-fail-closed` branch is stale:
  its head `a55972c559253194bb637f734de639112643b8a0` predates the current
  v0.15.25 count/render boundaries and has no open PR. It is not active work.

## Current audit behavior gate

The branch that updates this file audits v0.15.25 final owners and adds a
Favorites-scoped first-runtime-wins document marker for accidental simultaneous
Tampermonkey + production-extension execution. It is independent of every PR
above and must receive its own CI/artifact/manual dual-delivery review.

## Next independent work

While open gates await review, prefer source-proven work from clean `main` that
does not overlap them. Candidates requiring browser/Diagnostics evidence before
implementation are filter/lifecycle mutation ownership, accessibility/focus,
generation wakeups, and delivery-target smoke parity.
