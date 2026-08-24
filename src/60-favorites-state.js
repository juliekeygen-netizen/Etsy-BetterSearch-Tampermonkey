'use strict';

var FAV_STORAGE_KEY = 'etsy-bettersearch.favorites.config.v1';

var FAV_SORT_DEFINITIONS = [
    { key: 'etsy', normal: 'Etsy order', reversed: '', reversible: false },
    { key: 'price', normal: 'Price: low to high', reversed: 'Price: high to low', reversible: true },
    { key: 'rating', normal: 'Rating: low to high', reversed: 'Rating: high to low', reversible: true },
    { key: 'reviews', normal: 'Most reviews', reversed: 'Least reviews', reversible: true },
    { key: 'discount', normal: 'Discount: high to low', reversed: 'Discount: low to high', reversible: true },
    { key: 'title', normal: 'Title: A to Z', reversed: 'Title: Z to A', reversible: true },
    { key: 'shop', normal: 'Shop: A to Z', reversed: 'Shop: Z to A', reversible: true },
    { key: 'shipping', normal: 'Shipping: low to high', reversed: 'Shipping: high to low', reversible: true },
    { key: 'carts', normal: 'Most carts', reversed: 'Fewest reported carts', reversible: true },
    { key: 'stock', normal: 'Low stock first', reversed: 'High stock first', reversible: true },
];

function favNormalizeSort(source = {}) {
    const legacy = {
        etsy: ['etsy', false], priceAsc: ['price', false], priceDesc: ['price', true],
        ratingDesc: ['rating', true], reviewsDesc: ['reviews', false], discountDesc: ['discount', false],
        titleAsc: ['title', false], titleDesc: ['title', true], shopAsc: ['shop', false],
        shippingAsc: ['shipping', false], cartsDesc: ['carts', false], lowStock: ['stock', false],
    };
    if (legacy[source.sort]) return { sort: legacy[source.sort][0], sortReversed: legacy[source.sort][1] };
    const definition = FAV_SORT_DEFINITIONS.find((entry) => entry.key === source.sort);
    if (!definition) return { sort: 'etsy', sortReversed: false };
    return { sort: definition.key, sortReversed: definition.reversible && source.sortReversed === true };
}

function favSortLabel(sort, reversed = false) {
    const definition = FAV_SORT_DEFINITIONS.find((entry) => entry.key === sort) || FAV_SORT_DEFINITIONS[0];
    return reversed && definition.reversible ? definition.reversed : definition.normal;
}

function favDefaultConfig() {
    return {
        strict: false,
        strictMode: 'phrase',
        multi: false,
        multiRules: [defaultRule('or', '')],
        sort: 'etsy',
        sortReversed: false,
        autoSync: true,
        filters: {
            minPrice: '', maxPrice: '', minDiscount: '',
            availableOnly: false, onSale: false, freeShipping: false,
            itemFormat: 'all', minRating: '', minReviews: '',
            starSeller: false, bestSeller: false, personalizable: false,
            hasVariations: false, hasVideo: false, shop: '',
            maxShipping: '', returns: false, exchanges: false,
            lowStock: false, minCarts: '',
            category: '', etsysPick: false,
            shipsFrom: 'anywhere', shipsFromCity: '', shipsFromCountry: '',
            ready1Day: false, ready3Days: false,
            vintage: false, giftCards: false, giftWrap: false,
            shipTo: '',
        },
    };
}

function favNormalizeConfig(raw) {
    const base = favDefaultConfig();
    const source = raw && typeof raw === 'object' ? raw : {};
    const filters = source.filters && typeof source.filters === 'object' ? source.filters : {};
    const normalizedSort = favNormalizeSort(source);
    return {
        strict: source.strict === true,
        strictMode: source.strictMode === 'all' ? 'all' : 'phrase',
        multi: source.multi === true,
        multiRules: normalizeRules(Array.isArray(source.multiRules) && source.multiRules.length ? source.multiRules : base.multiRules),
        ...normalizedSort,
        autoSync: source.autoSync !== false,
        filters: {
            minPrice: String(filters.minPrice ?? ''), maxPrice: String(filters.maxPrice ?? ''), minDiscount: String(filters.minDiscount ?? ''),
            availableOnly: filters.availableOnly === true, onSale: filters.onSale === true, freeShipping: filters.freeShipping === true,
            itemFormat: ['all','physical','digital'].includes(filters.itemFormat) ? filters.itemFormat : 'all',
            minRating: String(filters.minRating ?? ''), minReviews: String(filters.minReviews ?? ''),
            starSeller: filters.starSeller === true, bestSeller: filters.bestSeller === true, personalizable: filters.personalizable === true,
            hasVariations: filters.hasVariations === true, hasVideo: filters.hasVideo === true, shop: String(filters.shop ?? ''),
            maxShipping: String(filters.maxShipping ?? ''), returns: filters.returns === true, exchanges: filters.exchanges === true,
            lowStock: filters.lowStock === true, minCarts: String(filters.minCarts ?? ''),
            category: String(filters.category ?? ''), etsysPick: filters.etsysPick === true,
            shipsFrom: ['anywhere','europe','local','near','country'].includes(filters.shipsFrom) ? filters.shipsFrom : 'anywhere',
            shipsFromCity: String(filters.shipsFromCity ?? ''), shipsFromCountry: String(filters.shipsFromCountry ?? ''),
            ready1Day: filters.ready1Day === true, ready3Days: filters.ready3Days === true,
            vintage: filters.vintage === true, giftCards: filters.giftCards === true, giftWrap: filters.giftWrap === true,
            shipTo: String(filters.shipTo ?? ''),
        },
    };
}

var favCfg = favNormalizeConfig(GM_getValue(FAV_STORAGE_KEY, {}));
if (favCfg.strict && favCfg.multi) favCfg.strict = false;

var favState = {
    lastHref: location.href,
    lastScopeKey: '',
    loadKey: '',
    loading: false,
    controller: null,
    loadPromise: null,
    loadComplete: false,
    records: [],
    recordsById: new Map(),
    total: 0,
    filtered: [],
    localPage: 1,
    pageSize: 20,
    extraReady: false,
    extraLoading: false,
    extraPromise: null,
    extraKey: '',
    nativeGrid: null,
    nativeOrder: [],
    nativeNodes: new Map(),
    nativeCaptured: false,
    rendered: false,
    rendering: false,
    toolbar: null,
    filterButton: null,
    sortRoot: null,
    sortMenu: null,
    countNode: null,
    sidebar: null,
    sidebarNodes: null,
    rail: null,
    overlay: null,
    filterOpen: false,
    observer: null,
    syncTimer: 0,
    progressNode: null,
    ruleModal: null,
    ruleDraft: null,
    ruleDragId: '',
    ruleMenu: null,
    openSections: new Set(),
    openSectionsInitialized: false,
    strictSettingsOpen: false,
    settingsModal: null,
    settingsReturnFocus: null,
    groupQueryResolved: false,
    autoSyncCheckKey: '',
    autoSyncCheckAt: 0,
};

function favSaveConfig() {
    favCfg = favNormalizeConfig(favCfg);
    GM_setValue(FAV_STORAGE_KEY, favCfg);
}

function isFavoritesPage() {
    if (new URL(location.href).searchParams.get('tab') === 'shops') return false;
    return /\/people\/[^/]+(?:\/favorites(?:\/[^/?#]+)?)?\/?$/i.test(location.pathname)
        && Boolean(document.querySelector('.favorites-landing-phase3-header, [data-testid="sidebar"], .phase3-listing-cards-section'));
}

function favProps(root = document) {
    for (const script of root.querySelectorAll('script[type="text/props"]')) {
        const text = script.textContent || '';
        if (!text.includes('"profileOwnerUserId"')) continue;
        try {
            const data = JSON.parse(text);
            if (!data || !data.profileOwnerUserId) continue;
            if (!Number.isFinite(Number(data.totalListings))) {
                const derived = Number(data.itemCount);
                if (Number.isFinite(derived)) data.totalListings = derived;
                else if (Array.isArray(data.listings)) data.totalListings = data.listings.length;
            }
            if (Number.isFinite(Number(data.totalListings))) return data;
        } catch (_) {}
    }
    return null;
}

function favIsOwnFavoritesPage(props = favProps()) {
    if (!props) return false;
    if (props.isOwnProfile === true || props.isOwner === true || props.isSelf === true) return true;
    const owner = String(props.profileOwnerUserId || '');
    const viewer = String(props.viewerUserId || props.currentUserId || props.userId || '');
    return Boolean(owner && viewer && owner === viewer);
}

function favProfileLogin() {
    const match = location.pathname.match(/\/people\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
}

function favScope() {
    const url = new URL(location.href);
    const props = favProps();
    const pathMatch = location.pathname.match(/\/people\/[^/]+\/favorites\/([^/?#]+)/i);
    const collectionId = url.searchParams.get('collectionId');
    if (pathMatch) return { type: 'collection', id: decodeURIComponent(pathMatch[1]), owner: String(props?.profileOwnerUserId || ''), login: favProfileLogin() };
    if (collectionId) return { type: 'group', id: collectionId, owner: String(props?.profileOwnerUserId || ''), login: favProfileLogin() };
    return { type: 'items', id: '', owner: String(props?.profileOwnerUserId || ''), login: favProfileLogin() };
}

function favSearchInput() {
    const selectors = ['input[placeholder="Search within this collection"]','.favorites-landing-phase3-header-search-container input[placeholder="Search your favorites"]','input[placeholder="Search your favorites"]'];
    const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    return candidates.find((input) => input.isConnected && input.getClientRects().length > 0)
        || candidates[0]
        || document.querySelector('.favorites-landing-phase3-header-search-container input[data-clg-id="WtInput"]');
}

function favNativeQuery() {
    const props = favProps();
    const input = favSearchInput();
    return String(input?.value ?? props?.query ?? '').trim();
}

function favScopeKey() {
    const scope = favScope();
    return `${scope.owner}|${scope.type}|${scope.id}|${favNativeQuery()}`;
}

function favDatasetQuery() {
    return favCfg.strict || favCfg.multi ? '' : favNativeQuery();
}

function favDatasetKey() {
    const scope = favScope();
    return `${scope.owner}|${scope.type}|${scope.id}|q:${favDatasetQuery()}`;
}

function favMainGrid(root = document) {
    return root.querySelector('.phase3-listing-cards-section ul.implicit-comparison-listing-card-row')
        || root.querySelector('.phase3-listing-cards-section ul[role="list"]')
        || null;
}

function favListingIdFromNode(node) {
    const direct = node?.getAttribute?.('data-ebsf-id');
    if (direct) return direct;
    const href = node?.querySelector?.('a[href*="/listing/"]')?.getAttribute('href') || '';
    return href.match(/\/listing\/(\d+)/)?.[1] || '';
}

function favListingsFromProps(props) {
    const out = [];
    for (const group of Array.isArray(props?.groups) ? props.groups : []) {
        for (const listing of Array.isArray(group?.listings) ? group.listings : []) out.push(listing);
    }
    if (Array.isArray(props?.listings)) out.push(...props.listings);
    return out;
}

function favCardMap(root = document) {
    const map = new Map();
    const grid = favMainGrid(root);
    if (!grid) return map;
    for (const node of Array.from(grid.children)) {
        const idValue = favListingIdFromNode(node);
        if (idValue) map.set(idValue, node);
    }
    return map;
}

function favParseNumber(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return NaN;
    const multiplier = raw.endsWith('k') ? 1000 : raw.endsWith('m') ? 1000000 : 1;
    const n = Number.parseFloat(raw.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, ''));
    return Number.isFinite(n) ? n * multiplier : NaN;
}

function favParseMoney(value) {
    let raw = String(value ?? '').replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
    if (!raw) return NaN;
    const comma = raw.lastIndexOf(',');
    const dot = raw.lastIndexOf('.');
    if (comma > dot) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : NaN;
}

function favDecodeEntities(value) {
    const text = String(value || '');
    if (!/[&][a-zA-Z#0-9]+;/.test(text)) return text;
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
}

function favRecordFromListing(listing, node, order) {
    const idValue = String(listing?.listingId ?? favListingIdFromNode(node));
    const price = listing?.priceDetails || {};
    const rating = listing?.ratingDetails || {};
    const has = (object, key) => Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
    const digitalCard = Boolean(node?.querySelector?.('clg-icon[name="downloadarrow"]'))
        || /\bdigital download\b/i.test(node?.textContent || '');
    const videoValue = listing?.videoSources;
    return {
        id: idValue,
        title: favDecodeEntities(listing?.title || node?.querySelector?.('img[alt]')?.alt || ''),
        url: String(listing?.url || node?.querySelector?.('a[href*="/listing/"]')?.href || ''),
        imageUrl: String(listing?.imageUrl || ''),
        secondaryImageUrl: String(listing?.secondaryImageUrl || ''),
        videoSources: Array.isArray(listing?.videoSources) ? listing.videoSources : [],
        isBestSeller: listing?.isBestSeller === true,
        isShopOnVacation: listing?.isShopOnVacation === true,
        isSoldOut: listing?.isSoldOut === true,
        shouldShowBuyItNowButton: listing?.shouldShowBuyItNowButton === true,
        price: favParseMoney(price.currentFormattedPriceWithSymbol),
        priceFormatted: String(price.currentFormattedPriceWithSymbol || ''),
        originalPrice: favParseMoney(price.originalPrice),
        originalPriceFormatted: String(price.originalPrice || ''),
        discountPercent: Number(price.discountPercent) || 0,
        isOnSale: price.isOnSale === true || Number(price.discountPercent) > 0,
        isDownload: price.isDownload === true || (!has(price, 'isDownload') && digitalCard),
        hasFreeShipping: price.hasFreeShipping === true,
        rating: favParseNumber(rating.rating),
        reviews: favParseNumber(rating.count),
        shopName: favDecodeEntities(listing?.shop?.shopName || ''),
        shopId: String(listing?.shop?.shopId || ''),
        shopUrl: String(listing?.shop?.shopUrl || ''),
        isStarSeller: listing?.shop?.isStarSeller === true,
        hasVariations: listing?.hasVariations === true,
        isPersonalizable: listing?.isPersonalizable === true,
        html: node?.outerHTML || '',
        order,
        shipping: NaN,
        shippingFormatted: '',
        estimatedDelivery: '',
        acceptsReturns: false,
        acceptsExchanges: false,
        urgency: '',
        carts: NaN,
        stockLeft: NaN,
        known: {
            isBestSeller: has(listing, 'isBestSeller'),
            isSoldOut: has(listing, 'isSoldOut'),
            isDownload: has(price, 'isDownload') || digitalCard,
            hasFreeShipping: has(price, 'hasFreeShipping'),
            isOnSale: has(price, 'isOnSale') || has(price, 'discountPercent'),
            discountPercent: has(price, 'discountPercent'),
            rating: has(rating, 'rating'),
            reviews: has(rating, 'count'),
            isStarSeller: has(listing?.shop, 'isStarSeller'),
            hasVariations: has(listing, 'hasVariations'),
            isPersonalizable: has(listing, 'isPersonalizable'),
            hasVideo: has(listing, 'videoSources') || Array.isArray(videoValue),
        },
        knownSource: {
            isDownload: has(price, 'isDownload') ? 'favorites-json' : (digitalCard ? 'favorites-card-dom' : 'unknown'),
        },
    };
}

function favSetSearchMode(mode, enabled, config = favCfg) {
    const next = enabled === true;
    if (mode === 'strict') {
        config.strict = next;
        if (next) config.multi = false;
    } else if (mode === 'multi') {
        config.multi = next;
        if (next) config.strict = false;
    }
    return config;
}

function favActiveSectionKeys(config = favCfg) {
    const cfg = favNormalizeConfig(config);
    const f = cfg.filters;
    const active = new Set();
    if (cfg.strict || cfg.multi) active.add('search');
    if (f.category) active.add('category');
    if (f.freeShipping || f.onSale) active.add('special-offers');
    if (f.itemFormat !== 'all') active.add('item-format');
    if (f.etsysPick || f.starSeller) active.add('etsys-best');
    if (f.shipsFrom !== 'anywhere' || f.shipsFromCity || f.shipsFromCountry) active.add('ships-from');
    if (f.ready1Day || f.ready3Days) active.add('ready-to-ship-in');
    if (f.minPrice || f.maxPrice) active.add('price');
    if (f.vintage) active.add('item-type');
    if (f.giftCards || f.giftWrap || f.personalizable) active.add('ordering-options');
    if (f.shipTo) active.add('ship-to');
    if (f.availableOnly || f.minDiscount) active.add('availability');
    if (f.minRating || f.minReviews) active.add('rating-and-reviews');
    if (f.shop) active.add('seller');
    if (f.bestSeller || f.hasVariations || f.hasVideo) active.add('listing-features');
    if (f.lowStock || f.minCarts) active.add('popularity-and-stock');
    if (f.maxShipping || f.returns || f.exchanges) active.add('delivery');
    return active;
}

function favInitializeOpenSections() {
    if (favState.openSectionsInitialized) return favState.openSections;
    favState.openSections = favActiveSectionKeys(favCfg);
    favState.openSectionsInitialized = true;
    return favState.openSections;
}

function favHasActiveFilters() {
    const f = favCfg.filters;
    return Boolean(
        f.minPrice || f.maxPrice || f.minDiscount || f.availableOnly || f.onSale || f.freeShipping || f.itemFormat !== 'all'
        || f.minRating || f.minReviews || f.starSeller || f.bestSeller || f.personalizable || f.hasVariations || f.hasVideo
        || f.shop || f.maxShipping || f.returns || f.exchanges || f.lowStock || f.minCarts
    );
}

function favEnhancementActive() {
    return favCfg.strict || favCfg.multi || favCfg.sort !== 'etsy' || favHasActiveFilters();
}

function favNeedsExtraInfo() {
    const f = favCfg.filters;
    return Boolean(f.freeShipping || f.maxShipping || f.returns || f.exchanges || f.lowStock || f.minCarts || ['shipping','carts','stock'].includes(favCfg.sort));
}
