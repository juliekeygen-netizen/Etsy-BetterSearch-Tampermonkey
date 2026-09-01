# Favorites v0.15.26 release integration — 2026-09-01

## Scope

This release integrates the seven post-v0.15.25 behavior gates that were kept
unmerged for independent review: PRs #67, #68, #69, #71, #72, #73, and #74.
Their original exact heads and green CI are retained in GitHub. Intermediate
identity-promotion commits from the individual behavior branches were not
integrated; release identity is promoted once, after combined proof.

## Final production boundaries audited

- The module60b document marker activates one production Favorites runtime and
  prevents later duplicate delivery copies from starting runtime or queue work.
- Module61ac handles an IndexedDB `versionchange` before later cached-open
  wrappers, closes the old connection, and invalidates all known opener caches.
- Module79 owns the final sort-portal open/close lifetime wrapper.
- Module94a replaces the collection lifecycle at its native-boundary point and
  fences owner, route, and operation generation across asynchronous refresh.
- Module107 owns native-heart confirmation; module108 then defers only
  interactive text-control rail refreshes while a draft is focused.

## Combined behavior evidence

On the integration branch while still at v0.15.25:

```text
npx --yes --package=node@22 node scripts/check.mjs  PASS (125 files, 90 modules)
npx --yes --package=node@22 node --test tests/*.test.mjs  PASS (565/565)
npx --yes --package=node@22 node scripts/build.mjs  PASS (Chrome, Firefox, Diagnostics)
```

The built Chrome and Firefox bundles were inspected for the runtime-owner,
DB-opener, sort-portal, heart, and focused-rail final assignments. Both target
manifests reported v0.15.25 during the behavior gate; Diagnostics remained
separately versioned at 0.2.9.

## Release promotion

The release candidate changes only the shared BetterSearch identity to v0.15.26:
`package.json`, userscript `@version`, every userscript `@require` cache-buster,
and tests whose assertions intentionally track the current release identity.
Historical release narrative documents are left unchanged.

The exact release head passed GitHub Actions run `33520794029`, including patch
whitespace, repository checks, tests, builds, and Chrome/Firefox/Diagnostics
artifact uploads. It merged through [PR #75](https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/75)
as `main` commit `4c42b36cd51f328f24d2bd8e59c8468ac4cb67e5`; the required
push CI run `33520898859` also succeeded.

Browser smoke testing remains valuable for Etsy timing/selectors and the
cross-delivery duplicate-runtime case; no private browser data is included.
