# Etsy BetterSearch — Codex Review Handoff

## Current handoff status

**Status:** the Diagnostics rapid-trace behavior gate is being reconciled with
the current `main` after PRs #77 and #78 merged. It changes Diagnostics only;
production release identity remains v0.15.26 and Diagnostics remains v0.2.9.

```text
Date: 2026-09-02
Base main: 3f019e1998b849af2d3378236fff69743a7183f9
Branch: codex/feature-diagnostics-burst-trace
Original behavior head: 1dabdd5fe10d1b5eb58b3895031ac6acf0d49cb5
PR: #79 — https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/pull/79 (OPEN)
Original PR CI: 33640572093 — SUCCESS
Integration validation / CI: pending
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

Before current-main integration, the original behavior head passed Node 22
repository checks, all-target builds, 567 tests, and GitHub Actions run
`33640572093`. The current integration requires a full Node 22 check, suite,
build, artifact inspection, and fresh exact-head CI before merge.

## Reviewer focus and next action

Review the option rehydration map and the streaming exporter’s binary JPEG
path: the export must retain bounded frame trace text and each valid screenshot
without reconstructing a whole recording in memory. After fresh CI is green,
merge #79, then use the repaired Diagnostics build to capture the collection
handoff again before changing final production navigation or grid ownership.
