# Etsy BetterSearch — Codex Review Handoff

## 1. Task identity

```text
Date/time: 2026-08-31 (Europe/Helsinki)
Task summary: Audit and repair live PR #68, the focused Favorites rail-refresh behavior gate.
Base product SHA: 4d0e0317d58711a5e1603ae8d2bf608c3f285c3b (v0.15.25)
Current documentation main merged: 614ec3d26caa3ce9602b2e47261a15359e24be4a
Branch: fix/favorites-v01526-focused-rail-refresh
Implementation snapshot validated locally: e079a55
PR: #68 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/68
PR state: OPEN
Release identity: restored to 0.15.25 behavior gate; no standalone v0.15.26 promotion
Dependencies: none. Do not combine with PRs #67/#69 until independent review selects approved behavior gates.
```

The handoff document is committed after the validated snapshot; inspect the live PR head for the exact review commit.

## 2. Evidence and decision

The live GitHub queue is authoritative over stale `ACTIVE_WORK.md` labels: PR #68 is the focused-rail branch. Its behavior is source-proven: the permanent rail preserves its root but `favRefreshRail()` rebuilds all children, so an asynchronous refresh can detach a focused text/number/range draft before the existing change/blur handler commits it to `favCfg`.

`src/108-favorites-v01526-focused-rail-refresh.js` is the final semantic owner. It captures the prior refresh owner, defers only when a connected, enabled, writable draft-capable editor inside the live rail has focus, coalesces calls to the latest arguments, and flushes after focusout on the next task. A focus transfer to another draft editor re-defers; checkbox/radio/select/button paths stay immediate. An immediate refresh invalidates a stale deferred callback.

The existing branch had prematurely promoted package/userscript/cache-busters and historical release-identity tests to 0.15.26 despite its PR body and release plan specifying a v0.15.25 behavior gate. Those promotion commits were reverted with new commits; production focused-rail behavior and its regressions remain unchanged.

The ordered final chain is module 107 → module 108 → modules 102–106. A source-wide assignment search found no later `favRefreshRail` reassignment after module 108.

## 3. Files changed relative to current main

```text
etsy-bettersearch.user.js
  Adds module 108 immediately after native-heart confirmation and before final ownership modules; remains v0.15.25.

src/108-favorites-v01526-focused-rail-refresh.js
  Final focused-draft refresh guard.

tests/favorites-v01526-focused-rail-refresh.test.mjs
  Focused editor, coalescing/latest-args, editor transfer, immediate controls, disabled/read-only,
  stale callback, and load-order regressions.

CODEX_HANDOFF.md
  This review packet.
```

`package.json` and historical release tests are unchanged relative to current main after explicit reversions of the premature promotion commits. The documentation merge carries no production code change.

## 4. Invariants checked

- Draft input state is not destructively detached before existing blur/change handlers can commit it.
- Checkbox/radio/select/button state is not unnecessarily delayed.
- The live rail root must be connected and contain the active editor; stale/detached controls cannot hold refreshes.
- Coalescing preserves only the latest requested refresh, and stale focusout callbacks cannot resurrect an old refresh.
- Module order preserves native-heart confirmation followed by this narrow UI wrapper, then existing final ownership/metadata/render boundaries.
- No observer, persistent state owner, route lifecycle system, or delivery-target-specific code was added.

## 5. Validation

```text
Node 22.23.2 (matches GitHub Actions):
  focused rail + v0.15.19/20/21/23/24 release tests  PASS — 61/61
  node scripts/check.mjs                              PASS — 122 files, 87 modules, v0.15.25
  node scripts/build.mjs                              PASS — Chrome, Firefox, Diagnostics Chrome

Native desktop Node 26.1.0:
  npm test is not a parity signal; VM fixtures fail due Node 26 behavior.
```

The full Node 22 suite is expected to have the same one pre-existing Windows CRLF-only marker failure in `favorites-v01511-count-authority.test.mjs`; its Linux CI checkout uses LF and remains the authoritative full-suite gate. No focused-rail test or relevant release assertion failed locally.

## 6. Artifact audit

The v0.15.25 build reports 87 shared modules and emits all Chrome, Firefox, and Diagnostics Chrome targets. The userscript and builders place module 108 after module 107 and before modules 102–106. Review the generated Chrome/Firefox content artifacts after the fresh CI run to confirm the same final assignment boundary on the pushed head.

## 7. GitHub CI and manual browser testing

PR #68’s previously green run `33400241223` tested the prematurely promoted identity and is not the final result for this repaired behavior-gate head. Push the branch and require a new green `CI and extension builds` run before merge.

Manual browser checks before merge:

1. Type a partial number/text/range filter value, allow metadata or route/cache refresh activity, then blur: the typed value must commit before one rail refresh.
2. Move focus directly from one draft editor to another: neither editor is rebuilt mid-edit.
3. Toggle checkbox/radio/select controls and invoke filter actions: refresh remains immediate.
4. Repeat on desktop Chrome, Firefox, and Tampermonkey; verify mobile/drawer behavior remains unchanged.

## 8. Risks and reviewer focus

Review whether any valid draft-capable control is omitted from the selector, especially Etsy or future custom controls with nonstandard types. Confirm a re-render cannot leave an obsolete focusout listener with live effects; the target identity guard is intended to prevent that. No real Etsy focus timing has been captured yet.

The branch deliberately does not redesign the rail, promote a release, change `favCfg` persistence, or alter PRs #67/#69.

## 9. PROJECT_STATE update and next action

`PROJECT_STATE.md` needs no product-state change: this is a reviewed existing behavior gate, not a new current-main finding.

```text
AUDIT PR BEFORE MERGE
```

Next: audit/repair PR #69’s Sort portal behavior gate, then create a separate current-main audit branch for Phase 1 reconciliation. Do not merge or release-promote individual v0.15.26 candidates.
