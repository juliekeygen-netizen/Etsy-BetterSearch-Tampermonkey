# Diagnostics valid-empty-state marker — 2026-09-01

## Finding

A private user-provided Diagnostics capture emitted `no-grid-visible` while
Etsy displayed its normal empty-collection presentation. That is a diagnostic
false positive, not a product failure. Raw capture material remains outside
the repository; this record contains no private browsing data.

## Fix

The Diagnostics content script now snapshots Etsy's narrow, structural native
empty-collection card and suppresses the no-grid marker only while that card is
visible. A listing section with neither grid and no visible native empty card
remains a marker condition, so transient/real missing-grid evidence is not
silenced broadly.

The predicate is independently unit-tested for normal missing-grid, valid
native-empty, and document-loading cases. The built Diagnostics artifact was
inspected to confirm it contains that predicate and selector.

## Follow-up

Etsy may change its empty-state DOM. If the marker reappears on a valid empty
collection, update the structural selector using a sanitized capture. The
reported startup rail flicker remains separate and needs focused evidence
before production behavior changes.
