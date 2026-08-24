'use strict';

function favApiListings(payload) {
    if (Array.isArray(payload)) {
        if (payload.length && payload.every((entry) => Array.isArray(entry?.listings))) return payload.flatMap((entry) => entry.listings || []);
        return payload.filter((entry) => entry && (entry.listingId || entry.listing_id));
    }
    if (Array.isArray(payload?.listings)) return payload.listings;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.groups)) return payload.groups.flatMap((entry) => entry?.listings || []);
    return [];
}

function favApiUrl(offset, limit) {
    const scope = favScope();
    const queryText = favDatasetQuery();
    let url;
    if (scope.type === 'collection') {
        url = new URL(`/api/v3/ajax/bespoke/member/users/${encodeURIComponent(scope.owner)}/collections/${encodeURIComponent(scope.id)}/landing-listings-bespoke`, location.origin);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));
        if (queryText) url.searchParams.set('query', queryText);
    } else if (scope.type === 'group') {
        url = new URL('/api/v3/ajax/member/users/favorites/listing-groups', location.origin);
        url.searchParams.set('grouping_id', scope.id);
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('listing_limit', String(limit));
        url.searchParams.set('grouping_strategy', 'second_level_taxonomy');
    } else {
        url = new URL(`/api/v3/ajax/member/users/${encodeURIComponent(scope.owner)}/favorites/landing-listings`, location.origin);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));
        if (queryText) url.searchParams.set('query', queryText);
        url.searchParams.set('include_additional_listing_images', 'true');
        url.searchParams.set('rearrange_sold_out', 'true');
    }
    return url;
}

async function favFetchBatch(offset, limit, signal) {
    const url = favApiUrl(offset, limit);
    let last;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(url.href, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Favorites endpoint returned HTTP ${response.status}`);
            const payload = await response.json();
            return favApiListings(payload);
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            last = error;
            if (document.hidden) await new Promise((resolve) => {
                const onVisible = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', onVisible); resolve(); } };
                document.addEventListener('visibilitychange', onVisible);
            });
            await sleep(400 * (attempt + 1), signal);
        }
    }
    throw last || new Error('Favorites request failed');
}

function favRecordsFromListings(listings, offset, liveNodes = favCardMap(document)) {
    return listings.map((listing, index) => {
        const idValue = String(listing?.listingId ?? listing?.listing_id ?? '');
        return favRecordFromListing(listing, liveNodes.get(idValue), offset + index);
    }).filter((record) => record.id);
}

function favMergeRecords(map, records) {
    for (const record of records) {
        const old = map.get(record.id);
        if (!old || record.order < old.order) map.set(record.id, old ? { ...old, ...record, order: Math.min(old.order, record.order) } : record);
    }
}

function favProgress(text) {
    if (!favState.progressNode) {
        const section = document.querySelector('.phase3-listing-cards-section');
        if (!section) return;
        const node = document.createElement('div');
        node.className = 'ebsf-progress wt-text-body-small';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        section.prepend(node);
        favState.progressNode = node;
    }
    favState.progressNode.textContent = text;
}

function favClearProgress() {
    favState.progressNode?.remove();
    favState.progressNode = null;
}

async function favLoadAll(force = false) {
    if (!isFavoritesPage()) return [];
    const key = favDatasetKey();
    if (!force && favState.loadKey === key && favState.records.length) return favState.records;
    if (favState.loading && favState.loadKey === key) return favState.records;

    favState.controller?.abort();
    const controller = new AbortController();
    favState.controller = controller;
    favState.loading = true;
    favState.loadKey = key;
    favState.extraReady = false;
    favState.localPage = 1;
    favState.pageSize = 20;
    const map = new Map();
    const limit = 20;
    const liveNodes = favCardMap(document);

    try {
        const props = favProps();
        const wantedQuery = favDatasetQuery();
        const liveQuery = String(props?.query || '').trim();
        const knownTotal = normalize(wantedQuery) === normalize(liveQuery) ? Math.max(0, Number(props?.totalListings) || 0) : 0;

        if (knownTotal > 0) {
            const offsets = [];
            for (let offset = 0; offset < knownTotal; offset += limit) offsets.push(offset);
            let cursor = 0;
            const workers = Array.from({ length: Math.min(3, offsets.length || 1) }, async () => {
                while (cursor < offsets.length) {
                    const offset = offsets[cursor++];
                    const listings = await favFetchBatch(offset, limit, controller.signal);
                    favMergeRecords(map, favRecordsFromListings(listings, offset, liveNodes));
                    favProgress(`Loading favorites… ${Math.min(map.size, knownTotal)} / ${knownTotal}`);
                }
            });
            await Promise.all(workers);
            favState.total = knownTotal;
        } else {
            for (let offset = 0; ; offset += limit) {
                const listings = await favFetchBatch(offset, limit, controller.signal);
                favMergeRecords(map, favRecordsFromListings(listings, offset, liveNodes));
                favProgress(`Loading favorites… ${map.size} loaded`);
                if (listings.length < limit) break;
            }
            favState.total = map.size;
        }
        if (controller.signal.aborted) return [];

        favState.records = Array.from(map.values()).sort((a, b) => a.order - b.order);
        favState.recordsById = new Map(favState.records.map((item) => [item.id, item]));
        if (!favState.total) favState.total = favState.records.length;
        favClearProgress();
        if (favNeedsExtraInfo()) await favEnsureExtraInfo();
        return favState.records;
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn('[Etsy BetterSearch] Favorites load failed:', error);
            favProgress('Could not load every favorite. Showing the favorites BetterSearch could read.');
        }
        favState.records = Array.from(map.values()).sort((a, b) => a.order - b.order);
        favState.recordsById = new Map(favState.records.map((item) => [item.id, item]));
        favState.total = favState.records.length;
        return favState.records;
    } finally {
        if (favState.controller === controller) favState.loading = false;
    }
}

async function favEnsureExtraInfo() {
    if (favState.extraReady || favState.extraLoading || !favState.records.length) return;
    favState.extraLoading = true;
    const props = favProps();
    const country = String(props?.countryIsoCode || '');
    const postal = String(props?.buyerPostalCode || '');
    const ids = favState.records.map((item) => item.id);
    try {
        for (let i = 0; i < ids.length; i += 30) {
            const batch = ids.slice(i, i + 30);
            const url = new URL('/api/v3/ajax/bespoke/member/users/favorites/additional-listing-info', location.origin);
            batch.forEach((listingId) => url.searchParams.append('listing_ids[]', listingId));
            if (country) url.searchParams.set('country_iso_code', country);
            url.searchParams.set('postal_code', postal);
            const response = await fetch(url.href, { credentials: 'include', headers: { Accept: 'application/json' } });
            if (!response.ok) continue;
            const data = await response.json();
            for (const [listingId, extra] of Object.entries(data?.map || {})) {
                const record = favState.recordsById.get(String(listingId));
                if (!record) continue;
                record.shippingFormatted = String(extra?.shipping_costs || '');
                record.shipping = favParseMoney(extra?.shipping_costs);
                if (!Number.isFinite(record.shipping) && record.hasFreeShipping) record.shipping = 0;
                record.estimatedDelivery = String(extra?.estimated_delivery || '');
                record.acceptsReturns = String(extra?.accepts_returns) === '1';
                record.acceptsExchanges = String(extra?.accepts_exchanges) === '1';
                record.urgency = String(extra?.urgency_signal || '');
                const carts = record.urgency.match(/in\s+(\d+)\s+carts?/i);
                const stock = record.urgency.match(/only\s+(\d+)\s+left/i);
                record.carts = carts ? Number(carts[1]) : NaN;
                record.stockLeft = stock ? Number(stock[1]) : NaN;
            }
        }
        favState.extraReady = true;
    } catch (error) {
        console.warn('[Etsy BetterSearch] Favorites extra metadata failed:', error);
    } finally {
        favState.extraLoading = false;
    }
}

function favStrictTitleMatch(title) {
    if (!favCfg.strict) return true;
    const q = normalize(favNativeQuery());
    const source = normalize(title);
    if (!q) return true;
    if (favCfg.strictMode === 'phrase') return ` ${source} `.includes(` ${q} `);
    const tokens = new Set(source.split(' ').filter(Boolean));
    return q.split(' ').filter(Boolean).every((part) => tokens.has(part));
}

function favMultiMatch(record) {
    if (!favCfg.multi) return true;
    const plan = compileMultiPlan(favCfg.multiRules);
    for (const rule of plan.shared) if (!ruleMatchesTitle(record.title, rule)) return false;
    if (plan.branches.length && !plan.branches.some((rule) => ruleMatchesTitle(record.title, rule))) return false;
    for (const rule of plan.exclude) if (ruleMatchesTitle(record.title, rule)) return false;
    return true;
}

function favNumericFilter(value, raw, comparison) {
    if (raw === '' || raw == null) return true;
    const target = Number(raw);
    if (!Number.isFinite(target)) return true;
    return Number.isFinite(value) && comparison(value, target);
}

function favFilteredRecords() {
    const f = favCfg.filters;
    const out = favState.records.filter((item) => {
        if (!favStrictTitleMatch(item.title) || !favMultiMatch(item)) return false;
        if (!favNumericFilter(item.price, f.minPrice, (a,b) => a >= b)) return false;
        if (!favNumericFilter(item.price, f.maxPrice, (a,b) => a <= b)) return false;
        if (!favNumericFilter(item.discountPercent, f.minDiscount, (a,b) => a >= b)) return false;
        if (f.availableOnly && item.isSoldOut) return false;
        if (f.onSale && !item.isOnSale) return false;
        if (f.freeShipping && !item.hasFreeShipping) return false;
        if (f.itemFormat === 'digital' && !item.isDownload) return false;
        if (f.itemFormat === 'physical' && item.isDownload) return false;
        if (!favNumericFilter(item.rating, f.minRating, (a,b) => a >= b)) return false;
        if (!favNumericFilter(item.reviews, f.minReviews, (a,b) => a >= b)) return false;
        if (f.starSeller && !item.isStarSeller) return false;
        if (f.bestSeller && !item.isBestSeller) return false;
        if (f.personalizable && !item.isPersonalizable) return false;
        if (f.hasVariations && !item.hasVariations) return false;
        if (f.hasVideo && !item.videoSources.length) return false;
        if (f.shop && item.shopName !== f.shop) return false;
        if (!favNumericFilter(item.shipping, f.maxShipping, (a,b) => a <= b)) return false;
        if (f.returns && !item.acceptsReturns) return false;
        if (f.exchanges && !item.acceptsExchanges) return false;
        if (f.lowStock && !Number.isFinite(item.stockLeft)) return false;
        if (!favNumericFilter(item.carts, f.minCarts, (a,b) => a >= b)) return false;
        return true;
    });
    return favSortRecords(out);
}

function favSortRecords(items) {
    const list = items.slice();
    const text = (a,b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric: true });
    const number = (a,b, dir = 1) => {
        const av = Number.isFinite(a) ? a : (dir > 0 ? Infinity : -Infinity);
        const bv = Number.isFinite(b) ? b : (dir > 0 ? Infinity : -Infinity);
        return (av - bv) * dir;
    };
    const cmp = {
        etsy: (a,b) => a.order - b.order,
        priceAsc: (a,b) => number(a.price,b.price,1) || a.order-b.order,
        priceDesc: (a,b) => number(a.price,b.price,-1) || a.order-b.order,
        discountDesc: (a,b) => number(a.discountPercent,b.discountPercent,-1) || a.order-b.order,
        ratingDesc: (a,b) => number(a.rating,b.rating,-1) || number(a.reviews,b.reviews,-1) || a.order-b.order,
        reviewsDesc: (a,b) => number(a.reviews,b.reviews,-1) || a.order-b.order,
        titleAsc: (a,b) => text(a.title,b.title) || a.order-b.order,
        titleDesc: (a,b) => text(b.title,a.title) || a.order-b.order,
        shopAsc: (a,b) => text(a.shopName,b.shopName) || a.order-b.order,
        shippingAsc: (a,b) => number(a.shipping,b.shipping,1) || a.order-b.order,
        cartsDesc: (a,b) => number(a.carts,b.carts,-1) || a.order-b.order,
        lowStock: (a,b) => number(a.stockLeft,b.stockLeft,1) || a.order-b.order,
    }[favCfg.sort] || ((a,b) => a.order-b.order);
    return list.sort(cmp);
}
