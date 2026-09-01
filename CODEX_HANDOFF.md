# Etsy BetterSearch — Codex Review Handoff

## Task identity

```text
Date/time: 2026-09-01 (Europe/Helsinki)
Task: make the v0.15.11 count-authority source assertion line-ending portable
Base main SHA: 614ec3d26caa3ce9602b2e47261a15359e24be4a
Branch: fix/test-crlf-static-source-normalization
Implementation head: 3c965d2fce1343b8c1ec0c27557367d25f63c225
PR: pending publication from this handoff commit
Release identity: unchanged v0.15.25; test-only behavior gate
Dependencies: none
```

## Problem and change

`tests/favorites-v01511-count-authority.test.mjs` searched source text with an
LF-only marker. On Windows autocrlf checkouts, the checked-out source uses CRLF
and the test failed before executing any count behavior, while the identical
Linux CI checkout passed.

The test now normalizes CRLF transport line endings to LF immediately after
reading the source and before locating the semantic marker. It does not weaken
the marker or any count-authority assertions. Production source, version,
userscript ordering, and generated delivery artifacts are unchanged.

`PROJECT_STATE.md` now records this validation portability rule.

## Validation

```text
Node 22 focused count-authority suite: PASS — 15/15
Node 22 full suite: PASS — 528/528
npx --yes --package=node@22 node scripts/check.mjs: PASS
  121 files; 86 modules; 943 versioned symbols
npx --yes --package=node@22 node scripts/build.mjs: PASS
  Chrome, Firefox, Diagnostics Chrome
git diff --check: PASS
```

Artifact inspection is not behaviorally significant for this test-only patch;
the build completed all three targets without generated source changes.

## Diff/risk review

Two files changed: the static test fixture and the durable validation note.
No private data, production logic, identity/cache-buster, or open implementation
PR code is included.

Reviewer focus: confirm normalization happens only at source-text transport
level and the existing semantic marker/count tests remain intact.

## GitHub CI and next action

Publish this branch as a separate unmerged PR. The CI workflow must pass its
exact head. Then independent review may approve it as a low-risk test-only
maintenance change. No manual browser testing is required.
