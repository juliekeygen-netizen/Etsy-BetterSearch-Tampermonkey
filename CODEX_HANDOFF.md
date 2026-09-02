# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** the Diagnostics rapid-trace behavior gate has been reconciled and
locally validated on current `main` after PRs #77 and #78 merged. It changes
Diagnostics only; production release identity remains v0.15.26 and Diagnostics
remains v0.2.9.

```text
Date: 2026-09-02
Base main: 3f019e1998b849af2d3378236fff69743a7183f9
Branch: codex/feature-diagnostics-burst-trace
Original behavior head: 1dabdd5fe10d1b5eb58b3895031ac6acf0d49cb5
Validated integration head: b1d5e1fc00667dd86030f5a7ac9923f0bf15685e
PR: #79 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/79 (OPEN)
Original PR CI: 33640572093 — SUCCESS
Integration CI: pending push of this documentation update
```

## Problem and evidence

The user supplied private Diagnostics archives, marker notes, and image-frame
exports. They are deliberately untracked. The capture proved two Diagnostics
defects:

- After **Record & Reload**, durable recorder options remained active but the
  replacement panel visually showed every checkbox unchecked.
- Events for frame traces and marker screenshot bursts were captured but the
  final streaming ZIP exporter omitted both families, so the archive contained
  neither `timeline/frame-traces.ndjson` nor burst images.

The private evidence also shows native-to-local Favorites handoff during
refresh and collection navigation. That production behavior is not changed by
this Diagnostics-only gate.

## Changes

```text
diagnostics-extension/content.js
  Adds opt-in animation-frame geometry/card/semantic trace sampling (3.2 s
  before + 1.2 s after a marker), screenshot-burst and semantic-marker controls,
  and rehydrates all durable options into the replacement panel after reload.

diagnostics-extension/background.js
  Captures ten marker-burst screenshots and records trace/burst summary counts.

diagnostics-extension/background-streaming-export.js
  Exports frame traces to timeline/frame-traces.ndjson and burst JPEGs under
  each marker directory in the final streaming ZIP.

tests/diagnostics-recorder.test.mjs
  Covers the opt-in capture/export wiring, reload option rehydration, and the
  valid-native-empty-state predicate merged from #78.
```

No private payloads, screenshots, notes, listing data, or account identifiers
are tracked. The trace only runs when its new explicit option is selected.

## Validation / artifacts

The current-main integration head passed:

```text
npx --yes --package=node@22 node --test tests/diagnostics-recorder.test.mjs  PASS — 14/14
npx --yes --package=node@22 node scripts/check.mjs                            PASS — 125 files / 90 modules
npx --yes --package=node@22 node --test tests/*.test.mjs                      PASS — 569/569
npx --yes --package=node@22 node scripts/build.mjs                            PASS — Chrome, Firefox, Diagnostics
git diff --check                                                               PASS
```

The built Diagnostics artifact was inspected: it contains the valid native
empty-state guard, `restoreSessionOptions`, trace collection and
`timeline/frame-traces.ndjson`, the marker-burst JPEG writer, and both summary
counters. A fresh exact-head CI run remains required after this documentation
commit.

## Reviewer focus and next action

Review the option rehydration map and the streaming exporter’s binary JPEG
path: the export must retain bounded frame trace text and each valid screenshot
without reconstructing a whole recording in memory. After fresh CI is green,
merge #79, then use the repaired Diagnostics build to capture the collection
handoff again before changing final production navigation or grid ownership.
