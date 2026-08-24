'use strict';

var FAV_STORAGE_KEY = 'etsy-bettersearch.favorites.config.v1';

function favDefaultConfig() {
    return {
        strict: false,
        strictMode: 'phrase',
        multi: false,
        multiRules: [defaultRule('or', '')],
        sort: 'etsy',
        filters: {
            minPrice: '', maxPrice: '', minDiscount: '',
            availableOnly: false, onSale: false, freeShipping: false,
            itemFormat: 'all', minRating: '', minReviews: '',
            starSeller: false, bestSeller: false, personalizable: false,
            hasVariations: false, hasVideo: false, shop: '',
            maxShipping: '', returns: false, exchanges: false,
            lowStock: false, minCarts: '',
        },
    };
}

function favNormalizeConfig(raw) {
    const base = favDefaultConfig();
    const source = raw && typeof raw === 'object' ? raw : {};
    const filters = source.filters && typeof source.filters === 'object' ? source.filters : {};
    return {
        strict: source.strict === true,
        strictMode: source.strictMode === 'all' ? 'all' : 'phrase',
        multi: source.multi === true,
        multiRules: normalizeRules(Array.isArray(source.multiRules) && source.multiRules.length ? source.multiRules : base.multiRules),
        sort: ['etsy','priceAsc','priceDesc','discountDesc','ratingDesc','reviewsDesc','titleAsc','titleDesc','shopAsc','shippingAsc','cartsDesc','lowStock'].includes(source.sort) ? source.sort : 'etsy',
        filters: {
            minPrice: String(filters.minPrice ?? ''), maxPrice: String(filters.maxPrice ?? ''), minDiscount: String(filters.minDiscount ?? ''),
            availableOnly: filters.availableOnly === true, onSale: filters.onSale === true, freeShipping: filters.freeShipping === true,
            itemFormat: ['all','physical','digital'].includes(filters.itemFormat) ? filters.itemFormat : 'all',
            minRating: String(filters.minRating ?? ''), minReviews: String(filters.minReviews ?? ''),
            starSeller: filters.starSeller === true, bestSeller: filters.bestSeller === true, personalizable: filters.personalizable === true,
            hasVariations: filters.hasVariations === true, hasVideo: filters.hasVideo === true, shop: String(filters.shop ?? ''),
            maxShipping: String(filters.maxShipping ?? ''), returns: filters.returns === true, exchanges: filters.exchanges === true,
            lowStock: filters.lowStock === true, minCarts: String(filters.minCarts ?? ''),
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
    records: [],
    recordsById: new Map(),
    total: 0,
    filtered: [],
    localPage: 1,
    pageSize: 20,
    extraReady: false,
    extraLoading: false,
    nativeGrid: null,
    nativeOrder: [],
    nativeNodes: new Map(),
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
    const header = document.querySelector('.favorites-landing-phase3-header-search-container');
    return header?.querySelector('input[placeholder="Search your favorites"], input[data-clg-id="WtInput"]')
        || document.querySelector('input[placeholder="Search your favorites"]');
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

function favRecordFromListing(listing, node, order) {
    const idValue = String(listing?.listingId ?? favListingIdFromNode(node));
    const price = listing?.priceDetails || {};
    const rating = listing?.ratingDetails || {};
    return {
        id: idValue,
        title: String(listing?.title || node?.querySelector?.('img[alt]')?.alt || '').replace(/&quot;/g, '"'),
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
        isDownload: price.isDownload === true,
        hasFreeShipping: price.hasFreeShipping === true,
        rating: favParseNumber(rating.rating),
        reviews: favParseNumber(rating.count),
        shopName: String(listing?.shop?.shopName || ''),
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
    };
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
    return Boolean(f.maxShipping || f.returns || f.exchanges || f.lowStock || f.minCarts || ['shippingAsc','cartsDesc','lowStock'].includes(favCfg.sort));
}
