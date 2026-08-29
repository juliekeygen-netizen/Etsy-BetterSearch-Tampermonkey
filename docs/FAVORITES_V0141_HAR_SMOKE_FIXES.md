# Favorites v0.14.1 HAR smoke fixes

This patch release follows the first real logged-in Etsy Favorites smoke test of the v0.14 ownership refactor. The raw HAR is intentionally **not** stored in this repository because it can contain account/session/request data.

## HAR-backed symptoms

The captured test sequence showed all of the following while Etsy's own Favorites requests continued returning successfully:

- the BetterSearch permanent filter rail could fail to appear on All Favorites, while it did appear on a collection route;
- changing BetterSearch Sort could leave the visible results unchanged;
- changing BetterSearch filters could leave the visible results unchanged;
- collection metadata could show a non-zero Favorites total but `0 shown` while native Etsy cards were visibly present.

The broken simple-sort/filter interactions did not coincide with BetterSearch auxiliary/deep metadata requests. This ruled out metadata acquisition as the explanation for basic Title/Price/card-backed sort/filter no-ops.

## Confirmed integration defects

### 1. `shown` was derived from enhancement state rather than visible-grid ownership

The historical shell counted `favState.filtered` whenever `favEnhancementActive()` was true. v0.14 deliberately permits an enhancement to remain active while Etsy's native grid is visible (for example while metadata or a route transition is settling), and `favRestoreNative()` clears `favState.filtered`.

That combination could therefore render `N favorites · 0 shown` while native cards were visible.

v0.14.1 counts the local filtered set only when the BetterSearch sibling grid is physically connected/visible **and** the current native grid is hidden under the explicit v0.14 ownership marker. Otherwise `shown` follows the native total.

### 2. Desktop rail mounting was unnecessarily gated on the content branch

The old shell installer required both `[data-testid="sidebar"]` and the resolved Favorites content sibling before attempting `favInstallPermanentRail0120()`.

Etsy can settle those branches independently. The rail itself only needs the native sidebar host, so v0.14.1 claims the permanent rail as soon as that sidebar exists, before delegating to the rest of the shell installer. The normal idempotent shell pass still completes collection/header/toolbar work when the content branch is available.

### 3. A late legacy module reintroduced local 20-item pagination

The v0.14 ownership release explicitly deferred a dedicated local-pagination architecture and intended enhanced results to render as one local set while Etsy retained ownership of its native pager.

However, historical module `95-favorites-responsive-pagination.js` loads after the earlier shell override and reassigns `favRenderCurrent()` to a 20-item local slice tied to native-page identity.

v0.14.1 reasserts the v0.14 boundary at the end of the module chain: local enhanced results use the complete matched set, local page state is reset, and BetterSearch does not mutate/reuse Etsy's pager.

### 4. Patch fixes were still published behind the `v=0.14.0` userscript dependency cache key

Post-v0.14 source fixes had been merged while the userscript version and all `@require` query strings remained `0.14.0`. A userscript manager could therefore retain cached pre-fix module bodies.

v0.14.1 bumps both package/userscript version and every shared `@require` cache key to `v=0.14.1`.

## Defensive ownership hardening

The HAR cannot directly record DOM reconciliation after a BetterSearch local render, but the symptoms and v0.14 sibling-grid design make late Etsy reconciliation an important boundary to defend.

v0.14.1 therefore adds a bounded render-integrity postcondition:

- it runs only on Favorites;
- it is dataset-keyed;
- it requires a complete current catalogue;
- it does not run while required metadata remains pending;
- it checks the **current Etsy tree** before falling back to a previously captured native-grid reference;
- if enhanced local ownership has been lost, it re-enters `favReapply()` so catalogue/metadata ownership is evaluated again;
- it piggybacks on the existing lifecycle sync signal rather than adding another broad `MutationObserver`.

## Second adversarial audit

A second pass was performed after the initial smoke patch.

### Real issue caught by CI during that audit

The first implementation of the integrity repair directly called `favRenderCurrent()` from the new late module. The existing v0.14 late-ownership test correctly rejected this because post-runtime modules are not allowed to bypass metadata coordination.

The repair was changed to re-enter `favReapply()` instead. This preserves the v0.14 invariant that every late local-render decision passes through current dataset and metadata requirements.

### Additional checks

The audit also verified that:

- BetterSearch filter controls persist their state and call `favReapply()`;
- Sort choices persist their state and `await favReapply()`;
- metadata-pending states remain native and are not force-rendered locally;
- stale dataset completions cannot repair an old route into the current route;
- the integrity check stops once local ownership is healthy, avoiding a successful-render self-loop;
- no new broad DOM observer was introduced;
- the responsive desktop-shell breakpoint is consistently finalized at 760px by the later responsive-shell layer (an initially suspected 760/900px mismatch is therefore not the HAR root cause);
- the v0.14 catalogue crawler, cross-tab ownership, metadata freshness, stale-response, terminal-deep-job and native-card ownership tests remain intact.

## Automated validation

The patch adds focused regression coverage for:

- v0.14.1 cache-busting and module order;
- truthful shown-count ownership;
- early permanent-rail claim;
- neutralizing the legacy 20-item local-pagination override;
- metadata-safe render-integrity repair;
- current-tree native-grid preference;
- native restoration refreshing the header.

Older tests that incorrectly pinned the patch number to exactly `0.14.0` were made patch-release aware while preserving their architectural assertions.

## Manual validation still required

Automated tests and HAR/source analysis cannot replace a logged-in live Etsy DOM test. After installing/updating to v0.14.1, re-test at minimum:

1. All Favorites after a hard refresh: desktop rail is present.
2. A collection: metadata does not say `0 shown` while native cards are visible.
3. An obvious simple sort such as Title A-Z / Z-A: visible ordering changes.
4. A simple card-backed filter: visible results change.
5. Clear the enhancement: Etsy native results restore cleanly.
6. All -> collection -> All soft navigation: rail, count and sort/filter ownership remain correct.

Any remaining live-only regression should be captured with the exact interaction sequence and, when useful, a fresh HAR/DOM snapshot.
