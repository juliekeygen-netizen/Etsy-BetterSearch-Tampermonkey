# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** Diagnostics-only behavior gate, ready for independent review and
publication. Production BetterSearch code and release identity are unchanged.

```text
Date: 2026-09-02
Base main: ee2abc8319c0883945bedfc9f016de4b05039ffd (v0.15.27)
Base main push CI: 33643152934 — SUCCESS
Branch: codex/fix-diagnostics-active-option-restore
Implementation head: 699ad74e06b431cbe44df38f06c2dec20320e76e
PR: pending publication
Exact-head CI: pending publication
```

## Verified problem and decision

A new private focused capture contained three user marker snapshots and their
notes. It also showed that all three opt-in rapid capture controls were
unchecked while recording, and its summary contained zero animation-frame
trace windows and zero marker screenshot bursts. That capture cannot establish
whether a sub-frame Favorites transition occurred.

The source cause is load order: `content.js` has option rehydration, but the
later-loaded `controls.js` is the final recorder-panel/action owner. Its
replacement panel did not copy `session.options` before the active controls
were locked. This branch adds the same narrow option-to-checkbox reconciliation
in that final owner, called from every UI sync. It does not overwrite idle
preferences or alter the authoritative background session.

No raw archive, screenshot, network data, account/listing data, URLs, or
marker-note text is tracked.

## Files changed

```text
diagnostics-extension/controls.js
  Rehydrate all durable active-session capture options, including fast frame
  trace, problem screenshot burst, and semantic mismatch markers.

tests/diagnostics-controls.test.mjs
  Regression coverage for the final controls owner and its load boundary.

tests/diagnostics-recorder.test.mjs
  Corrects the older test description: content keeps options available, while
  the final controller owns replacement-panel presentation.

ACTIVE_WORK.md / PROJECT_STATE.md
  Sanitized reconciliation of the new private capture and next evidence step.
```

## Validation and artifact audit

```text
npx --yes --package=node@22 node scripts/check.mjs       PASS — 125 files, 90 modules, v0.15.27
npx --yes --package=node@22 node --test tests/*.test.mjs PASS — 570/570
npx --yes --package=node@22 node scripts/build.mjs       PASS — Chrome, Firefox, Diagnostics Chrome
git diff --check                                         PASS
```

Built Diagnostics artifact audit: `dist/diagnostics-chrome/controls.js`
contains `restoreActiveSessionOptions` and invokes it with
`ui.session?.options` before controls are disabled; its manifest remains
Diagnostics `0.2.9`. This behavior gate intentionally does not bump BetterSearch
`0.15.27`.

## Remaining browser check and reviewer focus

Reload the unpacked `dist/diagnostics-chrome` extension, enable all three
rapid options, press **Record & Reload**, and verify they stay visibly checked
and disabled while recording. Mark a focused problem, wait at least 1.2 seconds
after the marker, then export: the summary should report one or more frame
trace windows and ten burst screenshots per marker when Chrome permits CDP
screenshots.

Review the final-owner boundary in `controls.js`, especially that active
session options only update presentation and do not mutate user choices before
recording. The next independent task is the requested collection sort/search
row layout, after tracing its final production DOM owner; do not change
collection routing without repaired rapid-transition evidence.
