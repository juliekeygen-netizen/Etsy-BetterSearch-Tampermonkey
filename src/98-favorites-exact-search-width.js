'use strict';

/* v0.12.15 exact Favorites Search-width and X-position parity.
 *
 * v0.12.13 made Sort / Settings / Search widths deterministic from the complete
 * Favorites header, so All and collection scopes share the same track sizes.
 * v0.12.14 fixed the Search stroke, but its collection-only translateX(-2px)
 * was still a guessed offset. That could remain slightly wrong at some viewport
 * sizes and Etsy could move the real collection toolbar again when Search input
 * state changed.
 *
 * v0.12.15 keeps ALL width math unchanged. Instead, the real collection toolbar
 * is aligned by geometry to the same Favorites listing-column right edge used
 * by the generated All header. With equal toolbar widths, an identical right
 * edge means identical X positions for Sort, Settings and Search. The alignment
 * is reapplied after native Search input updates so typing cannot shift it.
 */

var FAV_EXACT_SEARCH_RATIO0135 = 0.5;
var FAV_EXACT_TOOLBAR_MAX_RATIO0135 = 0.74;
var FAV_TOOLBAR_GAP_TOTAL0135 = 12; // two 6px gaps
var FAV_SETTINGS_WIDTH0135 = 40;
var favExactToolbarFrame0136 = 0;

function favClearExactDesktopToolbarWidth0135(right) {
    if (!right) return;
    for (const property of ['flex','width','max-width','min-width']) {
        if (right.dataset.ebsfExactToolbarOwns === '1') right.style.removeProperty(property);
    }
    delete right.dataset.ebsfExactToolbarOwns;
}

function favClearCollectionToolbarX0136(right) {
    if (!right || right.dataset.ebsfExactXOwns !== '1') return;
    right.style.removeProperty('transform');
    delete right.dataset.ebsfExactXOwns;
}

function favCollectionToolbarTarget0136(header) {
    if (!header) return null;
    const directListing = header.closest?.('.phase3-listing-cards-section');
    if (directListing) return directListing;
    const content = favFavoritesContentColumn0120?.();
    return content?.querySelector?.('.phase3-listing-cards-section') || content || header;
}

function favAlignCollectionToolbarX0136(header, right) {
    if (!header || !right) return;

    /* All is already the visual source of truth, and narrow layouts use the
     * stacked responsive rules. Never offset either of those states. */
    if (header.matches?.('[data-ebsf-all-header]') || innerWidth < 900) {
        favClearCollectionToolbarX0136(right);
        return;
    }

    const target = favCollectionToolbarTarget0136(header);
    if (!target) return;

    /* Measure from the unshifted layout every time. This prevents a previous
     * correction from being counted again and makes repeated calls idempotent. */
    favClearCollectionToolbarX0136(right);
    const targetRect = target.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    if (!targetRect.width || !rightRect.width) return;

    const delta = targetRect.right - rightRect.right;
    if (!Number.isFinite(delta)) return;
    const rounded = Math.round(delta * 100) / 100;
    if (Math.abs(rounded) < 0.01) return;

    right.style.setProperty('transform', `translateX(${rounded}px)`, 'important');
    right.dataset.ebsfExactXOwns = '1';
}

function favScheduleExactToolbar0136() {
    if (favExactToolbarFrame0136) cancelAnimationFrame(favExactToolbarFrame0136);
    favExactToolbarFrame0136 = requestAnimationFrame(() => {
        favExactToolbarFrame0136 = 0;
        /* A second frame lets Etsy finish any React/native Search wrapper update
         * caused by typing before we read final geometry. */
        requestAnimationFrame(() => {
            if (isFavoritesPage()) favApplyExactSearchWidth0135();
        });
    });
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
        favClearCollectionToolbarX0136(right);
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

    /* Width is final now, so anchor collection X from the same right boundary
     * that the All header uses. This intentionally changes position only. */
    favAlignCollectionToolbarX0136(header, right);
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
    favScheduleExactToolbar0136();
    return result;
};

GM_addStyle(`
  /* Only color the actual Search control borders. Do not recolor Etsy's native
   * outline ring. Keep exactly one 1px visible perimeter and remove child rings. */
  .ebsf-native-search-slot .wt-input,
  .ebsf-native-search-slot .wt-input-btn-group__btn{
    border-color:#222!important;
    border-width:1px!important;
    outline:0!important;
    box-shadow:none!important;
  }
  .ebsf-native-search-slot .wt-input:focus,
  .ebsf-native-search-slot .wt-input:focus-visible,
  .ebsf-native-search-slot .wt-input-btn-group__btn:focus,
  .ebsf-native-search-slot .wt-input-btn-group__btn:focus-visible{
    outline:0!important;
    box-shadow:none!important;
  }
`);

window.addEventListener('resize', favScheduleExactToolbar0136, { passive:true });
document.fonts?.ready?.then?.(favScheduleExactToolbar0136).catch?.(() => {});

/* Etsy can update or replace pieces of the native Search control while typing.
 * Re-read collection geometry after those input/search/change events so the
 * toolbar cannot wander horizontally as the query changes. */
for (const eventName of ['input','search','change']) {
    document.addEventListener(eventName, (event) => {
        if (!event.target?.closest?.('.ebsf-native-search-slot')) return;
        favScheduleExactToolbar0136();
    }, true);
}

favScheduleExactToolbar0136();
