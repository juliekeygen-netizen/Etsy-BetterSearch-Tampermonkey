# Favorites v0.15.29 release promotion — 2026-09-03

## Behavior gate already merged

The release candidate promotes three independently validated fixes now present
on `main`:

- PR #86: All Favorites receives the requested toolbar row and the native
  Search clear button keeps its correct placement.
- PR #87: the neutral Ships from -> Anywhere choice remains visibly selected.
- PR #88: cache fallback cards follow Etsy's card structure more closely,
  stale collection props cannot contaminate a destination collection, and
  Diagnostics capture options persist through an ordinary reload.

The exact merged `main` head before promotion is
`b99f15f32c088ef3bea5853be784817835ffabc4`; its push CI run `33684556447`
passed checks, tests, builds, and the Chrome/Firefox/Diagnostics artifact
uploads.

## Promotion scope

The candidate changes release identity only:

- BetterSearch: `0.15.28` -> `0.15.29` in `package.json`, the userscript
  metadata, every versioned `@require` cache-buster, and current identity
  assertions.
- Diagnostics Chrome extension: `0.2.9` -> `0.2.10` in its manifest and the
  corresponding current-manifest assertions.

Historical release narratives deliberately retain their historical versions.
No private diagnostic capture, page HTML, screenshot, account identifier, URL,
listing metadata, or user marker note belongs in this release.

## Release gate

Before merge, run the repository check, all tests, and all delivery builds on
the exact candidate head, audit version/cache-buster alignment and generated
Chrome/Firefox/Diagnostics artifacts, then require the exact PR CI result.
After merge, require the push-triggered `main` CI run on the real merge SHA.

Manual Etsy smoke testing remains valuable for selector/timing behavior, but
does not replace these delivery checks.

## Release result

The promotion merged through [PR #89](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/89)
as `d56664c2d23f5b484e22cfdc1fe2c63e2e8f4216`. Exact PR CI run
`33685077464` and the required push-triggered `main` run `33685137704` both
passed checks, 579 tests, all delivery builds, and their artifacts. The
released identities are BetterSearch v0.15.29 and Diagnostics Chrome v0.2.10.
