# Favorites status/progress idempotence audit — 2026-08-30

Status: focused source audit of current v0.15.1 status/progress presentation writers after the earlier Diagnostics capture reported large same-value DOM mutation volume.

No runtime code is changed by this document.

## Summary

Current source still contains many presentation writers that assign text, attributes, hidden state, and CSS custom properties without checking whether the desired value already matches the DOM.

This does **not** mean every old writer conflict from the captured build is still live. One important correction from this pass is that the final Settings UI now uses the newer `favoritesCoverage` / `deepCoverage` fields; the exact historical `coverage` formatting alternation should not be claimed as a current v0.15.1 bug without a fresh capture.

The current problem is broader and simpler: repeated same-value writes remain common.

---

## 1. Sync/deep progress writers rewrite text and ratio on every render call — SOURCE-PROVEN

The Favorites progress implementations repeatedly assign:

```text
textContent
--ebsf-sync-ratio
```

when sync/deep state is rendered.

Even if the visible progress string and ratio are unchanged between two state notifications, the DOM writer does not consistently compare before writing.

The same pattern exists in the final header progress node from module 97:

```text
node.textContent = text
--ebsf-progress-top0134
--ebsf-progress-height0134
```

### Required pattern

Use small setter helpers:

```text
setTextIfChanged(node, value)
setAttrIfChanged(node, name, value)
setStyleIfChanged(node, property, value, priority)
setHiddenIfChanged(node, bool)
```

These helpers should be boring and centralized; the benefit is that all future reconcile code naturally becomes DOM-idempotent.

---

## 2. Settings status refresh still rewrites all reported values — SOURCE-PROVEN

The final Settings status implementation calculates current Favorites/shop/deep metadata values and assigns them to the status nodes.

It correctly guards against an outdated async Settings layer by checking that `favState.settingsModal` is still the same layer after awaiting IndexedDB stats.

However, it still assigns each `textContent` value even when the value did not change.

That is a correctness-safe pattern but contributes to the same avoidable mutation volume identified in Diagnostics.

---

## 3. The exact historical Settings coverage ping-pong is not proven current — IMPORTANT CORRECTION

Earlier Diagnostics evidence captured one status/coverage node alternating rapidly between different formatting conventions while the underlying values were unchanged.

Current v0.15.1 source has since evolved:

- module 68's final Settings UI exposes `favoritesCoverage` and `deepCoverage`;
- later Phase-5 hardening layers wrap that status function rather than restoring the original early `coverage` field.

Therefore the prior recording remains evidence that historical layers fought over UI ownership, but this audit does **not** claim the identical `— / N` vs `0 / N` ping-pong still exists on current main.

A fresh browser capture is required before asserting that exact visible alternation remains.

---

## 4. Header/meta writers remain a larger current source of same-value mutation

Other audit documents already prove that final All/collection metadata writers can rebuild or rewrite text/children even when the visible value is identical.

Status/progress work should therefore not be fixed in isolation. The lifecycle consolidation should make every persistent shell surface use the same idempotent presentation layer.

Suggested ownership table:

```text
surface                       one final writer
All/collection title/meta     shell reconcile
Sort label/state              toolbar reconcile
Settings status               settings controller
sync/deep progress            progress controller
rail facet availability       rail reconcile
local card presentation       render/card reconcile
```

---

## 5. ARIA/live-region writers deserve special care

Progress nodes use `role="status"` / `aria-live="polite"`.

Repeatedly replacing identical live-region text can cause unnecessary assistive-technology announcements in addition to DOM churn.

An equality check is therefore an accessibility improvement as well as a performance improvement.

Required behavior:

```text
semantic progress changed
-> update live region

same semantic progress repeated
-> no text mutation / no duplicate announcement
```

For very high-frequency progress, consider coalescing visual ratio updates separately from spoken status text.

---

## 6. Tests need mutation-count semantics, not only string/source assertions

Current tests verify text models and source contracts but do not measure whether a repeated identical state render mutates the DOM.

Required small integration tests:

1. render a sync state;
2. attach a `MutationObserver` to the progress/status subtree;
3. render the identical state again;
4. assert zero relevant DOM mutations;
5. render a changed state;
6. assert exactly the expected minimal mutation(s).

The same test pattern can be reused for header counts, rail availability, Sort state and local-card reconciliation.

---

## 7. Priority

Implement these equality-before-write helpers as part of the lifecycle/render consolidation rather than sprinkling local checks through every historical module.

A small early helper patch is acceptable if it can be applied to final writers without creating another ownership layer, but the long-term value comes from making the future single reconcile architecture idempotent by default.