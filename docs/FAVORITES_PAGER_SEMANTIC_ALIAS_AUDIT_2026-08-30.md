# Favorites pager semantic-alias audit — 2026-08-30

Status: focused source audit against BetterSearch v0.15.1 / `main` baseline `966a8922f3eff3a15f91c2c7d5601f1b6358d869`.

This turns the previously suspected local/native pager identity collision into an end-to-end source proof and records the smallest safe correction boundary.

## 1. Module 95 has a correct native-pager selector

`src/95-favorites-responsive-pagination.js` defines `favNativePagers0150()` as Favorites pagination navs excluding BetterSearch's local pager marker:

```text
nav[aria-label="Favorite Items Page Results"]
AND NOT [data-ebsf-local-pagination]
```

This helper is used when hiding/restoring Etsy's real pager and when choosing a native visual template.

That part of the ownership model is correct.

## 2. The local pager intentionally looks native

`favBuildNativePaginationShell0151()` clones Etsy's nav shell when available, otherwise creates a literal `<nav>`.

It marks the node with:

```text
data-ebsf-local-pagination="1"
data-ebsf-pagination-presentation="etsy-native"
```

but deliberately retains/sets:

```text
aria-label="Favorite Items Page Results"
```

This is appropriate for visual/accessibility parity as long as every semantic native-pager consumer also excludes the BetterSearch-owned marker.

## 3. Module 95a does not exclude the local pager

`src/95a-favorites-native-page-state.js` defines:

```text
favNativePager0139()
```

by collecting every:

```text
nav[aria-label="Favorite Items Page Results"]
```

and selecting the visible/connected one.

There is no exclusion for:

```text
[data-ebsf-local-pagination]
```

In local mode, Etsy's true native pager is intentionally hidden and the local pager is intentionally visible. Therefore the visible-first selector strongly prefers the BetterSearch local pager and treats its selected page as Etsy's native page state.

## 4. The click delegate aliases local clicks as native intent too

Module 95a also installs a capture-phase document click listener matching:

```text
nav[aria-label="Favorite Items Page Results"] button
```

Again there is no local-pager exclusion.

Module 95 installs its own capture-phase document listener for:

```text
[data-ebsf-local-pagination] button[data-ebsf-local-page]
```

The userscript load order is:

```text
module 95
module 95a
```

but event-listener registration depends on when these module bodies execute; both are registered during module evaluation and 95's local handler is registered before 95a's native handler because 95 loads first. Regardless of registration ordering, both selectors match the same local button and the ownership contract is already violated: the same UI control is semantically eligible for both handlers.

The local handler calls `preventDefault()` and `stopPropagation()`, but same-target/ancestor capture listener semantics and registration ordering should not be used as the isolation mechanism. The native handler must simply reject BetterSearch-owned pagination.

## 5. Concrete state corruption

When the local pager is visible on local result page 2, module 95a can observe:

```text
favNativeSelectedPage0139() = 2
```

although Etsy's hidden native pager may still be on page 1.

Then:

```text
favCurrentFavoritePage0139()
-> 2
favViewKey0137()
-> ...|page:2
```

A local page click can also seed:

```text
favState.nativePageIntent0139 = local target page
```

and schedule native-page reconcile/current-page observation.

This can create exactly the kind of contradictory state seen in earlier real-browser evidence:

```text
hidden Etsy native page = 1
visible BetterSearch local page = 2
native adapter reports page = 2
```

The important bug is semantic identity, not visual styling.

## 6. Existing test fixture cannot catch the collision

`tests/favorites-native-page-state.test.mjs` gives the native adapter a synthetic `document.querySelectorAll()` that returns one generic pager object.

It proves:

- selected native button beats URL fallback;
- native clicks do not explicitly assign `favState.localPage`;
- history intent and native/local variables are distinct in direct assignments.

It does not construct the real combined fixture:

```text
hidden native pager page 1
+
visible local pager page 2 with same aria-label
```

It also asserts that the adapter contains the generic native selector, but does not assert an exclusion marker.

Therefore the tests can be green while semantic aliasing remains live.

## 7. Small bounded production fix

The minimum safe correction is:

```text
favNativePager0139:
  query matching aria-label
  exclude [data-ebsf-local-pagination]

native click listener:
  require closest native nav
  reject if nav matches/closest [data-ebsf-local-pagination]
```

Prefer using one shared native-pager helper rather than maintaining two selector definitions with different exclusions.

Possible direction:

```text
favNativePagers0150()
-> canonical semantic native-pager discovery

95a consumes that helper
```

If module ordering makes that undesirable, both modules must at least share the exact ownership marker contract.

## 8. Local pager root could become a non-nav role container, but that is optional

An additional isolation layer is to render BetterSearch local pagination as a non-`nav` element with:

```text
role="navigation"
data-ebsf-local-pagination
```

while cloning the inner Etsy presentation.

That would make accidental `nav[...]` native selectors less likely to match it.

However this is defense in depth, not a substitute for correct semantic selectors. The local marker must still be respected.

## 9. Required combined regression test

Build a fixture with:

```text
nativePager:
    hidden
    selected page 1
    aria-label Favorite Items Page Results

localPager:
    visible
    data-ebsf-local-pagination
    selected page 2
    same aria-label
```

Assertions:

```text
favNativeSelectedPage0139() === 1
favCurrentFavoritePage0139() === 1
local page remains 2
click local page 3:
    localPage -> 3
    nativePageIntent0139 remains 0
    no native reconcile scheduled because of the local click
unrelated mutation/reconcile:
    native page remains 1
```

Then test the inverse native click to ensure native intent still works and local page does not change.

## 10. Priority

This is a small source-proven v0.15.1 correctness bug with a bounded fix and should be safe to implement before the larger v3 data migration if desired.

It should not be bundled with a pagination redesign. The current visual local pager can remain; only semantic native/local identity needs correction.