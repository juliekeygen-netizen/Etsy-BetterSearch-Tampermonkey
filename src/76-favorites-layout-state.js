'use strict';

/* v0.11.0 Favorites catalogue/layout + cross-page deep queue.
 *
 * This module intentionally loads after the Favorites runtime. It adds:
 *  - three-state catalogue-aware filter visibility (off / catalogue / current results),
 *  - persistent user control over filter-section, filter-option and sort-menu order/visibility,
 *  - right-click quick actions for filter/sort controls,
 *  - a dedicated layout editor,
 *  - durable deep-queue auto-resume on any Etsy page, while preserving a manual pause.
 */

var FAV_FILTER_AVAILABILITY_MODES0110 = ['disabled', 'catalogue', 'filtered'];
var FAV_DEEP_MANUAL_PAUSE_KEY0110 = 'etsy-bettersearch.favorites.deep-manual-pause.v1';

var FAV_FILTER_LAYOUT0110 = [
    { key:'search', label:'Search', options:[
        ['strict-title','Strict title'], ['multi-search','Multi-search'],
    ] },
    { key:'category', label:'Category', options:FAV_NATIVE_CATEGORIES_.map(([key, label]) => [key, label]) },
    { key:'special-offers', label:'Special offers', options:[
        ['free-shipping','Free shipping'], ['on-sale','On sale'],
    ] },
    { key:'item-format', label:'Item format', options:[
        ['all-items','All items'], ['physical','Exclude digital downloads'], ['digital','Digital downloads only'],
    ] },
    { key:'etsys-best', label:"Etsy's best", options:[
        ['etsys-picks',"Etsy's Picks"], ['star-seller','Star Seller'],
    ] },
    { key:'ships-from', label:'Ships from', options:[
        ['anywhere','Anywhere'], ['europe','Europe'], ['local','Your country'], ['country','Another country'],
    ] },
    { key:'ready-to-ship-in', label:'Ready to ship in', options:[
        ['1-day','1 day'], ['1-3-days','1–3 days'],
    ] },
    { key:'price', label:'Price', options:[['price-range','Price range']] },
    { key:'item-type', label:'Item type', options:[['vintage','Vintage']] },
    { key:'ordering-options', label:'Ordering options', options:[
        ['gift-cards','Accepts Etsy gift cards'], ['gift-wrap','Can be gift-wrapped'], ['customizable','Customizable'],
    ] },
    { key:'ship-to', label:'Ship to', options:[['destination','Destination country']] },
    { key:'availability', label:'Availability & discount', options:[
        ['available-only','Available only'], ['min-discount','Minimum discount %'],
    ] },
    { key:'rating-and-reviews', label:'Rating & reviews', options:[
        ['min-rating','Minimum rating'], ['min-reviews','Minimum review count'],
    ] },
    { key:'seller', label:'Seller', options:[['shop','Shop selector']] },
    { key:'listing-features', label:'Listing features', options:[
        ['best-seller','Best Seller'], ['has-variations','Has variations'],
    ] },
    { key:'popularity-and-stock', label:'Popularity & stock', options:[
        ['low-stock','Etsy reports low stock'], ['min-carts','Minimum reported carts'],
    ] },
    { key:'delivery', label:'Delivery', options:[
        ['max-shipping','Maximum shipping cost'], ['returns','Returns accepted'], ['exchanges','Exchanges accepted'],
    ] },
];

var FAV_FILTER_SECTION_ORDER_DEFAULT0110 = FAV_FILTER_LAYOUT0110.map((entry) => entry.key);
var FAV_FILTER_SECTION_KEYS0110 = new Set(FAV_FILTER_SECTION_ORDER_DEFAULT0110);
var FAV_FILTER_LAYOUT_BY_KEY0110 = new Map(FAV_FILTER_LAYOUT0110.map((entry) => [entry.key, entry]));

function favOrderedValid0110(values, defaults) {
    const valid = new Set(defaults);
    const seen = new Set();
    const out = [];
    for (const value of Array.isArray(values) ? values : []) {
        const key = String(value || '');
        if (!valid.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    for (const key of defaults) if (!seen.has(key)) out.push(key);
    return out;
}

function favHiddenValid0110(values, defaults, keepOne = false) {
    const valid = new Set(defaults);
    const out = Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter((key) => valid.has(key))));
    if (keepOne && out.length >= defaults.length) return out.filter((key) => key !== defaults[0]);
    return out;
}

function favDefaultOptionOrder0110(sectionKey) {
    return (FAV_FILTER_LAYOUT_BY_KEY0110.get(sectionKey)?.options || []).map(([key]) => key);
}

function favNormalizeOptionOrders0110(source) {
    const input = source && typeof source === 'object' ? source : {};
    const out = {};
    for (const section of FAV_FILTER_LAYOUT0110) {
        const defaults = section.options.map(([key]) => key);
        out[section.key] = favOrderedValid0110(input[section.key], defaults);
    }
    return out;
}

function favNormalizeOptionHidden0110(source) {
    const input = source && typeof source === 'object' ? source : {};
    const out = {};
    for (const section of FAV_FILTER_LAYOUT0110) {
        const defaults = section.options.map(([key]) => key);
        out[section.key] = favHiddenValid0110(input[section.key], defaults, false);
    }
    return out;
}

var favNormalizeUiPrefsBefore0110 = favNormalizeUiPrefs;
favNormalizeUiPrefs = function favNormalizeUiPrefs0110(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = favNormalizeUiPrefsBefore0110(source);
    const hasLegacyPreference = Object.prototype.hasOwnProperty.call(source, 'hideUnavailableCatalogFilters');
    const legacyEnabled = source.hideUnavailableCatalogFilters === true || base.hideUnavailableCatalogFilters === true;
    const availabilityMode = FAV_FILTER_AVAILABILITY_MODES0110.includes(source.filterAvailabilityMode)
        ? source.filterAvailabilityMode
        : (hasLegacyPreference ? (legacyEnabled ? 'catalogue' : 'disabled') : 'filtered');
    const sortDefaults = FAV_SORT_DEFINITIONS.map((entry) => entry.key);
    return {
        ...base,
        hideUnavailableCatalogFilters: availabilityMode !== 'disabled',
        filterAvailabilityMode: availabilityMode,
        filterSectionOrder: favOrderedValid0110(source.filterSectionOrder, FAV_FILTER_SECTION_ORDER_DEFAULT0110),
        filterSectionHidden: favHiddenValid0110(source.filterSectionHidden, FAV_FILTER_SECTION_ORDER_DEFAULT0110, false),
        filterOptionOrder: favNormalizeOptionOrders0110(source.filterOptionOrder),
        filterOptionHidden: favNormalizeOptionHidden0110(source.filterOptionHidden),
        sortMenuOrder: favOrderedValid0110(source.sortMenuOrder, sortDefaults),
        sortMenuHidden: favHiddenValid0110(source.sortMenuHidden, sortDefaults, true),
    };
};

/* Read the persisted value directly here. Passing the already-normalized
 * in-memory preferences as the fallback made a fresh install look like an
 * explicit legacy "disabled" preference before schema v2 ever ran. */
favUiPrefs = favNormalizeUiPrefs(GM_getValue(FAV_UI_PREFS_STORAGE_KEY, {}));
favSaveUiPrefs();

function favAvailabilityMode0110() {
    return FAV_FILTER_AVAILABILITY_MODES0110.includes(favUiPrefs.filterAvailabilityMode)
        ? favUiPrefs.filterAvailabilityMode
        : 'disabled';
}

function favConfigWithoutFilterSection0110(sectionKey) {
    const config = favNormalizeConfig(favCfg);
    const filters = config.filters;
    if (sectionKey === 'search') { config.strict = false; config.multi = false; }
    if (sectionKey === 'category') filters.category = '';
    if (sectionKey === 'special-offers') { filters.freeShipping = false; filters.onSale = false; }
    if (sectionKey === 'item-format') filters.itemFormat = 'all';
    if (sectionKey === 'etsys-best') { filters.etsysPick = false; filters.starSeller = false; }
    if (sectionKey === 'ships-from') { filters.shipsFrom = 'anywhere'; filters.shipsFromCountry = ''; }
    if (sectionKey === 'ready-to-ship-in') { filters.ready1Day = false; filters.ready3Days = false; }
    if (sectionKey === 'price') { filters.minPrice = ''; filters.maxPrice = ''; }
    if (sectionKey === 'item-type') filters.vintage = false;
    if (sectionKey === 'ordering-options') { filters.giftWrap = false; filters.personalizable = false; }
    if (sectionKey === 'ship-to') filters.shipTo = '';
    if (sectionKey === 'availability') { filters.availableOnly = false; filters.minDiscount = ''; }
    if (sectionKey === 'rating-and-reviews') { filters.minRating = ''; filters.minReviews = ''; }
    if (sectionKey === 'seller') filters.shop = '';
    if (sectionKey === 'listing-features') { filters.bestSeller = false; filters.hasVariations = false; }
    if (sectionKey === 'popularity-and-stock') { filters.lowStock = false; filters.minCarts = ''; }
    if (sectionKey === 'delivery') { filters.maxShipping = ''; filters.returns = false; filters.exchanges = false; }
    return config;
}

function favAvailabilityRecords0110(sectionKey = '') {
    const mode = favAvailabilityMode0110();
    if (mode === 'filtered') {
        const currentConfig = favCfg;
        try {
            favCfg = favConfigWithoutFilterSection0110(sectionKey);
            const current = favFilteredRecords();
            favCfg = currentConfig;
            if (Array.isArray(current)) return current;
        } catch (_) {
            /* Restore the live config even if a future filter throws. */
            favCfg = currentConfig;
        }
        if (Array.isArray(favState.filtered)) return favState.filtered;
    }
    return Array.isArray(favState.records) ? favState.records : [];
}

function favDeepVisibilityReady0110() {
    return Boolean(favState.loadComplete && favState.records?.length && favCatalogueDeepComplete0101(favState.records));
}

function favSectionDefinition0110(key) {
    return FAV_FILTER_LAYOUT_BY_KEY0110.get(String(key || '')) || null;
}

function favOptionLabel0110(sectionKey, optionKey) {
    return favSectionDefinition0110(sectionKey)?.options.find(([key]) => key === optionKey)?.[1] || optionKey;
}
