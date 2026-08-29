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

function favApiUrlForScope(scope, offset, limit, query = '') {
    let url;
    if (scope.type === 'collection') {
        url = new URL(`/api/v3/ajax/bespoke/member/users/${encodeURIComponent(scope.owner)}/collections/${encodeURIComponent(scope.id)}/landing-listings-bespoke`, location.origin);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));
        if (query) url.searchParams.set('query', query);
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
        if (query) url.searchParams.set('query', query);
        url.searchParams.set('include_additional_listing_images', 'true');
        url.searchParams.set('rearrange_sold_out', 'true');
    }
    return url;
}

function favApiUrl(offset, limit) {
    return favApiUrlForScope(favScope(), offset, limit, favDatasetQuery());
}

function favDetectedLocaleHeader() {
    const body = document.body;
    const currency = String(body?.dataset?.currency || '').trim();
    const language = String(body?.dataset?.language || document.documentElement?.lang || '').trim();
    const region = String(body?.dataset?.region || favProps()?.countryIsoCode || '').trim();
    return currency && language && region ? `${currency}|${language}|${region}` : '';
}

function favRetryAfterMs(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function favWaitUntilVisible(signal) {
    if (!document.hidden) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => { document.removeEventListener('visibilitychange', onChange); signal?.removeEventListener('abort', onAbort); };
        const onChange = () => { if (!document.hidden) { cleanup(); resolve(); } };
        const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
        document.addEventListener('visibilitychange', onChange);
        if (signal) {
            if (signal.aborted) return onAbort();
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

async function favFetchJson(url, signal, attempts = 3, onRetry = null) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const headers = { Accept: 'application/json' };
            const locale = favDetectedLocaleHeader();
            if (locale) headers['x-detected-locale'] = locale;
            const response = await fetch(url.href || url, { credentials: 'include', signal, headers });
            if (!response.ok) {
                const error = new Error(`Favorites endpoint returned HTTP ${response.status}`);
                error.retryAfterMs = favRetryAfterMs(response.headers.get('Retry-After'));
                throw error;
            }
            return response.json();
        } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) throw error;
            lastError = error;
            onRetry?.(attempt + 1, error);
            await favWaitUntilVisible(signal);
            await sleep(Math.min(8000, Math.max(400 * (attempt + 1), Number(error?.retryAfterMs) || 0)), signal);
        }
    }
    throw lastError || new Error('Favorites request failed');
}

async function favFetchBatch(offset, limit, signal) {
    return favApiListings(await favFetchJson(favApiUrl(offset, limit), signal));
}

function favRecordsFromListings(listings, offset, liveNodes = favCardMap(document)) {
    const observedAt = Date.now();
    return listings.map((listing, index) => {
        const idValue = String(listing?.listingId ?? listing?.listing_id ?? '');
        return { ...favRecordFromListing(listing, liveNodes.get(idValue), offset + index), indexObservedAt:observedAt };
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

/* Compatibility entry point. The complete-dataset implementation lives only
 * in the catalogue/sync owner (61b). */
function favLoadAll(force = false) {
    return favCatalogAcquireCurrent({ force:force === true });
}

function favExtraDatasetKey() { return `${favDatasetKey()}|${favState.records.map((record)=>record.id).join(',')}`; }

/* Compatibility entry point. Demand-driven metadata work is installed by the
 * metadata coordinator (61h) before Favorites runtime starts. */
function favEnsureExtraInfo() {
    return favMetadataEnsureCurrentRequirements0141().then((coverage) => coverage.complete);
}

function favNumericFilter(value,raw,comparison){if(raw===''||raw==null)return true;const target=Number(raw);return !Number.isFinite(target)||(Number.isFinite(value)&&comparison(value,target));}
function favGroupNativeQueryMatch(item){if(favCfg.strict||favCfg.multi||favScope().type!=='group'||favState.groupQueryResolved)return true;const words=normalize(favNativeQuery()).split(' ').filter(Boolean);if(!words.length)return true;const source=normalize(item.title);return words.every((word)=>source.includes(word));}
function favCategoryMatch(categories, selected){const wanted=normalize(selected).split(' ').filter((word)=>word&&word!=='and');if(!wanted.length)return true;return (categories||[]).some((category)=>{const words=new Set(normalize(category).split(' ').filter(Boolean));return wanted.every((word)=>words.has(word));});}

function favFilteredRecords(){const f=favCfg.filters,multiPlan=favCfg.multi?compileMultiPlan(favCfg.multiRules):null,strictQuery=favCfg.strict?normalize(favNativeQuery()):'';const titleMatch=(item)=>{if(!favGroupNativeQueryMatch(item))return false;const source=normalize(item.title);if(strictQuery){if(favCfg.strictMode==='phrase'&&!` ${source} `.includes(` ${strictQuery} `))return false;if(favCfg.strictMode==='all'){const tokens=new Set(source.split(' ').filter(Boolean));if(!strictQuery.split(' ').filter(Boolean).every((part)=>tokens.has(part)))return false;}}if(!multiPlan)return true;for(const rule of multiPlan.shared)if(!ruleMatchesTitle(item.title,rule))return false;if(multiPlan.branches.length&&!multiPlan.branches.some((rule)=>ruleMatchesTitle(item.title,rule)))return false;for(const rule of multiPlan.exclude)if(ruleMatchesTitle(item.title,rule))return false;return true;};const out=favState.records.filter((item)=>{if(!titleMatch(item))return false;if(!favNumericFilter(item.price,f.minPrice,(a,b)=>a>=b)||!favNumericFilter(item.price,f.maxPrice,(a,b)=>a<=b))return false;if(f.availableOnly&&(item.isSoldOut||item.isShopOnVacation))return false;if(f.onSale&&!item.isOnSale)return false;if(f.freeShipping&&!item.hasFreeShipping&&item.shipping!==0)return false;if(f.itemFormat==='digital'&&!(item.known?.isDownload&&item.isDownload))return false;if(f.itemFormat==='physical'&&item.known?.isDownload&&item.isDownload)return false;if(!favNumericFilter(item.rating,f.minRating,(a,b)=>a>=b)||!favNumericFilter(item.reviews,f.minReviews,(a,b)=>a>=b))return false;if(f.starSeller&&!item.isStarSeller)return false;if(f.personalizable&&!item.isPersonalizable)return false;if(f.hasVariations&&!item.hasVariations)return false;if(f.shop&&item.shopName!==f.shop)return false;if(f.etsysPick&&item.deepMetadata?.etsysPick!==true)return false;if(f.vintage&&item.deepMetadata?.vintage!==true)return false;if(f.giftWrap&&item.deepMetadata?.giftWrap!==true)return false;if(f.category&&!favCategoryMatch(item.deepMetadata?.category,f.category))return false;if(!favNumericFilter(item.shipping,f.maxShipping,(a,b)=>a<=b))return false;if(f.returns&&!item.acceptsReturns)return false;if(f.exchanges&&!item.acceptsExchanges)return false;if(f.lowStock&&!Number.isFinite(item.stockLeft))return false;if(!favNumericFilter(item.carts,f.minCarts,(a,b)=>a>=b))return false;return true;});return favSortRecords(out);}

function favCompareKnownNumber(a, b, direction = 1) {
    const aKnown = Number.isFinite(a), bKnown = Number.isFinite(b);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (!aKnown) return 0;
    return (a - b) * direction;
}

function favSortRecords(items) {
    const list = items.slice();
    if (favCfg.sort === 'etsy') return list.sort((a, b) => a.order - b.order);
    const reverse = favCfg.sortReversed === true;
    const text = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric: true });
    const numeric = (field, normalDirection) => (a, b) => favCompareKnownNumber(a[field], b[field], reverse ? -normalDirection : normalDirection);
    const textual = (field) => (a, b) => {
        const av=String(a[field]||'').trim(),bv=String(b[field]||'').trim();
        if(Boolean(av)!==Boolean(bv))return av?-1:1;
        return reverse?text(bv,av):text(av,bv);
    };
    const comparator = {
        price: numeric('price', 1),
        rating: (a, b) => numeric('rating', 1)(a, b) || favCompareKnownNumber(a.reviews, b.reviews, reverse ? 1 : -1),
        reviews: numeric('reviews', -1),
        discount: numeric('discountPercent', -1),
        title: textual('title'),
        shop: textual('shopName'),
        shipping: numeric('shipping', 1),
        carts: numeric('carts', -1),
        stock: numeric('stockLeft', 1),
    }[favCfg.sort] || ((a, b) => a.order - b.order);
    return list.sort((a, b) => comparator(a, b) || a.order - b.order);
}
