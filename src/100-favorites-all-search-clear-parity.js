'use strict';

/* v0.13.2 All Favorites Search clear-button parity.
 *
 * Etsy renders the same search component for All and collection routes, but
 * the native All markup has one extra .wt-input-btn-group wrapper around the
 * form. BetterSearch correctly sizes that outer wrapper as its Search slot;
 * collection routes size the form itself. After Etsy mounts the native
 * .favorites-landing-search-clear-button while typing, the All form could
 * therefore remain narrower than its sized slot and the native `right:62px`
 * clear-button offset was resolved from the wrong inner width. Visually the X
 * floated too far left even though collection pages were correct.
 *
 * Collection pages are the source of truth. Do not move or recreate Etsy's
 * React-owned Search nodes and do not invent a new X offset. Make only the All
 * route's inner native form fill the already-sized Search slot, then preserve
 * Etsy's own clear-button geometry (right:62px) verbatim.
 */

function favApplyAllSearchClearParity0141() {
    if (!isFavoritesPage() || favScope().type !== 'items') return;
    const header = document.querySelector('[data-ebsf-all-header]');
    const slot = header?.querySelector('.ebsf-native-search-slot');
    const input = slot?.querySelector('input[placeholder="Search your favorites"]');
    const form = input?.closest?.('form.wt-input-btn-group');
    if (!header || !slot || !form || !slot.contains(form)) return;
    form.dataset.ebsfAllSearchForm = '';
    /* The extra All-only native wrapper is not stable: depending on Etsy's
     * hydration pass it can be the form itself or a parent button-group. Mark
     * the actual containing group as well, rather than assuming the form is a
     * direct child of BetterSearch's Search slot. */
    const group = form.closest?.('.wt-input-btn-group');
    if (group && slot.contains(group)) group.dataset.ebsfAllSearchGroup = '';
}

var favInstallPageShellBefore0141 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0141() {
    const result = favInstallPageShellBefore0141?.();
    requestAnimationFrame(favApplyAllSearchClearParity0141);
    return result;
};

for (const eventName of ['input', 'search', 'change']) {
    document.addEventListener(eventName, (event) => {
        if (!event.target?.matches?.('input[placeholder="Search your favorites"]')) return;
        requestAnimationFrame(favApplyAllSearchClearParity0141);
    }, true);
}

window.addEventListener('resize', () => requestAnimationFrame(favApplyAllSearchClearParity0141), { passive:true });

GM_addStyle(`
  /* Collection routes already have .ebsf-native-search-slot on the form itself.
   * All has an extra native wrapper. Make only that inner All form consume the
   * exact slot width so Etsy's own clear-button positioning resolves identically. */
  [data-ebsf-all-header] .ebsf-native-search-slot [data-ebsf-all-search-group],
  [data-ebsf-all-header] .ebsf-native-search-slot form[data-ebsf-all-search-form]{
    position:relative!important;
    box-sizing:border-box!important;
    flex:1 1 100%!important;
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
  }

  /* This is Etsy's native Favorites component value, not a BetterSearch guess:
   * .favorites-landing-search-clear-button { ... right:62px }. Reassert it only
   * inside the mirrored All header so collection behavior is left untouched. */
  [data-ebsf-all-header] form[data-ebsf-all-search-form] .favorites-landing-search-clear-button{
    right:62px!important;
    left:auto!important;
  }
`);

requestAnimationFrame(favApplyAllSearchClearParity0141);
