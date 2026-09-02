# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** release-promotion gate for BetterSearch `v0.15.28`, ready for
independent review and publication after the merged Diagnostics and collection
toolbar behavior gates.

```text
Date: 2026-09-02
Base main: ab6335f3755c61cf208535ba301e99587848f565 (PR #83 merge)
Base main push CI: 33654028937 — SUCCESS
Branch: codex/release-v0.15.28
Implementation head: a31670b4dfb4221fdd1e5df64e66a926efd30589
PR: #84 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/84 — OPEN
Published handoff head: 69d82766e75d02ab5c60ff60d279a29a4bab2b80
Exact-head CI: queued after PR publication
```

## Release contents and decision

This is release identity promotion only. The behavior it releases is already
on `main` and has passed its post-merge CI:

- PR #82: the final Diagnostics controls owner restores durable active capture
  options after Record & Reload (`9e07e4d`, main CI `33653744164`);
- PR #83: desktop collection identity/visibility precedes the Sort/Settings/
  Search row (`ab6335f`, main CI `33654028937`).

The promotion updates BetterSearch from `0.15.27` to `0.15.28` in
`package.json`, the userscript metadata, every one of the 90 module
`@require` cache-busters, and only the tests that explicitly assert release
identity/load order. Diagnostics stays independently versioned at `0.2.9`.

## Files changed

```text
package.json / etsy-bettersearch.user.js
  v0.15.28 package/userscript identity plus 90 aligned @require cache-busters.

tests/favorites-v01519-*.test.mjs through v01526-*.test.mjs
  Legitimate release-identity assertions updated to v0.15.28; behavioral
  regression semantics are unchanged.

ACTIVE_WORK.md / CODEX_HANDOFF.md
  Release promotion state and durable reviewer packet.
```

## Validation and artifact audit

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.28
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 571/571
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                         PASS
```

Built artifact audit confirms: package/userscript/Chrome/Firefox are all
`0.15.28`; the userscript has 90 `@require` lines and zero stale `?v=0.15.27`
tokens; Diagnostics remains `0.2.9` with companion BetterSearch version
`0.15.28`.

## Reviewer focus and post-merge gate

Review the version-only diff for accidental source changes and verify every
delivery target reports `0.15.28` after building. Once exact-head CI is green,
merge this promotion; then verify the mandatory push-triggered `main` CI on the
actual merge SHA before declaring the release complete. Manual browser checks
remain: the collection two-row desktop layout and a short Diagnostics capture
with all rapid options selected.
