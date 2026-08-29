# Favorites accessibility + focus ownership audit — 2026-08-30

Status: focused source audit of keyboard focus, modal semantics and DOM-replacement behavior in BetterSearch Favorites v0.15.1.

No runtime code is changed by this document.

## Summary

The current Favorites UI contains many good semantic pieces—real buttons/inputs, `aria-expanded`, `aria-controls`, `role="dialog"`, `aria-modal`, keyboard-capable collection scrolling and reduced-motion handling—but several final rendering/reconcile paths destroy focused DOM nodes without transferring focus.

The highest-confidence problems are:

1. permanent desktop rail refresh replaces the complete rail root;
2. section-level refreshes use `replaceChildren()` on the section body;
3. local result rendering replaces the complete local grid;
4. local pagination rebuilds the whole pager immediately after a page-button activation;
5. native hydration can replace all matching local cards, including the focused/working card;
6. the mobile Filters dialog lacks the focus-management features already present in Settings;
7. layout-editor/context interactions are substantially more pointer-oriented than the rest of Favorites.

The target is not to preserve arbitrary detached node objects. The target is to preserve **semantic focus identity** across reconcile: control binding, listing ID/action, local page, modal opener, or another stable key.

---

# 1. Permanent desktop rail refresh destroys focused controls — SOURCE-PROVEN

The final desktop path in `src/86-favorites-page-shell.js` overrides `favRefreshRail()` and performs:

```text
const replacement = favBuildFilterRail()
const old = sidebar.querySelector(':scope > [data-ebsf-rail]')
old.replaceWith(replacement)
```

There is no capture of `document.activeElement`, semantic control identity, text selection, or scroll/focus restoration.

Rail refresh is not restricted to a deliberate "rebuild UI" command. It can be reached by:

- strict-title settings expansion/collapse;
- reset operations;
- filter-layout/editor mutations;
- metadata/filter-availability work;
- background Favorites refresh paths that call `favRefreshRail()` while the rail is open.

Therefore a user can be typing in or keyboard-operating a rail control when an unrelated async refresh removes that control from the document.

### Required invariant

Ordinary availability/data refresh must reconcile the existing rail in place.

A structural rebuild, when genuinely required, must capture a semantic focus key such as:

```text
binding key
option instance id
input role/name
selectionStart / selectionEnd for text/number input
rail scroll position
```

and restore focus to the equivalent live control after replacement if it still exists and remains enabled/visible.

---

# 2. Section-body replacement can synchronously discard the activating control — SOURCE-PROVEN

`src/62b-favorites-filter-ui.js::favReplaceSectionBody()` does:

```text
body.replaceChildren(builder())
```

Several filter interactions use this helper after changing state, including Search/category/shipping-related controls.

This can destroy the exact button/select/input that initiated the change. Mouse users may barely notice; keyboard users lose their current DOM focus target and navigation position.

### Better pattern

Prefer keyed in-place reconcile for common state changes. If the section structure truly changes, preserve focus by binding/instance ID rather than element reference.

For disclosure controls, keep the disclosure trigger itself stable even if body contents change.

---

# 3. Local grid rendering replaces every visible card — SOURCE-PROVEN

`src/63-favorites-runtime.js::favRenderCurrent()` creates a new document fragment and calls:

```text
localGrid.replaceChildren(frag)
```

This occurs not only when the user intentionally changes page/filter/sort. Reapply can also happen after catalogue/background metadata/integrity work.

If focus is inside a local card link, heart, or Add-to-cart/options button, a rerender destroys that focused element even when the same listing remains on the same visible local page.

### Required local-card identity

Local reconcile should be keyed by listing ID. When presentation changes for listing X:

```text
update/replace X only
preserve other connected cards
```

If focused listing X itself must be replaced, capture the action identity, for example:

```text
listing:123 | action:favorite
listing:123 | action:card-link
listing:123 | action:add-to-cart
```

and transfer focus to the corresponding action in the replacement card where safe.

---

# 4. Local pagination currently destroys the focused page button — SOURCE-PROVEN

Module 95 owns the local-result pager.

A local pager click calls `favGoToLocalPage0150()`, which updates `favState.localPage` and immediately calls `favRenderCurrent()`.

The final local pager renderer then creates a new fragment and performs:

```text
group.replaceChildren(fragment)
```

So the button that was activated is destroyed as part of navigation. No later code moves focus to:

- the newly current page button;
- the first result;
- the results heading/container;
- another explicit destination.

The code only scrolls the listing section into view in a RAF.

### Required keyboard contract

Choose and test one intentional policy. Recommended:

```text
click/pointer page navigation
-> preserve ordinary pointer behavior; scroll as today if desired

keyboard activation of local page control
-> after pager/result reconcile, focus the newly current page button
   OR focus a stable results-heading/container with an accessible announcement
```

Do not leave focus on a detached button.

This is independent from the separate module-95a local/native pager semantic-alias bug.

---

# 5. Native hydration can replace a focused/working local card — SOURCE-PROVEN

`src/101-favorites-v0141-smoke-fixes.js::favRefreshOwnedCardsFromNative0143()` currently iterates every visible local card that has a live native counterpart and does:

```text
replacement = native.cloneNode(true) -> prepare owned card
card.replaceWith(replacement)
```

There is no presentation equality check, dirty-listing set, `document.activeElement` guard, or action-state transfer.

The native hydration observer watches child/character/attribute mutations including `aria-pressed`. One native Favorite state change can therefore schedule a refresh that replaces the local card whose Favorite action is still in its existing ~900 ms completion window.

Consequences include:

- focus loss;
- working-state indicator disappearing early;
- callback retaining references to detached nodes;
- needless replacement of unrelated local cards.

### Required reconcile

Track dirty listing IDs from native mutations and update only those cards whose presentation actually differs.

If a local action is in flight, either:

- defer presentation replacement until the action completes; or
- transfer action/focus state to the keyed replacement and make completion operate on current identity rather than old node references.

---

# 6. Mobile Filters is a modal visually/semantically, but lacks a full modal focus contract — SOURCE-PROVEN CURRENT PATH

The narrow-screen path inherited from the base Favorites UI creates:

```html
<section role="dialog" aria-modal="true" aria-label="Favorites filters">
```

and locks page scroll.

Unlike Settings, the current mobile Filters path does not show source-level handling for:

- initial focus into the dialog;
- Tab/Shift+Tab trapping;
- Escape close;
- storing/restoring the opener focus;
- making the background inert while the dialog is active.

On close, the overlay is removed and scroll is unlocked, but focus restoration is not explicit.

### Required parity

Use one modal manager for Settings, mobile Filters, layout editor, rename/confirm and future dialogs.

The manager should provide:

```text
capture connected opener / semantic fallback
append dialog
set inert/background ownership as appropriate
move initial focus
trap Tab
Escape close unless destructive flow intentionally forbids it
remove dialog
restore focus to connected opener or semantic fallback
restore scroll lock exactly once
```

---

# 7. Settings is stronger, but its stored opener can become detached — SOURCE-PROVEN RISK

The final Settings implementation already does several things correctly:

- `role="dialog"` + `aria-modal="true"`;
- stores `favState.settingsReturnFocus`;
- focuses its Close button after opening;
- traps Tab/Shift+Tab through `favTrapModalFocus()`;
- returns focus to the stored opener on normal close.

However:

- the shared focus trap handles Tab only, not Escape;
- the stored return target is a raw node reference;
- toolbar/shell replacement while Settings is open can detach that opener;
- close calls `.focus()` on the stored reference without first reacquiring an equivalent connected Settings button.

This should be folded into the shared modal manager rather than patched only in Settings.

---

# 8. Layout editor has weaker focus/keyboard behavior than Settings — SOURCE-PROVEN

The v2 layout editor in module 85 is an `aria-modal` dialog and uses the shared Tab trap, but its close path does not preserve/restore an opener.

Nested rename is comparatively good:

- captures a return target;
- focuses/selects the text input;
- supports Escape;
- returns focus after close.

Nested confirmation dialogs focus Cancel and support Escape, but their close helper only removes the confirmation layer; it does not explicitly restore focus to the control that opened the confirmation.

The layout context menu:

- uses `role="menu"` / `role="menuitem"`;
- is positioned from pointer coordinates;
- does not establish initial menu focus;
- does not expose arrow-key menu navigation in the audited code.

Editor rows use HTML drag-and-drop for reordering; the visual drag handle is `aria-hidden`, and no keyboard move-up/down/reorder controls were found.

### Required accessibility path

For the layout editor provide explicit keyboard operations such as:

```text
Move up
Move down
Move into previous/next drawer
Move out
```

or an equivalent keyboard-operable reorder model.

Pointer drag-and-drop can remain as an enhancement, not the only efficient reorder path.

---

# 9. Existing positive accessibility behavior should be preserved

The refactor should retain current good behavior, including:

- filter drawer disclosure uses a real button with `aria-controls` and `aria-expanded`;
- drawer body tracks `hidden` / `aria-hidden`;
- section animation honors `prefers-reduced-motion`;
- collection strip has keyboard Arrow/Home/End scrolling;
- active collection links use `aria-current="page"`;
- Settings already has a Tab focus trap and opener restoration in the normal connected case;
- rename dialog has good focus entry/return behavior;
- progress uses status/live-region semantics.

The goal is consistent ownership, not replacing all existing UI semantics.

---

# 10. Accessibility invariants for the new render/lifecycle architecture

Every DOM-replacing reconcile should answer:

```text
What semantic thing currently owns focus?
Will that semantic thing still exist after reconcile?
If yes, can its node remain connected?
If not, what is the deterministic focus destination?
```

Recommended semantic focus keys:

```text
rail:<bindingKey>:<instanceId>:<controlRole>
card:<listingId>:<action>
pager:local:<page>
pager:native:<page>     // read/observe only; Etsy owns native behavior
modal:<kind>:<openerKey>
layout:<type>:<instanceId>:<action>
```

Focus preservation should be part of render transactions, not a late `document.activeElement` patch after arbitrary replacements.

---

# 11. Priority

These issues belong in the render/lifecycle consolidation release, with one surgical exception: local pager focus can be fixed alongside the bounded local/native pager work if the implementation stays small.

Do not add one focus-restoration wrapper around every historical replacement function. Prefer stable/keyed DOM plus a shared modal/focus controller so most focus simply never gets destroyed.