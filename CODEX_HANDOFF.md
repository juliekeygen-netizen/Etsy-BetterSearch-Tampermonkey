# Etsy BetterSearch — Codex Review Handoff

## 1. Task identity

```text
Date/time: 2026-09-01 (Europe/Helsinki)
Task summary: Audit and repair live PR #69, the Favorites Sort portal lifetime behavior gate.
Base product SHA: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b (v0.15.25)
Current documentation main merged: 614ec3d26caa3ce9602b2e47261a15359e24be4a
Branch: fix/favorites-v01526-sort-portal-lifetime
Implementation snapshot validated locally: 43b6e27
PR: #69 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/69
PR state: OPEN
Release identity: restored to 0.15.25 behavior gate; no standalone v0.15.26 promotion
Dependencies: none. Do not combine with PRs #67/#68 until independent review selects approved behavior gates.
```

The handoff document is committed after the validated snapshot; inspect the live PR head for the exact review commit.

## 2. Evidence and decision

The final Sort creator is module 79. It creates a body-level menu portal while module 69 owns positioning/open/close visibility. When Etsy replaces toolbar roots outside the explicit rebuild path, an old root can detach while its portal remains in `document.body`; module 69 previously only hid and tagged that portal. This PR binds each portal to its owner root and prunes detached/orphaned portals at natural create/open/close/rebuild boundaries, avoiding a second route lifecycle or observer system.

During audit, the original candidate exposed an additional live lifetime bug: disposing an orphaned menu while its predecessor root is still briefly connected removed the body DOM but retained `oldRoot.__ebsfSortMenu`. A stale click/rebuild could therefore re-adopt detached menu DOM. `favDisposeSortPortal01526()` now clears both root/menu backlinks in all dispose cases and drops a matching stale state root. A regression covers the two-connected-roots interleaving.

The branch also contained premature package/userscript/cache-buster and release-test promotion to 0.15.26. Those commits were explicitly reverted, preserving the v0.15.25 behavior-gate policy. The final source order remains module 79 before modules 80–106; no later source module assigns `favCreateSort`, `favOpenSortMenu`, or `favCloseSortMenu`.

## 3. Files changed relative to current main

```text
src/79-favorites-sort-layout.js
  Explicit Sort portal owner binding, pruning/disposal, rebuild cleanup, and fenced module-69 open/close lifetime hooks.

tests/favorites-v01526-sort-portal-lifetime.test.mjs
  Regression coverage for detached roots, deferred orphan pruning, 20 replacements, close-after-detach,
  cleared connected-predecessor backlinks, and no-new-observer/lifecycle invariant.

CODEX_HANDOFF.md
  This review packet.
```

After the explicit reversions, `package.json` and all pre-existing release tests match current main. The merge from current main imports only repository documentation.

## 4. Invariants checked

- A detached or already orphaned Sort portal cannot remain hidden under `document.body` indefinitely.
- A disposed menu cannot retain or be retained by a connected predecessor root.
- The current connected menu is preserved while its stale predecessor is pruned.
- Module 69 still owns menu positioning/visibility; module 79 only fences its lifecycle boundary.
- The change adds no MutationObserver, ResizeObserver, polling loop, or duplicate route controller.
- No persistent Favorites data, owner/profile identity, metadata, or grid/pager ownership path is changed.

## 5. Validation

```text
Node 22.23.2 (matches GitHub Actions):
  portal + v0.15.19/20/21/23/24 boundary tests     PASS — 61/61
  node scripts/check.mjs                            PASS — 121 files, 86 modules, v0.15.25
  node scripts/build.mjs                            PASS — Chrome, Firefox, Diagnostics Chrome

Native desktop Node 26.1.0:
  npm test is not a parity signal; VM fixtures fail due Node 26 behavior.
```

The full Node 22 suite retains one pre-existing Windows CRLF-only static-marker failure in `favorites-v01511-count-authority.test.mjs`; Linux CI checks out LF and is the authoritative full-suite gate. All portal and affected release/load-order tests pass locally.

## 6. Artifact audit

The v0.15.25 build produces Chrome, Firefox, and Diagnostics Chrome with 86 shared modules. The userscript places module 79 before modules 80–106, and the generated Chrome/Firefox content artifacts need fresh-CI inspection on the pushed head for the final module-79 hook presence. No delivery-target-specific source was introduced.

## 7. GitHub CI and manual testing

PR #69’s previous green run `33404379002` tested the prematurely promoted identity and predates the stale-backlink fix. Push the repaired branch and require a fresh green `CI and extension builds` run before merge.

Manual browser checks before merge:

1. Repeatedly soft-route or replace the Favorites toolbar while opening/closing Sort; only one Sort menu portal remains in body.
2. Open Sort immediately after a toolbar/root replacement; the visible current menu positions normally.
3. Change sort/layout preferences, then close/reopen; ensure the correct current root/menu remains functional.
4. Repeat in Chrome extension, Firefox extension, and Tampermonkey, and verify no duplicate menus after returning to Favorites.

## 8. Risks and reviewer focus

Review portal disposal when Etsy supplies an unexpected toolbar ownership transition: the patch deliberately relies on natural Sort lifecycle calls rather than global observation. Focus on the new owner-reference clearing branch and on the rule that only detached or module-69-marked orphan menus are removed. Browser Preact root timing remains to be manually exercised.

The branch deliberately does not promote a release, alter visual geometry, or touch PRs #67/#68.

## 9. PROJECT_STATE update and next action

`PROJECT_STATE.md` needs no product-state change: this repairs an audited unmerged behavior candidate, not current-main behavior.

```text
AUDIT PR BEFORE MERGE
```

Next: publish this PR, inspect all three new CI runs/artifacts, then begin an independent current-main Phase 1 audit/reconciliation branch. Do not merge or release-promote individual candidates.
