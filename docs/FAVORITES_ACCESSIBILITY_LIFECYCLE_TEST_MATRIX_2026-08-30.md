# Favorites accessibility + lifecycle regression matrix — 2026-08-30

Status: implementation/test specification derived from the source audits. This is not a claim that every scenario below currently fails in the browser; confidence/expected behavior is noted where relevant.

The purpose is to move beyond static source-contract tests and exercise the combined state machine that currently spans route observation, shell repair, rendering, pagination, metadata hydration, modals and async background work.

---

## Test principles

1. Prefer behavioral DOM/runtime tests over regex-only assertions for lifecycle contracts.
2. Every replacement/reconcile test should track `document.activeElement`.
3. Every route test should track active timers/observers/resources where the harness can expose them.
4. Every idempotence test should record DOM mutations on the relevant owned root.
5. Include two-pager fixtures whenever native/local pager ownership is under test.
6. Test pointer and keyboard paths separately where focus behavior differs.
7. Preserve Etsy/native ownership: tests should not require BetterSearch to synthesize native event internals.

---

# A. Permanent rail focus

| Scenario | Setup | Action | Required result |
| --- | --- | --- | --- |
| focused checkbox + availability refresh | desktop rail mounted, checkbox focused | metadata/facet availability changes | equivalent control stays focused; no whole-rail replacement for availability-only change |
| focused number input + async background refresh | max shipping/rating input focused with selection | background scope refresh completes | semantic control remains focused; typed value/selection not silently lost |
| strict-title disclosure | strict settings caret focused | activate caret | focus moves to equivalent caret/panel control intentionally; never `body` because old section was replaced |
| layout edit while rail open | rail option focused | editor closes with dirty layout | if option still exists, equivalent option receives focus; otherwise deterministic rail fallback |
| structural rail schema rebuild | rail scroll offset nonzero | apply schema mutation | scroll position preserved within valid bounds |

---

# B. Local card rendering + hydration

| Scenario | Setup | Action | Required result |
| --- | --- | --- | --- |
| focused card link, unrelated metadata update | local page with 20 cards, card 8 link focused | native card 3 hydrates | card 8 node/focus remains untouched |
| focused heart, same listing hydrates | local heart focused | native heart `aria-pressed` mutates | no blind detached focus; current replacement/action control owns focus if replacement required |
| heart action in flight | click local heart | native mutation occurs at ~90 ms; action completion later | working state and action token survive reconcile; completion reacquires current identity |
| background reapply, visible set unchanged | local grid active | background cache/metadata update changes no presentation/result ordering | no full `replaceChildren`; focus stays on current node |
| result ordering changes | focused card moves position | sort/metadata genuinely changes order | focus follows keyed listing/action if listing remains visible; otherwise deterministic results fallback |
| focused card filtered out | focused listing becomes non-match | filter change | focus moves to filter control that initiated change or stable results heading, not detached card |

---

# C. Local pagination

| Scenario | Input | Required result |
| --- | --- | --- |
| pointer click page 2 | mouse/touch | local page becomes 2; native page intent remains unchanged; no focus requirement beyond ordinary browser pointer behavior |
| Enter/Space on page 2 | keyboard | page 2 selected; newly current local page button or stable results target receives focus |
| keyboard Next | keyboard | correct local page only; native adapter does not record native intent |
| two simultaneous pagers with same Etsy aria-label | native + BetterSearch local pager | module 95a ignores local pager completely |
| local page disappears because results <= 20 | keyboard focus was on pager | focus transfers to stable results target before pager removal |
| local current page clamped after result shrink | page 3 -> only 2 pages | local page becomes 2 and accessible focus/announcement reflects new state |

---

# D. Mobile Filters modal

Required behavioral tests:

```text
open from Filters button
-> dialog appended
-> background made inert/non-interactive according to chosen modal manager policy
-> initial focus moves to Close or first meaningful filter control

Tab repeatedly
-> focus cycles only inside dialog

Shift+Tab from first
-> wraps to last

Escape
-> closes dialog
-> scroll lock released
-> focus returns to connected Filters opener

Show results
-> closes dialog
-> focus returns to appropriate opener/results target

soft-route leave while dialog open
-> dialog removed
-> scroll lock released
-> no stale return-focus reference mutates next route
```

Also test `prefers-reduced-motion` if close/open animation is introduced later.

---

# E. Settings + nested dialogs

| Scenario | Required result |
| --- | --- |
| normal Settings open/close | initial close-button focus; Tab trap; opener focus restored |
| Escape in Settings | closes Settings and restores opener |
| toolbar rebuilt while Settings open | close reacquires connected Settings-button fallback rather than focusing detached node |
| leave Favorites while Settings open | Settings disposed, scroll restored, no stale modal state |
| layout editor -> confirm dialog | confirm gets initial focus; closing returns focus to triggering editor control |
| layout editor -> rename | input selected; Escape/Cancel/Save returns to relevant editor item if still present |
| delete item that was opener | focus returns to deterministic adjacent/editor heading fallback |

---

# F. Layout editor keyboard support

Minimum keyboard parity tests after implementation:

```text
open editor entirely by keyboard
navigate rows/actions by Tab
open row actions menu by keyboard
menu receives focus
ArrowUp/ArrowDown move between menuitems
Escape closes menu and returns focus
```

For reordering, support and test explicit keyboard operations such as:

```text
Move up
Move down
Move to previous drawer
Move to next drawer
```

or an equivalent accessible reorder interaction.

HTML drag-and-drop should not be the only practical reorder path.

---

# G. Route teardown/resource lifetime

Run a repeat-cycle harness, ideally 10 iterations:

```text
enter Favorites
open Sort
open/close Settings
open/close info popover
open/close layout editor
switch All -> collection -> All
activate local render/pager
leave Favorites through soft route
return
```

After every leave assert:

```text
no connected [data-ebsf-local-grid]
no connected [data-ebsf-local-pagination]
no visible/connected Favorites modal layer that should have been disposed
no ebsf-native-info-popover
no active layout context menu
no orphan Sort portals
page scroll lock returned to baseline
render-hydration observer stopped
route-specific resize target cleared
route-generation pending timers cannot alter the new route
```

After every re-entry assert resource counts remain constant instead of increasing.

---

# H. Broad observer / semantic dirty-reason tests

Instrument controller scheduling counters.

```text
open Settings
-> MODAL state changes only
-> no ROUTE_CHANGED / NATIVE_GRID_CHANGED

open Sort portal
-> no native observation

BetterSearch rail text update
-> no route sync

Etsy native grid replacement
-> one NATIVE_GRID_CHANGED

native pager selection change
-> one NATIVE_VIEW_CHANGED

history/route transition
-> one ROUTE_CHANGED
```

When several native signals arrive in one frame, assert one coalesced reconcile with the union of dirty reasons.

---

# I. Timer deadline/priority tests

The current shared-debounce audits found that generic later work can postpone urgent work.

Future scheduler contract:

```text
existing deadline = T+50ms
new same-reason request asks T+1000ms
-> keep T+50ms

existing low-priority T+1000ms
urgent native-page request asks T+0ms
-> advance to T+0ms
```

Test route generation invalidation as well:

```text
schedule generation A
leave/switch dataset -> generation B
advance timers
-> A callback cannot mutate B
```

---

# J. DOM idempotence tests

Attach `MutationObserver` to each final owned surface.

For identical second reconcile expect effectively zero relevant mutations:

```text
rail availability
header title/meta/count
Sort selection/label
Settings status
progress text/ratio
toolbar geometry
local card presentation
local pagination presentation
```

Then change one semantic value and assert only the minimal corresponding node/state changes.

---

# K. Final-runtime bootstrap failure test

Simulate required late-subsystem initialization:

```text
all required installs succeed
-> runtime starts exactly once

one required install throws/fails marker
-> runtime does not start
-> native Etsy presentation remains usable
-> one clear initialization error is recorded
```

Do not rely only on file-order assertions.

---

# L. Browser smoke matrix for each lifecycle/render release

At minimum manually/browser-automated smoke:

```text
Chrome extension build
Firefox extension build where supported
Tampermonkey userscript path
```

Flows:

1. All Favorites initial load.
2. Collection initial load.
3. native Search type/submit/clear-X.
4. native page 1 -> 2 -> 3 -> Back/Forward.
5. BetterSearch strict/local results <=20 and >20.
6. local pagination by mouse and keyboard.
7. filter rail keyboard traversal and active filter changes.
8. Settings open/change/close/Escape.
9. layout editor basic keyboard path.
10. soft route away/back.
11. BFCache back/forward where browser uses it.
12. deep/background metadata completion while focus remains in UI.
13. viewport crossings around 760/761 and 899/900.
14. browser zoom/font-ready geometry settle.

For the lifecycle release, record a fresh Diagnostics session and compare sanitized aggregates:

```text
mutation count
same-value mutation count
shell/rail generations
route/native reconcile counts
DOM writes performed/skipped
network requests
```

Raw captures remain local and uncommitted.