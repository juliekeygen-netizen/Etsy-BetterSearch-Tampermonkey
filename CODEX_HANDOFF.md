# Etsy BetterSearch — Codex Review Handoff

## v0.15.29 release-promotion candidate

```text
Date: 2026-09-03
Base main SHA: b99f15f32c088ef3bea5853be784817835ffabc4
Base main CI: 33684556447 — SUCCESS
Branch: codex/release-v0.15.29
Implementation heads: 682d66841097e5781f4aa79db3639e5ecd195f56,
9cb916e0118e84534557f6c9ad8c7462172da988
PR: pending publication
BetterSearch: 0.15.28 -> 0.15.29
Diagnostics Chrome: 0.2.9 -> 0.2.10
```

## Why this release is safe to promote

The three user-requested behavior gates have already merged and each passed
the required exact-head CI:

```text
PR #86 — All toolbar/Search parity
Merge: b97496e94cf3835f4d8f9f078000177694ad716f
PR CI: 33667143408 — SUCCESS; main CI: 33672185684 — SUCCESS

PR #87 — Ships from Anywhere visual selection
Merge: 5f935b1810ce3562f6b944fb74c74c6b96888be3
PR CI: 33684095077 — SUCCESS; main CI: 33684153762 — SUCCESS

PR #88 — Diagnostics-guided Favorites/fallback repair
Merge: b99f15f32c088ef3bea5853be784817835ffabc4
PR CI: 33684497406 — SUCCESS; main CI: 33684556447 — SUCCESS
```

PR #88's repaired scope includes native-shaped cache fallback cards, the
collection-prop currentness fence, and persisted Diagnostics capture options.
No raw diagnostic captures or private browser data are tracked.

## Candidate files and release decision

The candidate changes only release identity and release records:

- `package.json`, userscript `@version`, and every `@require ?v=` token are
  aligned to `0.15.29`.
- Diagnostics Chrome manifest and its current-version tests are aligned to
  `0.2.10`.
- Current release-identity assertions are updated; historical narratives stay
  historical.
- `PROJECT_STATE.md` and
  `docs/FAVORITES_V01529_RELEASE_PROMOTION_2026-09-03.md` record the behavior
  gate and release boundary.

## Required candidate validation

Exact candidate validation passed on `9cb916e0118e84534557f6c9ad8c7462172da988`:

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.29
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 579/579
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome 0.15.29, Firefox 0.15.29, Diagnostics Chrome 0.2.10
git diff --check                                        PASS
```

Artifact audit: all 90 userscript `@require` entries use `?v=0.15.29`; the
Chrome and Firefox build manifests report `0.15.29`; Diagnostics Chrome reports
`0.2.10`; and the built modules retain the final collection, card, and
Diagnostics preference owners. Require fresh PR CI, merge this promotion PR,
then require its exact push-triggered `main` CI.

## Next task

After the promotion lands, do browser smoke checks for the newly fixed Etsy UI
paths and continue the documented diagnostic work plan from clean `main`.
