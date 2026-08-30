# Favorites v0.15.12 atomic render ownership

Status: release implementation for the Phase 2E render-generation and grid/pager ownership audit.

## Problem proven by browser evidence

A historical Diagnostics capture showed a stale BetterSearch local result reclaiming visible ownership after Etsy had already restored useful native cards. During the transition, native/local grid visibility and pager ownership could disagree, and the local view could present an empty result while Etsy had valid current results.

The source audit found the corresponding unsafe ordering:

- module 95 could suppress the native pager as a side effect of entering local mode;
- module 101 integrity repair could call the local visual-ownership helper before proving the mounted local result signature current;
- the historical renderer could hide the native grid before final currentness/ownership proof;
- v0.15.11's final count-authority override unintentionally superseded module 101's shown-count gating, so a stale filtered `shown` value could again be advertised while native Etsy content was visible.

## v0.15.12 ownership contract

Module 105 is the final render-integration boundary after module 104.

A local render now follows this order:

1. Confirm the requested catalogue/load and metadata coverage are current.
2. Build the BetterSearch local grid while it is hidden and inert.
3. Build/stage the BetterSearch-owned local pager while it is hidden and inert.
4. Sign the current request/data/view/page state.
5. Re-read the state and validate the token, staged grid, pager and metadata evidence.
6. Only then allow the historical visual-ownership helper to suppress Etsy's native grid/pager.
7. Reveal the local grid/pager and publish render status/signature and shown count in the same synchronous JavaScript turn.
8. On stale evidence, staging failure or render error, release ownership back to Etsy instead of publishing the local result.

Integrity repair is proof-first. Merely finding a connected local grid is no longer permission to hide Etsy again.

## Signed state

The transaction distinguishes catalogue identity from local view identity. The request/token includes bounded revisions or hashes for:

- dataset identity;
- scope/view-query identity;
- active load identity;
- committed native-query generation;
- committed snapshot generation/timestamps;
- normalized filter/sort configuration;
- metadata delivery destination and required capability set;
- metadata coverage generation;
- stable record ID/order revision;
- native view/listing-ID fingerprint;
- filtered result ID/order signature;
- local page/page-size/page-count.

Partial observation timestamps such as `lastObservedAt`/`indexObservedAt` are deliberately excluded from stable catalogue identity so harmless observations do not churn ownership.

## Strict/Multi local-page correction

The full catalogue dataset intentionally remains unqueried for Strict/Multi local filtering. Therefore dataset identity alone cannot decide whether the current local page remains valid.

v0.15.12 includes `favScopeKey()` in local-result request identity, so changing the live Strict/Multi search resets BetterSearch local results to page 1 even though the underlying catalogue key stays the same. Re-rendering the same query preserves an intentional local page.

## Pager and accessibility contract

For multi-page local ownership, the local pager must be connected, current, visible, non-inert and not `aria-hidden`. A hidden/inert staged pager cannot satisfy committed ownership.

For a one-page local result there must be no local pager. Native and local page state remain semantically separate.

## Count authority correction

v0.15.11 remains the source of the authoritative Favorites total. v0.15.12 wraps that final count owner only for `shown` semantics:

- total keeps v0.15.11 provenance;
- filtered `shown` is trusted only while the signed local render is actually authoritative;
- otherwise `shown` falls back to the authoritative total/native presentation.

This restores the safety property that module 101 previously provided before module 104 superseded its count wrapper.

## Regression coverage

`tests/favorites-v01512-atomic-render.test.mjs` covers:

- final module ordering;
- ownership-gate enforcement;
- stage-before-commit ordering;
- token/metadata/pager/grid validation;
- safe reuse of the module-95 pager presentation;
- proof-first integrity repair;
- catalogue vs local-search identity;
- exclusion of noisy observation timestamps;
- Strict-query local-page reset;
- committed pager visibility/accessibility;
- final shown-count gating;
- teardown of transaction/staging state;
- no new MutationObserver or polling loop.

The behavior-only PR gate was run before changing release identity. After correcting two test-harness assumptions, the exact behavior head passed repository checks, the full test suite, Chrome/Firefox/Diagnostics builds, and all artifact uploads.

## Follow-up

The next separate audit branch is Phase 2F no-op DOM reconciliation. Existing evidence still points to avoidable repeated writes/replacements in scope/header text, collection metadata header reconstruction and some geometry ownership writes. These are intentionally not mixed into the render-ownership release.
