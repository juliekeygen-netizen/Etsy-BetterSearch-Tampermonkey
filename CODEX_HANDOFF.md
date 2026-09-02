# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** documentation-only audit. No production or Diagnostics code was
changed because the observed collection transition is source-proven full
navigation and a SPA workaround is unsafe without a focused browser capture.

```text
Date: 2026-09-02
Base main: 936325e0b70723005fc8c05dacbb3534ff0c2236 (v0.15.27)
Base main push CI: 33642624166 — SUCCESS
Branch: codex/audit-collection-handoff
Audit content head: ac7e5373cca6ec686beb7c51080dcc87aa1f28c1
PR: pending publication
CI: pending publication
```

## Verified conclusions

Private Diagnostics evidence showed a native-to-BetterSearch transition during
collection changes and reported missing collection selectors. The final
production collection-pill owner, `favBindCollectionLink0128` in
`src/94-favorites-native-boundary.js`, prevents the copied pill's default
event, stops propagation, then uses `location.assign(link.href)`. A collection
click therefore replaces the document; the recorded native shell followed by
BetterSearch reinstallation is expected from that explicit route boundary.

There is no source proof that a synthetic History API route or a fetched DOM
swap would leave Etsy's native collection/grid/pager current. Such a patch
could violate the local/native rendering/currentness invariant, so this audit
does not make that speculative change.

## Changes

```text
docs/FAVORITES_DIAGNOSTIC_HANDOFF_AUDIT_2026-09-02.md
  Sanitized diagnosis, boundaries, and exact repaired-Diagnostics repeat
  capture protocol.

ACTIVE_WORK.md / PROJECT_STATE.md
  Records merged v0.15.27 state and the collection-handoff evidence boundary.

CODEX_HANDOFF.md
  This packet.
```

No private raw diagnostics, screenshots, URLs, listing/account data, or marker
notes are tracked.

## Validation and reviewer focus

```text
npx --yes --package=node@22 node scripts/check.mjs  PASS — 125 files / 90 modules, v0.15.27
git diff --check                                     PASS
```

Review that the audit accurately distinguishes the source-proven full-document
handoff from the still-unproven questions: whether Etsy's native navigation
can safely route copied pills softly, whether the collection strip is missing
after settling, and the exact filter ownership timing. The next action is a
focused repeat capture with all three rapid Diagnostics options enabled, not a
production routing patch.
