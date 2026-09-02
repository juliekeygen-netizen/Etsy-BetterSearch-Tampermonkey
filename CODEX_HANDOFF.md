# Etsy BetterSearch — Codex Review Handoff

## Current review packet

**Status:** `v0.15.28` remains the released `main` baseline. One focused,
unmerged UI behavior branch is ready for independent review.

```text
Date: 2026-09-02
Base main SHA: 7d24e95d6014500e3dea87f307a782d167bae559
Branch: codex/fix-all-toolbar-search-parity
Implementation head: 74c60e6b2c00d3a2b24c6cc89cd27dbc6c2837a5
Published branch head: c9a9db63f3fda52a76370ed6ae35fd2acfd411d6
PR: #86 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/86 — OPEN
CI: pending GitHub Actions
Release identity: unchanged (v0.15.28 behavior gate)
```

## All Favorites toolbar/Search parity

### Problem and evidence

Annotated current-browser screenshots show that All Items retained a compact
inline title/toolbar layout while collection pages used the preferred separate,
full-width Sort/Settings/Search row. The same All view can position the native
Search clear X too far left after Etsy inserts its extra button-group wrapper.

Private page HTML was inspected locally only. It is not tracked or included in
this branch.

### Changed files and decisions

- `src/103-favorites-v0157-diagnostics-fixes.js` is the final toolbar owner;
  it now intentionally stacks All as well as collection desktop headers.
- `src/100-favorites-all-search-clear-parity.js` marks the actual native
  button-group wrapper and accepts either wrapper shape, preserving Etsy's own
  clear button rather than recreating it.
- The UI contract and two focused regression suites now describe/test this
  requested presentation.
- `PROJECT_STATE.md` records the current main SHA and the private-evidence
  boundary. No production data, screenshots, URLs, accounts, or diagnostic
  archives were committed.

### Validation and artifact audit

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 572/572
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                        PASS
Artifact inspection                                      PASS — Chrome/Firefox content bundles contain wrapper-safe clear parity and final All forceStack owner
```

### Reviewer focus and manual browser check

Confirm at desktop and narrow widths that All has title/privacy on its own row,
with Sort/Settings/Search spanning the next row, and that typing/clearing
Search keeps the X immediately before Etsy's search button. Confirm the native
Search control and collection edit/add controls remain Etsy-owned.

## Next independent task

Investigate and, if source-proven, fix the Ships from -> Anywhere visual radio
selection without redefining its neutral/non-active filter semantics. The
fallback-card fidelity issue is separate and higher risk: local evidence shows
it is a real fallback renderer path, but it needs a native-card template audit
before any markup change.
