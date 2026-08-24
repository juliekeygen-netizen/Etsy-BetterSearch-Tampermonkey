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

function favCloseSettingsModalV080() {
    const layer = favState.settingsModal;
    if (!layer) return;
    layer.remove();
    favState.settingsModal = null;
    document.querySelector('[data-ebsf-settings]')?.setAttribute('aria-expanded', 'false');
    unlockPageScroll();
    favState.settingsReturnFocus?.focus?.({ preventScroll: true });
    favState.settingsReturnFocus = null;
}

function favOpenSettingsModalV080(event) {
    if (favState.settingsModal) return;
    const layer = document.createElement('div');
    layer.className = 'ebs-modal-layer ebsf-settings-layer';
    layer.innerHTML = `
        <section class="ebs-modal ebsf-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ebsf-settings-title">
            <header class="ebs-modal-header"><h2 class="ebs-modal-title" id="ebsf-settings-title">FAVORITES SETTINGS</h2></header>
            <div class="ebs-modal-editor"><div class="ebsf-settings-body">
                <section><h3>Favorites metadata index</h3><p>BetterSearch saves reliable Favorites card and structured metadata in a versioned local index for reuse across visits.</p></section>
                <section><h3>Deep metadata</h3><p>Listing-page scanning and automatic background updates are deliberately not enabled in this release. Metadata that Etsy has not supplied remains unknown.</p></section>
            </div></div>
            <footer class="ebs-modal-footer"><button type="button" class="ebs-button is-primary" data-ebsf-settings-close>Done</button></footer>
        </section>`;
    document.body.append(layer);
    favState.settingsModal = layer;
    favState.settingsReturnFocus = event?.currentTarget || document.querySelector('[data-ebsf-settings]');
    favState.settingsReturnFocus?.setAttribute('aria-expanded', 'true');
    lockPageScroll();
    layer.querySelector('[data-ebsf-settings-close]').addEventListener('click', favCloseSettingsModalV080);
    layer.addEventListener('pointerdown', (pointerEvent) => { if (pointerEvent.target === layer) favCloseSettingsModalV080(); });
    requestAnimationFrame(() => layer.querySelector('[data-ebsf-settings-close]')?.focus({ preventScroll: true }));
}

function favEnsureSettingsButtonV080(row) {
    let button = row.querySelector('[data-ebsf-settings]');
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ebsf-settings-button';
    button.dataset.ebsfSettings = '';
    button.setAttribute('aria-label', 'Favorites settings');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Favorites settings';
    button.innerHTML = ebsSettingsIconMarkup();
    button.addEventListener('click', favOpenSettingsModalV080);
    return button;
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
    const settingsButton = favEnsureSettingsButtonV080(row);

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
    if (settingsButton.parentElement !== controls) controls.append(settingsButton);

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

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && favState.settingsModal) favCloseSettingsModalV080();
});

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
.ebsf-search-left-controls .ebsf-filter-button,
.ebsf-search-left-controls .ebsf-sort > .wt-menu__trigger,
.ebsf-settings-button {
    min-height:36px!important;
    border:0!important;
    border-radius:999px!important;
    background:#f5f5f1!important;
    box-shadow:none!important;
}
.ebsf-search-left-controls .ebsf-filter-button:hover,
.ebsf-search-left-controls .ebsf-sort > .wt-menu__trigger:hover,
.ebsf-settings-button:hover { background:#ecebe6!important; }
.ebsf-settings-button { appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;padding:0;color:#222;cursor:pointer }
.ebsf-settings-button:focus-visible { outline:2px solid rgba(34,34,34,.3);outline-offset:2px }
.ebsf-settings-button svg { width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round }
.ebsf-settings-modal{width:min(560px,calc(100vw - 24px))}.ebsf-settings-body{display:grid;gap:14px;padding:20px}.ebsf-settings-body section{padding:15px;border:1px solid #deded8;border-radius:12px;background:#fff}.ebsf-settings-body h3{margin:0 0 5px;font-size:15px}.ebsf-settings-body p{margin:0;color:#555;font-size:13px;line-height:1.45}

@media (max-width: 1180px) {
    .ebsf-native-search-anchor { display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important; }
    .ebsf-native-search-anchor > form { order:2!important;flex:1 1 180px!important;width:auto!important;min-width:0!important; }
    .ebsf-search-left-controls { position:static!important;order:1!important;transform:none!important;flex:0 0 auto!important;width:auto!important; }
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
