# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** release-promotion candidate passed local validation and artifact
audit; its fresh GitHub CI is pending. It intentionally contains no new
behavior—only the shared release identity/cache-buster promotion after audited
PRs #77, #78, and #79 merged.

```text
Date: 2026-09-02
Base main: 259c98415dfddcfeb654c6c3943b84215dddda6d
Base main push CI: 33642073497 — SUCCESS
Branch: codex/release-v0.15.27
Release content head: 190f885a595ff8b344535e1ab47557c725db0f0d
PR: pending publication
Release identity: production candidate 0.15.27
Diagnostics identity: 0.2.9 (unchanged, independent)
```

## Scope and decision

The user explicitly authorized merging the reviewed behavior gates and then
updating the extension version. The base includes:

- #77, stable desktop Favorites toolbar geometry;
- #78, Diagnostics valid native-empty-state marker suppression; and
- #79, opt-in rapid trace/burst export and reload option rehydration.

Each merge passed its required post-merge `main` CI. This promotion moves the
shared BetterSearch userscript/package/Chrome/Firefox identity from `0.15.26`
to `0.15.27`; Diagnostics remains separately versioned at `0.2.9`.

## Changes

```text
package.json
  package/extension source identity: 0.15.27

etsy-bettersearch.user.js
  @version plus every ordered @require cache-buster: 0.15.27

tests/* release-identity assertions
  Align only legitimate current userscript version/cache-buster assertions.

ACTIVE_WORK.md / PROJECT_STATE.md / CODEX_HANDOFF.md
  Record promotion state and the preceding merged behavior gates.
```

Historical module filenames, module comments, and historical release documents
remain at their original release references; they are not release identity
assertions.

## Required validation / artifact audit

The release content head passed:

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files / 90 modules
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 569/569
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics
git diff --check                                          PASS
```

Built Chrome and Firefox `manifest.json` plus `BUILD_INFO.json` each report
`0.15.27`; the userscript header and all 90 ordered `@require` URLs use its
cache-buster. Diagnostics still packages at `0.2.9` and reports `0.15.27` as
its companion version. Publish a PR, require fresh exact-head CI and artifact
uploads, merge only if that review is clean, then verify push-triggered CI on
the actual production merge SHA.
