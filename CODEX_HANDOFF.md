# Etsy BetterSearch — Codex Review Handoff

## 1. Task identity

```text
Date/time: 2026-09-01 (Europe/Helsinki)
Task: post-v0.15.25 runtime reconciliation + duplicate Favorites runtime owner
Base main SHA: 614ec3d26caa3ce9602b2e47261a15359e24be4a
Branch: audit/favorites-v01526-runtime-reconciliation
Implementation head: 72862b68b898173b7b44f105105781b7bfcf6079
PR: pending publication from this handoff commit
Release identity: v0.15.25 behavior gate; no version/cache-buster promotion
Dependencies: none; independent of open PRs #67–#72
```

## 2. Problem and evidence

The post-v0.15.25 audit traced current final owners instead of replaying older
findings. It confirmed the shipped v0.15.19–v0.15.25 boundaries for
multi-owner membership, atomic rows, immutable generations, catalogue fencing,
query acknowledgement, metadata context, and native-heart confirmation.

One live source-proven gap remained: Tampermonkey and the production extension
run in separate JavaScript worlds, while no shared DOM-visible Favorites owner
existed. Their independent `favState` flags could therefore both start UI,
observers, local rendering, and deep-queue work on one Etsy document.

`docs/FAVORITES_V01527_RUNTIME_RECONCILIATION_2026-09-01.md` contains the
complete status table, open-PR reconciliation, stale count-branch conclusion,
and the exact sources reviewed. No private Etsy data was added.

## 3. Changes

```text
src/60b-favorites-runtime-owner.js                  document-lifetime first-runtime-wins marker
etsy-bettersearch.user.js                           loads the owner boundary after Favorites state
src/63-favorites-runtime.js                         inactive copies cannot start runtime or intercept local cards
src/83-favorites-cross-page-queue.js                inactive copies cannot resume/mark deep work
tests/favorites-v01527-runtime-owner.test.mjs       isolated-world owner, inert, unavailable-marker, order regressions
docs/FAVORITES_V01527_RUNTIME_RECONCILIATION_2026-09-01.md  current audit table
ACTIVE_WORK.md                                      reconciled live PR heads/CI queue
PROJECT_STATE.md                                    current audit interpretation and owner invariant
CODEX_HANDOFF.md                                    this review packet
```

The marker is installed immediately after `60-favorites-state.js`, before all
Favorites identity/data/runtime modules. Chrome and Firefox derive that same
module order from the userscript. Diagnostics remains separate and does not
load the shared production module chain.

## 4. Invariants checked

- The marker stores no owner/profile/query/listing data and lasts only for the
  current document; navigation creates a fresh election.
- A losing runtime fails closed through `isFavoritesPage()`, runtime startup,
  transplanted-card capture, and module83 queue resume/pagehide guards.
- The change does not alter membership, IndexedDB rows, catalogue leases,
  query generation, metadata context, native/local render authority, or native
  heart persistence.
- First runtime wins deliberately; no preference is inferred between extension
  and userscript. Diagnostics remains observational.

## 5. Local validation

```text
Node 22 focused current-boundary suite: PASS — 67/67
  (v0.15.18 config, v0.15.22 coordinator, v0.15.23 query,
   v0.15.24 metadata, v0.15.25 heart, v0.15.27 owner)
npx --yes --package=node@22 node scripts/check.mjs: PASS
  122 files; 87 userscript modules; 945 versioned symbols
npx --yes --package=node@22 node scripts/build.mjs: PASS
  Chrome, Firefox, Diagnostics Chrome
npx --yes --package=node@22 node --test tests/*.test.mjs:
  517/518 passed; one pre-existing Windows CRLF-only static-marker failure in
  tests/favorites-v01511-count-authority.test.mjs before behavior execution
git diff --check: PASS
```

The failing static test searches an LF-only marker in a working-tree source
checked out with CRLF. The exact GitHub Linux baseline `main`
`4d0e0317d58711a5e1603ae8d2bf608c3f285c3b` passed run `33391628427`; no
behavioral test failed locally. Its portability repair is intentionally not
mixed into this runtime-owner gate.

## 6. CI and artifact audit

PR CI is pending publication. The required workflow is `CI and extension
builds`; it must test the published branch head, including whitespace, full
Node 22 suite, Chrome/Firefox/Diagnostics builds, and artifacts.

Local built-artifact inspection confirmed:

```text
dist/chrome/content.js: 60b marker at line 4772; runtime start at 14348; queue resume at 15725
dist/firefox/content.js: identical marker/runtime/queue ordering and line positions
Chrome/Firefox BUILD_INFO: v0.15.25, 87 modules, 60 -> 60b -> 60a
dist/diagnostics-chrome/BUILD_INFO: independent Diagnostics source list; no production marker
```

## 7. Manual browser testing still required

Use a disposable profile with production extension + Tampermonkey userscript
enabled together. On own Favorites All and a collection, verify one rail,
toolbar, grid controller, and deep worker; the losing delivery should issue one
clear warning. Repeat after Etsy soft navigation and BFCache Back/Forward.
Then run each production delivery alone and Diagnostics alongside it.

## 8. Diff/risk review

Implementation/audit commit changes eight files: one new early module, three
narrow integration guards/wiring, one regression suite, and three current-state
documents. No generated artifacts or private Diagnostics material are tracked.
No release identity churn occurred.

Primary review focus: confirm that first-runtime-wins is acceptable for an
unsupported dual-install configuration, and verify all persistent Favorites
entry points are inert in the second isolated world. Browser validation is
needed because module fixtures cannot reproduce real userscript/content-script
injection timing.

## 9. Recommended next action

```text
AUDIT PR BEFORE MERGE
```

After CI, review this behavior gate independently. While it waits, use a new
clean-main branch for the isolated CRLF static-test portability repair or a
separate source-proven task; do not overlap PRs #67–#72.
