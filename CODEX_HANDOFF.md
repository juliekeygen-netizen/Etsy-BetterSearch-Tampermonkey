# Etsy BetterSearch — Codex Review Handoff

## Released baseline

```text
Main before this PR: b97496e94cf3835f4d8f9f078000177694ad716f
Release identity: v0.15.28
Required main CI: 33672185684 — SUCCESS
```

## Merged PR #86 — All Favorites toolbar and Search clear parity

```text
Merge commit: b97496e94cf3835f4d8f9f078000177694ad716f
PR CI: 33667143408 — SUCCESS
Merged-main CI: 33672185684 — SUCCESS
```

All now has the requested full-width Sort/Settings/Search row and its native
clear X is placed beside Etsy's Search button without recreating that native
control.

## PR #87 — Ships from Anywhere selection

```text
Branch: codex/fix-ships-anywhere-selection
Implementation head: 440f2b6baa9ac97cbe8f1eb8e6d86a2f37becdd8
Previous published head: 6613529438316bb7b449aa7f3fbaee495d8cc2ee
PR: https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/87 — OPEN
Base before branch update: 7d24e95d6014500e3dea87f307a782d167bae559
Release identity: unchanged (v0.15.28 behavior gate)
```

This branch has been updated with merged PR #86 without rewriting history.
The final filter-state owner distinguishes a radio's visual selection from an
active filtering value: Anywhere stays neutral but visibly selected after a
switch from Europe or another origin. It does not auto-open the drawer.

Changed files: `src/104-favorites-v0157-filter-state-sync.js`, its focused
test, and this handoff. The resolution merge also contains the already-merged
toolbar implementation from `main`.

Validation before the branch update:

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 572/572
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                        PASS
Artifact inspection                                      PASS — final selection owner in Chrome/Firefox bundles
```

Re-run the complete validation set after this sync and wait for its new PR CI
before merge. Manual review: choose Europe, then Anywhere, reload, and confirm
Anywhere remains visibly selected while Ships from remains neutral.

## Privacy and next work

No raw private diagnostics, page HTML, screenshots, URLs, listing details,
account identifiers, or marker notes are tracked. After PR #87 merges, update
and publish PR #88 (native-shaped fallback cards, collection-observation fence,
and persisted Diagnostics options), then perform the release-version promotion.
