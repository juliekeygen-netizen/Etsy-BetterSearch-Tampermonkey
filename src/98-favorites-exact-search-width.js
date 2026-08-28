'use strict';

/* v0.12.13 exact Favorites Search-width parity.
 *
 * v0.12.12 derived Search from the complete header, but then clamped it to the
 * CURRENT toolbar row width. On desktop that row is narrower/wider depending on
 * the collection-title block, so All could still end up a few CSS pixels
 * different from a collection (562px vs 568px in the reported 1440p/100% case).
 *
 * This layer makes the toolbar itself deterministic. Above Etsy's 900px stacked
 * breakpoint, its right-side header region gets a width calculated only from
 * the complete header width, never from the current title width. Sort, Settings
 * and Search therefore have exactly the same track sizes on All and collection
 * routes. At 899px and below Etsy already stacks the right side to 100%, so the
 * existing responsive layout remains untouched.
 */

var FAV_EXACT_SEARCH_RATIO0135 = 0.5;
var FAV_EXACT_TOOLBAR_MAX_RATIO0135 = 0.74;
var FAV_TOOLBAR_GAP_TOTAL0135 = 12; // two 6px gaps
var FAV_SETTINGS_WIDTH0135 = 40;

function favClearExactDesktopToolbarWidth0135(right) {
    if (!right) return;
    for (const property of ['flex','width','max-width','min-width']) {
        if (right.dataset.ebsfExactToolbarOwns === '1') right.style.removeProperty(property);
    }
    delete right.dataset.ebsfExactToolbarOwns;
}

function favApplyExactSearchWidth0135() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    const row = root?.closest?.('[data-ebsf-toolbar-row]') || document.querySelector('[data-ebsf-toolbar-row]');
    const header = row?.closest?.('#collections-landing-phase-3-header-container')
        || document.querySelector('#collections-landing-phase-3-header-container');
    const right = header?.querySelector(':scope > #collections-landing-right-side-header-container');
    if (!root || !row || !header || !right) return;

    /* Always remeasure with the final v0.12.12 Sort-width function. This keeps
     * Sort identical too and prevents a stale inline width after soft routing. */
    favMeasureSortTrigger?.(root);
    const measured = root.style.getPropertyValue('--ebsf-sort-trigger-width').trim();
    const sortWidth = Number.parseFloat(measured) || 180;
    if (measured) {
        document.documentElement.style.setProperty('--ebsf-shared-sort-width0134', measured);
        row.style.setProperty('--ebsf-narrow-sort-width', measured);
    }

    const headerWidth = header.getBoundingClientRect().width;
    if (!headerWidth) return;

    /* Phone/tablet/narrow desktop: Etsy's real collection header is stacked and
     * the right side already spans the complete content width. Remove only the
     * inline desktop geometry owned by this module and let modules 94-97 handle
     * their existing responsive tracks. */
    if (innerWidth < 900) {
        favClearExactDesktopToolbarWidth0135(right);
        if (innerWidth > 760) {
            const reserved = sortWidth + FAV_SETTINGS_WIDTH0135 + FAV_TOOLBAR_GAP_TOTAL0135;
            const searchWidth = Math.min(
                headerWidth * FAV_EXACT_SEARCH_RATIO0135,
                Math.max(0, headerWidth - reserved)
            );
            if (searchWidth > 0) {
                row.style.setProperty('--ebsf-shared-search-width0134', `${Math.round(searchWidth * 100) / 100}px`);
            }
        } else {
            row.style.removeProperty('--ebsf-shared-search-width0134');
        }
        return;
    }

    const reserved = sortWidth + FAV_SETTINGS_WIDTH0135 + FAV_TOOLBAR_GAP_TOTAL0135;
    const desiredSearch = headerWidth * FAV_EXACT_SEARCH_RATIO0135;

    /* Cap the whole toolbar as a percentage of the COMPLETE header, not the
     * current title block. Both routes therefore receive the same cap at every
     * resolution/zoom level. The cap only matters near the desktop breakpoint. */
    const toolbarCap = headerWidth * FAV_EXACT_TOOLBAR_MAX_RATIO0135;
    const searchWidth = Math.max(0, Math.min(desiredSearch, toolbarCap - reserved));
    const toolbarWidth = reserved + searchWidth;
    if (!searchWidth || !toolbarWidth) return;

    const searchCss = `${Math.round(searchWidth * 100) / 100}px`;
    const toolbarCss = `${Math.round(toolbarWidth * 100) / 100}px`;

    row.style.setProperty('--ebsf-shared-search-width0134', searchCss);
    right.style.setProperty('flex', `0 0 ${toolbarCss}`, 'important');
    right.style.setProperty('width', toolbarCss, 'important');
    right.style.setProperty('max-width', toolbarCss, 'important');
    right.style.setProperty('min-width', toolbarCss, 'important');
    right.dataset.ebsfExactToolbarOwns = '1';
}

/* Module 94 and module 97 call this historical hook after resize/route repair.
 * Rebind it once more so all those existing lifecycle paths use the exact-width
 * geometry instead of the old row-width clamp. */
favSyncNarrowSortWidth0128 = function favSyncNarrowSortWidth0135() {
    favApplyExactSearchWidth0135();
};

var favInstallPageShellBefore0135 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0135() {
    const result = favInstallPageShellBefore0135?.();
    requestAnimationFrame(() => {
        if (isFavoritesPage()) favApplyExactSearchWidth0135();
    });
    return result;
};

GM_addStyle(`
  /* Search should use the same neutral outline as Sort, Settings and the other
   * BetterSearch controls. Etsy's native Search field otherwise keeps its
   * warmer brown border. Keep native focus behavior; only normalize color. */
  .ebsf-native-search-slot.wt-input-btn-group,
  .ebsf-native-search-slot .wt-input-btn-group,
  .ebsf-native-search-slot .wt-input,
  .ebsf-native-search-slot .wt-input-btn-group__input,
  .ebsf-native-search-slot .wt-input-btn-group__btn{
    border-color:#222!important;
    outline-color:#222!important;
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favApplyExactSearchWidth0135), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favApplyExactSearchWidth0135)).catch?.(() => {});

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favApplyExactSearchWidth0135();
});
