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

function favLoadAll(force = false) {
    if (!isFavoritesPage()) return Promise.resolve([]);
    const key = favDatasetKey();
    if (!force && favState.loadKey === key && favState.loadComplete) return Promise.resolve(favState.records);
    if (!force && favState.loadKey === key && favState.loadPromise) return favState.loadPromise;
    favState.controller?.abort();
    const controller = new AbortController();
    favState.controller = controller;
    Object.assign(favState, { loading:true, loadKey:key, loadComplete:false, extraReady:false, extraKey:'', extraPromise:null, localPage:1, pageSize:20 });

    const promise = (async () => {
        const map = new Map();
        const limit = 20;
        const liveNodes = favCardMap(document);
        let complete = true;
        try {
            const props = favProps();
            const wantedQuery = favDatasetQuery();
            const liveQuery = String(props?.query || '').trim();
            const knownTotal = normalize(wantedQuery) === normalize(liveQuery) ? Math.max(0, Number(props?.totalListings) || 0) : 0;
            const scope = favScope();
            favState.groupQueryResolved = false;
            if (scope.type === 'group' && wantedQuery && scope.owner) {
                const groupMap = new Map();
                for (let offset = 0; ; offset += limit) {
                    const listings = favApiListings(await favFetchJson(favApiUrlForScope(scope, offset, limit), controller.signal));
                    favMergeRecords(groupMap, favRecordsFromListings(listings, offset, liveNodes));
                    if (listings.length < limit) break;
                }
                let queryOrder = 0;
                for (let offset = 0; ; offset += limit) {
                    const queryScope = { ...scope, type:'items', id:'' };
                    const listings = favApiListings(await favFetchJson(favApiUrlForScope(queryScope, offset, limit, wantedQuery), controller.signal));
                    for (const listing of listings) {
                        const idValue = String(listing?.listingId ?? listing?.listing_id ?? '');
                        if (!idValue || !groupMap.has(idValue)) continue;
                        const record = favRecordFromListing(listing, liveNodes.get(idValue), queryOrder++);
                        if (record.id) map.set(record.id, record);
                    }
                    favProgress(`Loading matching favorites… ${map.size} found`);
                    if (listings.length < limit) break;
                }
                favState.groupQueryResolved = true;
            } else if (knownTotal > 0) {
                const offsets = Array.from({ length:Math.ceil(knownTotal / limit) }, (_, index) => index * limit);
                let cursor = 0;
                await Promise.all(Array.from({ length:Math.min(3, offsets.length || 1) }, async () => {
                    while (cursor < offsets.length) {
                        const offset = offsets[cursor++];
                        const listings = await favFetchBatch(offset, limit, controller.signal);
                        favMergeRecords(map, favRecordsFromListings(listings, offset, liveNodes));
                        favProgress(`Loading favorites… ${Math.min(map.size, knownTotal)} / ${knownTotal}`);
                    }
                }));
            } else {
                for (let offset = 0; ; offset += limit) {
                    const listings = await favFetchBatch(offset, limit, controller.signal);
                    favMergeRecords(map, favRecordsFromListings(listings, offset, liveNodes));
                    favProgress(`Loading favorites… ${map.size} loaded`);
                    if (listings.length < limit) break;
                }
            }
            if (controller.signal.aborted || favState.loadKey !== key) return favState.records;
            favState.records = Array.from(map.values()).sort((a,b)=>a.order-b.order);
            favState.recordsById = new Map(favState.records.map((record)=>[record.id,record]));
            favState.total = favState.records.length;
            favState.loadComplete = true;
            favClearProgress();
            await favIndexObserveRecords(favState.records, { scope:favIndexCurrentScope(), complete:true });
            return favState.records;
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || favState.loadKey !== key) return favState.records;
            complete = false;
            console.warn('[Etsy BetterSearch] Favorites load incomplete:', error);
            favState.records = Array.from(map.values()).sort((a,b)=>a.order-b.order);
            favState.recordsById = new Map(favState.records.map((record)=>[record.id,record]));
            favState.total = Math.max(favState.records.length, Number(favState.total) || 0);
            await favIndexObserveRecords(favState.records, { scope:favIndexCurrentScope(), complete:false }).catch(()=>{});
            favProgress(favState.records.length ? `Favorites load incomplete · ${favState.records.length} items available` : 'Could not load favorites. Try again later.');
            return favState.records;
        } finally {
            if (favState.controller === controller) favState.loading = false;
            if (!complete) { favState.loadComplete = false; if (!controller.signal.aborted) controller.abort(); }
        }
    })();
    const wrapped = promise.finally(()=>{if(favState.loadPromise===wrapped)favState.loadPromise=null;});
    favState.loadPromise = wrapped;
    return wrapped;
}

function favExtraDatasetKey() { return `${favDatasetKey()}|${favState.records.map((record)=>record.id).join(',')}`; }

function favEnsureExtraInfo() {
    if (!favState.records.length) { favState.extraReady=true; return Promise.resolve(true); }
    const key=favExtraDatasetKey();
    if (favState.extraReady&&favState.extraKey===key)return Promise.resolve(true);
    if (favState.extraPromise&&favState.extraKey===key)return favState.extraPromise;
    const controller=favState.controller||new AbortController(),signal=controller.signal;
    Object.assign(favState,{extraKey:key,extraReady:false,extraLoading:true});
    const promise=(async()=>{const props=favProps(),country=String(props?.countryIsoCode||''),postal=String(props?.buyerPostalCode||'');try{
        for(let index=0;index<favState.records.length;index+=30){const batch=favState.records.slice(index,index+30).map((record)=>record.id);const url=new URL('/api/v3/ajax/bespoke/member/users/favorites/additional-listing-info',location.origin);batch.forEach((id)=>url.searchParams.append('listing_ids[]',id));if(country)url.searchParams.set('country_iso_code',country);url.searchParams.set('postal_code',postal);const data=await favFetchJson(url,signal);if(signal.aborted||favExtraDatasetKey()!==key)return false;
            for(const [listingId,extra] of Object.entries(data?.map||{})){const record=favState.recordsById.get(String(listingId));if(!record)continue;record.known=record.known||{};record.shippingFormatted=String(extra?.shipping_costs||'');record.shipping=favParseMoney(extra?.shipping_costs);record.known.shipping=Object.prototype.hasOwnProperty.call(extra||{},'shipping_costs');if(!Number.isFinite(record.shipping)&&record.hasFreeShipping)record.shipping=0;if(record.shipping===0)record.hasFreeShipping=true;record.estimatedDelivery=String(extra?.estimated_delivery||'');record.acceptsReturns=String(extra?.accepts_returns)==='1';record.acceptsExchanges=String(extra?.accepts_exchanges)==='1';record.known.acceptsReturns=Object.prototype.hasOwnProperty.call(extra||{},'accepts_returns');record.known.acceptsExchanges=Object.prototype.hasOwnProperty.call(extra||{},'accepts_exchanges');record.urgency=String(extra?.urgency_signal||'');const carts=record.urgency.match(/in\s+(\d+)\s+carts?/i),stock=record.urgency.match(/(?:only\s+)?(\d+)\s+left/i);record.carts=carts?Number(carts[1]):NaN;record.stockLeft=/\bone\s+left\b/i.test(record.urgency)?1:(stock?Number(stock[1]):NaN);}}
        if(favExtraDatasetKey()!==key)return false;favState.extraReady=true;await favIndexObserveRecords(favState.records,{scope:favIndexCurrentScope(),complete:false});return true;
    }catch(error){if(error?.name!=='AbortError'&&!signal.aborted)console.warn('[Etsy BetterSearch] Favorites extra metadata incomplete:',error);favState.extraReady=false;return false;}finally{if(favState.extraKey===key)favState.extraLoading=false;}})();
    favState.extraPromise=promise.finally(()=>{if(favState.extraKey===key)favState.extraPromise=null;});return favState.extraPromise;
}

function favNumericFilter(value,raw,comparison){if(raw===''||raw==null)return true;const target=Number(raw);return !Number.isFinite(target)||(Number.isFinite(value)&&comparison(value,target));}
function favGroupNativeQueryMatch(item){if(favCfg.strict||favCfg.multi||favScope().type!=='group'||favState.groupQueryResolved)return true;const words=normalize(favNativeQuery()).split(' ').filter(Boolean);if(!words.length)return true;const source=normalize(item.title);return words.every((word)=>source.includes(word));}

function favFilteredRecords(){const f=favCfg.filters,multiPlan=favCfg.multi?compileMultiPlan(favCfg.multiRules):null,strictQuery=favCfg.strict?normalize(favNativeQuery()):'';const titleMatch=(item)=>{if(!favGroupNativeQueryMatch(item))return false;const source=normalize(item.title);if(strictQuery){if(favCfg.strictMode==='phrase'&&!` ${source} `.includes(` ${strictQuery} `))return false;if(favCfg.strictMode==='all'){const tokens=new Set(source.split(' ').filter(Boolean));if(!strictQuery.split(' ').filter(Boolean).every((part)=>tokens.has(part)))return false;}}if(!multiPlan)return true;for(const rule of multiPlan.shared)if(!ruleMatchesTitle(item.title,rule))return false;if(multiPlan.branches.length&&!multiPlan.branches.some((rule)=>ruleMatchesTitle(item.title,rule)))return false;for(const rule of multiPlan.exclude)if(ruleMatchesTitle(item.title,rule))return false;return true;};const out=favState.records.filter((item)=>{if(!titleMatch(item))return false;if(!favNumericFilter(item.price,f.minPrice,(a,b)=>a>=b)||!favNumericFilter(item.price,f.maxPrice,(a,b)=>a<=b)||!favNumericFilter(item.discountPercent,f.minDiscount,(a,b)=>a>=b))return false;if(f.availableOnly&&(item.isSoldOut||item.isShopOnVacation))return false;if(f.onSale&&!item.isOnSale)return false;if(f.freeShipping&&!item.hasFreeShipping&&item.shipping!==0)return false;if(f.itemFormat==='digital'&&!(item.known?.isDownload&&item.isDownload))return false;if(f.itemFormat==='physical'&&item.known?.isDownload&&item.isDownload)return false;if(!favNumericFilter(item.rating,f.minRating,(a,b)=>a>=b)||!favNumericFilter(item.reviews,f.minReviews,(a,b)=>a>=b))return false;if(f.starSeller&&!item.isStarSeller)return false;if(f.bestSeller&&!item.isBestSeller)return false;if(f.personalizable&&!item.isPersonalizable)return false;if(f.hasVariations&&!item.hasVariations)return false;if(f.hasVideo&&!item.videoSources.length)return false;if(f.shop&&item.shopName!==f.shop)return false;if(!favNumericFilter(item.shipping,f.maxShipping,(a,b)=>a<=b))return false;if(f.returns&&!item.acceptsReturns)return false;if(f.exchanges&&!item.acceptsExchanges)return false;if(f.lowStock&&!Number.isFinite(item.stockLeft))return false;if(!favNumericFilter(item.carts,f.minCarts,(a,b)=>a>=b))return false;return true;});return favSortRecords(out);}

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
    const textual = (field) => (a, b) => (reverse ? text(b[field], a[field]) : text(a[field], b[field]));
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
