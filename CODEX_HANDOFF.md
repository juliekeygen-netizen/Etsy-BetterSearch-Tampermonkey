# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** production Favorites UI behavior gate, ready for independent review
and publication. It deliberately retains release identity `v0.15.27`.

```text
Date: 2026-09-02
Base main: 9e07e4d335144ce04eaec552ea65db735a3cc96d (v0.15.27)
Base main push CI: 33653744164 — SUCCESS
Branch: codex/fix-collection-toolbar-row-layout
Implementation head: 12eccf05993e63029f97b6351ad613df5983030e
PR: #83 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/83 — OPEN
Published handoff head: e6119881ea15c04fc4c4ec29422b3b37d12415a3
Exact-head CI: queued after PR publication
```

## Verified problem and decision

A private marker screenshot and explicit product request establish a layout
change for desktop collection routes: the collection identity controls and
privacy/count metadata should occupy the first row; Sort, Settings, and Search
should occupy the next row, matching the existing All header. This is a visual
policy request, not a speculative fix for the separate native/local handoff.

The final production owner is `favApplyExactSearchWidth0135` in
`src/103-favorites-v0157-diagnostics-fixes.js`, loaded after the stable shell
and earlier header/layout layers. Its established stack path safely clears the
desktop width/translation ownership and expands the existing toolbar row. The
patch makes that path unconditional only for non-`items` collection scopes on
desktop. It does not reparent Etsy metadata, alter collection navigation, or
change filters, search, rendering, or persistence.

No raw diagnostic archive, screenshot, account/listing data, URLs, or marker
note text is tracked.

## Files changed

```text
src/103-favorites-v0157-diagnostics-fixes.js
  Adds an explicit force-stack plan input and uses it for desktop collection
  scopes, so the native identity/visibility row precedes the toolbar.

tests/favorites-v0157-diagnostics-fixes.test.mjs
  Proves the wide collection plan stacks while the equivalent non-forced plan
  remains inline, and asserts the final scope policy.

ACTIVE_WORK.md / PROJECT_STATE.md / CODEX_HANDOFF.md
  Sanitized current-state and reviewer packet updates.
```

## Validation and artifact audit

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.27
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 570/570
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                         PASS
```

The built Chrome and Firefox `content.js` artifacts both contain the final
`forceStack:favScope().type !== 'items'` decision in module 103. Both build
manifests report `0.15.27`; Diagnostics remains `0.2.9`.

## Remaining browser check and reviewer focus

Verify a wide desktop collection, a narrow desktop/tablet collection, and All
Items. On a collection, the title/edit/add plus privacy/count row must remain
above a full-width Sort/Settings/Search row, with no clipping. All Items must
keep its existing separate All header. Also verify a route change does not
leave stale inline width or transform on the next header.

Review that `forceStack` reaches only the final geometry planner, rather than
changing native DOM ownership. The next work is either to merge this audited
behavior gate and perform release promotion, or to gather the repaired rapid
Diagnostics capture for the still-unproven collection-selector handoff issue.
