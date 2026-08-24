'use strict';

/* v0.7.4 final Favorites audit/polish fixes. */

/* The marketplace favorite bridge expects data-ebs-listing-* attributes. The
 * Favorites renderer used its own ebsf names, which meant reconstructed/off-page
 * Favorites hearts could look clickable but never reach the bridge. Mirror both
 * attribute sets on every locally rendered card. */
var favNodeForRecordBaseV074 = favNodeForRecord;
favNodeForRecord = function favNodeForRecordBridgeReady(record) {
    const node = favNodeForRecordBaseV074(record);
    if (!node) return node;
    if (record?.id) {
        node.setAttribute('data-ebsf-id', String(record.id));
        node.setAttribute('data-ebs-listing-id', String(record.id));
    }
    if (record?.url) {
        node.setAttribute('data-ebsf-url', String(record.url));
        node.setAttribute('data-ebs-listing-url', String(record.url));
    }
    return node;
};

/* Scope changes must not retain the previous collection's count if a subsequent
 * request fails before it can establish a new total. */
var favResetForNativeChangeBaseV074 = favResetForNativeChange;
favResetForNativeChange = function favResetForNativeChangeFinal() {
    favState.total = 0;
    return favResetForNativeChangeBaseV074();
};

/* A fully completed Favorites load is authoritative for the current scope. Use
 * the deduplicated record count instead of a possibly stale total embedded in
 * the page before Etsy's AJAX updates finished. */
var favLoadAllBaseV074 = favLoadAll;
favLoadAll = async function favLoadAllCountHardened(force = false) {
    const records = await favLoadAllBaseV074(force);
    if (favState.loadComplete && favState.loadKey === favDatasetKey()) {
        favState.total = favState.records.length;
    }
    return records;
};

/* Keep saved shop filters visible even when the selected shop does not occur in
 * the newly opened collection. Without this, the select looked like "Any shop"
 * while an invisible stale shop filter could legitimately reduce results to 0.
 * Also make Reset behave like Etsy's filter rail: reset in place instead of
 * closing the panel. */
var favBuildFilterRailBaseV074 = favBuildFilterRail;
favBuildFilterRail = function favBuildFilterRailFinal() {
    const rail = favBuildFilterRailBaseV074();

    const shop = rail.querySelector('.ebsf-shop-select');
    if (shop && favCfg.filters.shop) {
        const exists = Array.from(shop.options).some((option) => option.value === favCfg.filters.shop);
        if (!exists) {
            const option = document.createElement('option');
            option.value = favCfg.filters.shop;
            option.textContent = `${favCfg.filters.shop} (not in this view)`;
            shop.append(option);
        }
        shop.value = favCfg.filters.shop;
    }

    const reset = rail.querySelector('.ebsf-rail-header button');
    if (reset) {
        const replacement = reset.cloneNode(true);
        reset.replaceWith(replacement);
        replacement.addEventListener('click', async () => {
            const keepRules = favCfg.multiRules;
            favCfg = favDefaultConfig();
            favCfg.multiRules = keepRules;
            favSaveConfig();
            favState.localPage = 1;
            favState.extraReady = false;
            await favReapply(true);
            if (favState.filterOpen) favRefreshRail();
            favUpdateSortLabel();
        });
    }
    return rail;
};

/* Match Etsy's own desktop Show-filters button class vocabulary more closely.
 * These are the same utility/control classes present on Etsy's native search
 * filter button; our own class remains for Favorites-specific layout. */
function favPolishFilterButtonV074() {
    const button = favState.filterButton || document.querySelector('.ebsf-filter-button');
    if (!button) return;
    button.classList.add(
        'wt-mr-xs-1',
        'search-pathways-filter-button-md-down',
        'toggle-button-inactive-hover',
        'toggle-button-fixed-width'
    );
    button.classList.toggle('toggle-button-inactive', !favState.filterOpen);
    button.setAttribute('aria-label', favState.filterOpen ? 'Hide filters' : 'Show filters');
    const label = button.querySelector('[data-ebsf-filter-label]');
    if (label) label.textContent = favState.filterOpen ? 'Hide filters' : 'Show filters';
}

var favEnsureToolbarBaseV074 = favEnsureToolbar;
favEnsureToolbar = function favEnsureToolbarPolished() {
    const result = favEnsureToolbarBaseV074();
    favPolishFilterButtonV074();
    return result;
};

var favOpenFiltersBaseV074 = favOpenFilters;
favOpenFilters = function favOpenFiltersPolished() {
    const result = favOpenFiltersBaseV074();
    /* Base code sets filterOpen before checking that the desktop sidebar exists.
     * Do not leave a phantom open state if Etsy is between DOM replacements. */
    if (innerWidth >= 900 && !favState.rail?.isConnected && !favState.sidebar?.isConnected) {
        favState.filterOpen = false;
    }
    favPolishFilterButtonV074();
    return result;
};

var favCloseFiltersBaseV074 = favCloseFilters;
favCloseFilters = function favCloseFiltersPolished() {
    const result = favCloseFiltersBaseV074();
    favPolishFilterButtonV074();
    return result;
};

/* Keep the mobile overlay's CTA useful like Etsy's own filter overlay by showing
 * the current locally filtered count. */
function favUpdateMobileResultButtonV074() {
    const button = favState.overlay?.querySelector('[data-show]');
    if (!button) return;
    const nativeTotal = Math.max(0, Number(favProps()?.totalListings) || favMainGrid()?.children?.length || 0);
    const count = favEnhancementActive()
        ? (Array.isArray(favState.filtered) ? favState.filtered.length : 0)
        : (favState.total || nativeTotal);
    button.textContent = `Show results (${count} ${count === 1 ? 'item' : 'items'})`;
}

var favRefreshRailBaseV074 = favRefreshRail;
favRefreshRail = function favRefreshRailPolished() {
    const result = favRefreshRailBaseV074();
    favUpdateMobileResultButtonV074();
    return result;
};

var favRenderCurrentBaseV074 = favRenderCurrent;
favRenderCurrent = function favRenderCurrentPolished() {
    const result = favRenderCurrentBaseV074();
    favUpdateMobileResultButtonV074();
    return result;
};

var favOpenFilterOverlayBaseV074 = favOpenFilterOverlay;
favOpenFilterOverlay = function favOpenFilterOverlayPolished() {
    const result = favOpenFilterOverlayBaseV074();
    favUpdateMobileResultButtonV074();
    return result;
};

/* Small UI affordance: Etsy-style disclosure arrows should visibly rotate when
 * a filter section is expanded. */
GM_addStyle(`
.ebsf-section[open] > summary .ebsf-chevron { transform:rotate(180deg); }
.ebsf-chevron { display:inline-block; transition:transform .12s ease; }
.ebsf-check-line input[type="checkbox"] { accent-color:#222; }
`);

/* Re-run once because the toolbar may already exist before this late patch file
 * loads. */
if (isFavoritesPage()) {
    favEnsureToolbar();
    favPolishFilterButtonV074();
}
