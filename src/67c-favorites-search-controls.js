'use strict';

/* v0.7.7 Favorites search-control placement.
 *
 * Etsy renders two closely related Favorites search headers:
 *   - Favorites/Items and generated item groups: "Search your favorites"
 *   - Named collections: "Search within this collection"
 *
 * Keep Etsy's native search box in its original layout. BetterSearch's Filter
 * and Sort controls are absolutely anchored to the left of the native input
 * group, so they do not consume any of the search box's width.
 */

var favSearchInputBaseV077 = favSearchInput;
favSearchInput = function favSearchInputAllFavoriteViews() {
    const selectors = [
        'input[placeholder="Search within this collection"]',
        '.favorites-landing-phase3-header-search-container input[placeholder="Search your favorites"]',
        'input[placeholder="Search your favorites"]',
    ];
    const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const visible = candidates.find((input) => input.isConnected && input.getClientRects().length > 0);
    return visible || candidates[0] || favSearchInputBaseV077();
};

function favSearchAnchorV077() {
    const input = favSearchInput();
    const form = input?.closest?.('form');
    if (!input || !form) return null;

    let inputGroup = null;
    if (form.parentElement?.classList?.contains('wt-input-btn-group')) inputGroup = form.parentElement;
    else inputGroup = form.closest('.wt-input-btn-group');
    if (!inputGroup) return null;

    const row = inputGroup.parentElement;
    if (!row) return null;
    return { input, form, inputGroup, row };
}

function favCreateFilterToolbarV077(row) {
    const toolbar = document.createElement('div');
    toolbar.className = 'ebsf-toolbar';
    toolbar.dataset.ebsfToolbar = '';
    toolbar.innerHTML = `<button type="button" class="wt-btn wt-btn--transparent wt-justify-content-center wt-btn--small ebsf-filter-button" aria-expanded="false">${favFilterIcon()}<span data-ebsf-filter-label>Show filters</span></button>`;
    row.insertBefore(toolbar, row.firstChild);
    const button = toolbar.querySelector('.ebsf-filter-button');
    button?.addEventListener('click', favToggleFilters);
    return toolbar;
}

function favPolishFilterButtonV077() {
    const button = favState.filterButton || document.querySelector('.ebsf-filter-button');
    if (!button) return;

    /* `search-pathways-filter-button-md-down` is a responsive Etsy class that
     * hides the control on the desktop Favorites header. Do not borrow it here. */
    button.classList.remove(
        'search-pathways-filter-button-md-down',
        'toggle-button-fixed-width',
        'wt-mr-xs-1'
    );
    button.classList.add('toggle-button-inactive-hover');
    button.classList.toggle('toggle-button-inactive', !favState.filterOpen);
    button.setAttribute('aria-label', favState.filterOpen ? 'Hide filters' : 'Show filters');
    button.setAttribute('aria-expanded', String(favState.filterOpen));
    const label = button.querySelector('[data-ebsf-filter-label]');
    if (label) label.textContent = favState.filterOpen ? 'Hide filters' : 'Show filters';
}

/* Late wrappers from v0.7.4 call this function by name, so replacing it also
 * fixes the desktop visibility class whenever the rail opens/closes later. */
favPolishFilterButtonV074 = favPolishFilterButtonV077;

function favPlaceSearchControlsV077() {
    if (!isFavoritesPage()) return;
    const anchor = favSearchAnchorV077();
    if (!anchor) return;
    const { inputGroup, row } = anchor;

    let toolbar = row.querySelector('[data-ebsf-toolbar]');
    if (!toolbar) toolbar = favCreateFilterToolbarV077(row);

    let sortRoot = row.querySelector('[data-ebsf-sort]');
    if (!sortRoot) {
        favEnsureSortMenu(row, inputGroup);
        sortRoot = row.querySelector('[data-ebsf-sort]');
    }

    let controls = inputGroup.querySelector(':scope > [data-ebsf-search-left-controls]');
    if (!controls) {
        controls = document.createElement('div');
        controls.className = 'ebsf-search-left-controls';
        controls.dataset.ebsfSearchLeftControls = '';
        inputGroup.append(controls);
    }

    /* Moving the existing nodes keeps all listeners/menu state intact. Because
     * the wrapper is absolutely positioned, Etsy's native input group again has
     * the exact same flex/layout footprint it had before BetterSearch controls. */
    if (toolbar.parentElement !== controls) controls.append(toolbar);
    if (sortRoot && sortRoot.parentElement !== controls) controls.append(sortRoot);

    inputGroup.classList.add('ebsf-native-search-anchor');
    favState.toolbar = toolbar;
    favState.filterButton = toolbar.querySelector('.ebsf-filter-button');
    favState.sortRoot = sortRoot;
    favState.sortMenu = sortRoot?.querySelector('.ebsf-sort-menu') || null;
    favPolishFilterButtonV077();
}

var favEnsureToolbarBaseV077 = favEnsureToolbar;
favEnsureToolbar = function favEnsureToolbarAllFavoriteViews() {
    const result = favEnsureToolbarBaseV077();
    favPlaceSearchControlsV077();
    if (typeof favBindNativeSearchV072 === 'function') favBindNativeSearchV072();
    return result;
};

GM_addStyle(`
.ebsf-native-search-anchor {
    position: relative!important;
}
.ebsf-search-left-controls {
    position: absolute;
    right: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 60;
    display: flex!important;
    align-items: center;
    gap: 8px;
    width: max-content;
    white-space: nowrap;
    pointer-events: auto;
}
.ebsf-search-left-controls .ebsf-toolbar {
    display: flex!important;
    align-items: center;
    margin: 0!important;
    flex: 0 0 auto;
}
.ebsf-search-left-controls .ebsf-filter-button {
    display: inline-flex!important;
    visibility: visible!important;
    opacity: 1!important;
    margin: 0!important;
    gap: 6px;
    white-space: nowrap;
}
.ebsf-search-left-controls .ebsf-sort {
    display: block!important;
    margin: 0!important;
    flex: 0 0 auto;
}
.ebsf-search-left-controls .ebsf-sort-menu {
    z-index: 90;
}

@media (max-width: 899px) {
    .ebsf-native-search-anchor {
        display: flex!important;
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
    }
    .ebsf-native-search-anchor > form {
        order: 2;
        width: 100%;
    }
    .ebsf-search-left-controls {
        position: static;
        order: 1;
        right: auto;
        top: auto;
        transform: none;
        width: 100%;
        justify-content: flex-start;
    }
}
`);

/* The base runtime has already started by the time this compatibility module is
 * evaluated. Attach to whichever Favorites search header is currently present;
 * the existing MutationObserver will keep calling the wrapped ensure function
 * after Etsy swaps collection views through AJAX navigation. */
if (isFavoritesPage()) favEnsureToolbar();
