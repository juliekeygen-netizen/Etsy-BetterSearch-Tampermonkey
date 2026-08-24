'use strict';

/* v0.7.3 Favorites audit hardening.
 * This module intentionally layers on top of the initial Favorites modules so
 * the public behavior stays compatible while fixing lifecycle/race edge cases.
 */

favState.loadPromise = null;
favState.loadComplete = false;
favState.extraPromise = null;
favState.extraKey = '';
favState.nativeCaptured = false;
favState.groupQueryResolved = false;

function favDecodeEntitiesV073(value) {
    const text = String(value || '');
    if (!/[&][a-zA-Z#0-9]+;/.test(text)) return text;
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
}

var favRecordFromListingBaseV073 = favRecordFromListing;
favRecordFromListing = function favRecordFromListingDecoded(listing, node, order) {
    const record = favRecordFromListingBaseV073(listing, node, order);
    record.title = favDecodeEntitiesV073(record.title);
    record.shopName = favDecodeEntitiesV073(record.shopName);
    return record;
};

function favWaitUntilVisibleV073(signal) {
    if (!document.hidden) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            document.removeEventListener('visibilitychange', onChange);
            signal?.removeEventListener('abort', onAbort);
        };
        const onChange = () => {
            if (document.hidden) return;
            cleanup();
            resolve();
        };
        const onAbort = () => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };
        document.addEventListener('visibilitychange', onChange);
        if (signal) {
            if (signal.aborted) return onAbort();
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

async function favFetchJsonV073(url, signal, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const response = await fetch(url.href || url, {
                credentials: 'include',
                signal,
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) {
                const error = new Error(`Favorites endpoint returned HTTP ${response.status}`);
                const retryAfter = Number(response.headers.get('Retry-After'));
                if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
                throw error;
            }
            return await response.json();
        } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) throw error;
            lastError = error;
            await favWaitUntilVisibleV073(signal);
            const hinted = Math.max(0, Number(error?.retryAfterMs) || 0);
            const delay = Math.min(8000, Math.max(400 * (attempt + 1), hinted));
            await sleep(delay, signal);
        }
    }
    throw lastError || new Error('Favorites request failed');
}

/* A same-key caller must await the in-flight dataset load instead of receiving
 * the old (often empty) records array immediately. Failed/partial loads are not
 * treated as a complete cache, so the next operation can retry them. */
favLoadAll = function favLoadAllHardened(force = false) {
    if (!isFavoritesPage()) return Promise.resolve([]);
    const key = favDatasetKey();

    if (!force && favState.loadKey === key && favState.loadComplete) {
        return Promise.resolve(favState.records);
    }
    if (!force && favState.loadKey === key && favState.loadPromise) {
        return favState.loadPromise;
    }

    favState.controller?.abort();
    const controller = new AbortController();
    favState.controller = controller;
    favState.loading = true;
    favState.loadKey = key;
    favState.loadComplete = false;
    favState.extraReady = false;
    favState.extraKey = '';
    favState.extraPromise = null;
    favState.localPage = 1;
    favState.pageSize = 20;

    const promise = (async () => {
        const map = new Map();
        const limit = 20;
        const liveNodes = favCardMap(document);
        let complete = true;

        try {
            const props = favProps();
            const wantedQuery = favDatasetQuery();
            const liveQuery = String(props?.query || '').trim();
            const knownTotal = normalize(wantedQuery) === normalize(liveQuery)
                ? Math.max(0, Number(props?.totalListings) || 0)
                : 0;
            const scope = favScope();
            favState.groupQueryResolved = false;

            /* Etsy's generated-group endpoint has no query parameter. Preserve
             * native Favorites search semantics by intersecting the full group
             * membership with Etsy's normal Favorites query endpoint. */
            if (scope.type === 'group' && wantedQuery && scope.owner) {
                const groupMap = new Map();
                for (let offset = 0; ; offset += limit) {
                    const groupPayload = await favFetchJsonV073(favApiUrl(offset, limit), controller.signal);
                    const groupListings = favApiListings(groupPayload);
                    favMergeRecords(groupMap, favRecordsFromListings(groupListings, offset, liveNodes));
                    if (groupListings.length < limit) break;
                }

                let queryOrder = 0;
                for (let offset = 0; ; offset += limit) {
                    const url = new URL(`/api/v3/ajax/member/users/${encodeURIComponent(scope.owner)}/favorites/landing-listings`, location.origin);
                    url.searchParams.set('limit', String(limit));
                    url.searchParams.set('offset', String(offset));
                    url.searchParams.set('query', wantedQuery);
                    url.searchParams.set('include_additional_listing_images', 'true');
                    url.searchParams.set('rearrange_sold_out', 'true');
                    const payload = await favFetchJsonV073(url, controller.signal);
                    const listings = favApiListings(payload);
                    for (const listing of listings) {
                        const idValue = String(listing?.listingId ?? listing?.listing_id ?? '');
                        if (!idValue || !groupMap.has(idValue)) continue;
                        const record = favRecordFromListing(listing, liveNodes.get(idValue), queryOrder++);
                        if (record.id) map.set(record.id, record);
                    }
                    favProgress(`Loading matching favorites… ${map.size} found`);
                    if (listings.length < limit) break;
                }
                favState.total = map.size;
                favState.groupQueryResolved = true;
            } else if (knownTotal > 0) {
                const offsets = [];
                for (let offset = 0; offset < knownTotal; offset += limit) offsets.push(offset);
                let cursor = 0;
                const workers = Array.from({ length: Math.min(3, Math.max(1, offsets.length)) }, async () => {
                    while (cursor < offsets.length) {
                        const offset = offsets[cursor++];
                        const payload = await favFetchJsonV073(favApiUrl(offset, limit), controller.signal);
                        const listings = favApiListings(payload);
                        favMergeRecords(map, favRecordsFromListings(listings, offset, liveNodes));
                        favProgress(`Loading favorites… ${Math.min(map.size, knownTotal)} / ${knownTotal}`);
                    }
                });
                await Promise.all(workers);
                favState.total = knownTotal;
            } else {
                for (let offset = 0; ; offset += limit) {
                    const payload = await favFetchJsonV073(favApiUrl(offset, limit), controller.signal);
                    const listings = favApiListings(payload);
                    favMergeRecords(map, favRecordsFromListings(listings, offset, liveNodes));
                    favProgress(`Loading favorites… ${map.size} loaded`);
                    if (listings.length < limit) break;
                }
                favState.total = map.size;
            }

            if (controller.signal.aborted || favState.loadKey !== key) return favState.records;
            favState.records = Array.from(map.values()).sort((a, b) => a.order - b.order);
            favState.recordsById = new Map(favState.records.map((item) => [item.id, item]));
            if (!favState.total) favState.total = favState.records.length;
            favState.loadComplete = true;
            favClearProgress();
            favIndexObserveRecords(favState.records, {
                scope: favIndexCurrentScope(),
                complete: true,
            }).catch((error) => console.warn('[Etsy BetterSearch] Favorites index update failed:', error));
            return favState.records;
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || favState.loadKey !== key) {
                return favState.records;
            }
            complete = false;
            console.warn('[Etsy BetterSearch] Favorites load incomplete:', error);
            favState.records = Array.from(map.values()).sort((a, b) => a.order - b.order);
            favState.recordsById = new Map(favState.records.map((item) => [item.id, item]));
            favState.total = Math.max(favState.records.length, Number(favState.total) || 0);
            favState.loadComplete = false;
            favIndexObserveRecords(favState.records, {
                scope: favIndexCurrentScope(),
                complete: false,
            }).catch((indexError) => console.warn('[Etsy BetterSearch] Partial Favorites index update failed:', indexError));
            favProgress(favState.records.length
                ? `Favorites load incomplete · ${favState.records.length} items available · retry by changing a filter or sort`
                : 'Could not load favorites. Etsy may have throttled the request; try again.');
            return favState.records;
        } finally {
            if (favState.controller === controller) favState.loading = false;
            if (!complete) favState.loadComplete = false;
        }
    })();

    const wrappedPromise = promise.finally(() => {
        if (favState.loadPromise === wrappedPromise) favState.loadPromise = null;
    });
    favState.loadPromise = wrappedPromise;
    return wrappedPromise;
};

function favExtraDatasetKeyV073() {
    return `${favDatasetKey()}|${favState.records.map((item) => item.id).join(',')}`;
}

/* Extra metadata now has the same promise/race semantics as the main dataset.
 * A collection change aborts/discards stale responses rather than letting an old
 * request mark the new collection as "extraReady". */
favEnsureExtraInfo = function favEnsureExtraInfoHardened() {
    if (!favState.records.length) {
        favState.extraReady = true;
        return Promise.resolve(true);
    }
    const key = favExtraDatasetKeyV073();
    if (favState.extraReady && favState.extraKey === key) return Promise.resolve(true);
    if (favState.extraPromise && favState.extraKey === key) return favState.extraPromise;

    const controller = favState.controller || new AbortController();
    const signal = controller.signal;
    favState.extraKey = key;
    favState.extraReady = false;
    favState.extraLoading = true;

    const promise = (async () => {
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
                const data = await favFetchJsonV073(url, signal);
                if (signal.aborted || favExtraDatasetKeyV073() !== key) return false;

                for (const [listingId, extra] of Object.entries(data?.map || {})) {
                    const record = favState.recordsById.get(String(listingId));
                    if (!record) continue;
                    record.shippingFormatted = String(extra?.shipping_costs || '');
                    record.shipping = favParseMoney(extra?.shipping_costs);
                    record.known = record.known || {};
                    record.known.shipping = extra && Object.prototype.hasOwnProperty.call(extra, 'shipping_costs');
                    if (!Number.isFinite(record.shipping) && record.hasFreeShipping) record.shipping = 0;
                    if (record.shipping === 0) record.hasFreeShipping = true;
                    record.estimatedDelivery = String(extra?.estimated_delivery || '');
                    record.acceptsReturns = String(extra?.accepts_returns) === '1';
                    record.acceptsExchanges = String(extra?.accepts_exchanges) === '1';
                    record.known.acceptsReturns = extra && Object.prototype.hasOwnProperty.call(extra, 'accepts_returns');
                    record.known.acceptsExchanges = extra && Object.prototype.hasOwnProperty.call(extra, 'accepts_exchanges');
                    record.urgency = String(extra?.urgency_signal || '');
                    const carts = record.urgency.match(/in\s+(\d+)\s+carts?/i);
                    const stock = record.urgency.match(/(?:only\s+)?(\d+)\s+left/i);
                    record.carts = carts ? Number(carts[1]) : NaN;
                    record.stockLeft = /\bone\s+left\b/i.test(record.urgency) ? 1 : (stock ? Number(stock[1]) : NaN);
                }
            }
            if (favExtraDatasetKeyV073() !== key) return false;
            favState.extraReady = true;
            favIndexObserveRecords(favState.records, {
                scope: favIndexCurrentScope(),
                complete: false,
            }).catch((error) => console.warn('[Etsy BetterSearch] Favorites auxiliary index update failed:', error));
            return true;
        } catch (error) {
            if (error?.name !== 'AbortError' && !signal.aborted) {
                console.warn('[Etsy BetterSearch] Favorites extra metadata incomplete:', error);
            }
            favState.extraReady = false;
            return false;
        } finally {
            if (favState.extraKey === key) favState.extraLoading = false;
        }
    })();

    favState.extraPromise = promise.finally(() => {
        if (favState.extraKey === key) favState.extraPromise = null;
    });
    return favState.extraPromise;
};

var favNeedsExtraInfoBaseV073 = favNeedsExtraInfo;
favNeedsExtraInfo = function favNeedsExtraInfoHardened() {
    return favNeedsExtraInfoBaseV073() || favCfg.filters.freeShipping === true;
};

/* Preserve a real empty native grid. The old implementation used
 * nativeOrder.length as its "captured" flag, so a zero-result page could later
 * capture BetterSearch's own empty-state row as native content. */
favCaptureNativeGrid = function favCaptureNativeGridHardened() {
    const grid = favMainGrid();
    if (!grid) return;
    if (favState.nativeGrid === grid && favState.nativeCaptured) return;
    if (favState.rendered && favState.nativeGrid === grid) return;
    favState.nativeGrid = grid;
    favState.nativeOrder = Array.from(grid.children);
    favState.nativeNodes = favCardMap(document);
    favState.nativeCaptured = true;
    favState.rendered = false;
};

favRestoreNative = function favRestoreNativeHardenedV073() {
    const grid = favState.nativeGrid;
    if (favState.rendered && grid?.isConnected && favState.nativeCaptured) {
        favState.rendering = true;
        grid.replaceChildren(...favState.nativeOrder);
        queueMicrotask(() => { favState.rendering = false; });
    }
    document.querySelector('[data-ebsf-pagination]')?.remove();
    favState.countNode?.remove();
    favState.countNode = null;
    favState.rendered = false;
    favState.filtered = [];
    document.body?.classList.remove('ebsf-results-active');
};

function favRemoveLocalFavoriteV073(idValue) {
    const idString = String(idValue || '');
    if (!idString || !favState.recordsById.has(idString)) return false;
    favState.recordsById.delete(idString);
    favState.records = favState.records.filter((item) => item.id !== idString);
    favState.nativeNodes.delete(idString);
    favState.nativeOrder = favState.nativeOrder.filter((node) => favListingIdFromNode(node) !== idString);
    favState.total = Math.max(0, (Number(favState.total) || favState.records.length + 1) - 1);
    favState.loadComplete = favState.loadComplete && true;
    favIndexMarkUnfavorite(idString).catch((error) => console.warn('[Etsy BetterSearch] Could not update unfavorite index state:', error));
    return true;
}

/* Current-page cards keep Etsy's native favorite listener. Observe the result of
 * that native action and update the BetterSearch dataset too, so removing a
 * favorite cannot leave a ghost card that reappears on local pagination/reset. */
document.addEventListener('click', (event) => {
    if (!isFavoritesPage()) return;
    const card = event.target?.closest?.('.favorites-landing-listing-card-container:not([data-ebsf-transplanted="1"])');
    if (!card) return;
    const button = favoriteButtonFromEvent(event.target);
    if (!button || !isFavoritedButton(button)) return;
    const idValue = card.dataset.ebsfId || favListingIdFromNode(card);
    if (!idValue) return;
    setTimeout(() => {
        const currentButton = card.querySelector('button[aria-label*="Favorite" i], button[data-accessible-btn-fave], [data-favorite-button]') || button;
        if (card.isConnected && isFavoritedButton(currentButton)) return;
        const removed = document.body.classList.contains('ebsf-results-active') && favRemoveLocalFavoriteV073(idValue);
        if (!removed) favIndexMarkUnfavorite(idValue).catch(() => {});
        if (removed) favRenderCurrent();
    }, 900);
}, false);

/* Avoid compiling the Favorites Multi-search rule graph once per listing. Also
 * make "Available only" exclude vacationing shops, and preserve the native query
 * for generated groups whose Etsy group endpoint has no query parameter. */
function favGroupNativeQueryMatchV073(item) {
    if (favCfg.strict || favCfg.multi || favScope().type !== 'group' || favState.groupQueryResolved) return true;
    const raw = favNativeQuery();
    if (!raw) return true;
    const source = normalize(item.title);
    const words = normalize(raw).split(' ').filter(Boolean);
    return words.every((word) => source.includes(word));
}

favFilteredRecords = function favFilteredRecordsHardened() {
    const f = favCfg.filters;
    const multiPlan = favCfg.multi ? compileMultiPlan(favCfg.multiRules) : null;
    const strictQuery = favCfg.strict ? normalize(favNativeQuery()) : '';

    const strictMatch = (title) => {
        if (!favCfg.strict || !strictQuery) return true;
        const source = normalize(title);
        if (favCfg.strictMode === 'phrase') return ` ${source} `.includes(` ${strictQuery} `);
        const tokens = new Set(source.split(' ').filter(Boolean));
        return strictQuery.split(' ').filter(Boolean).every((part) => tokens.has(part));
    };
    const multiMatch = (item) => {
        if (!multiPlan) return true;
        for (const rule of multiPlan.shared) if (!ruleMatchesTitle(item.title, rule)) return false;
        if (multiPlan.branches.length && !multiPlan.branches.some((rule) => ruleMatchesTitle(item.title, rule))) return false;
        for (const rule of multiPlan.exclude) if (ruleMatchesTitle(item.title, rule)) return false;
        return true;
    };

    const out = favState.records.filter((item) => {
        if (!favGroupNativeQueryMatchV073(item) || !strictMatch(item.title) || !multiMatch(item)) return false;
        if (!favNumericFilter(item.price, f.minPrice, (a,b) => a >= b)) return false;
        if (!favNumericFilter(item.price, f.maxPrice, (a,b) => a <= b)) return false;
        if (!favNumericFilter(item.discountPercent, f.minDiscount, (a,b) => a >= b)) return false;
        if (f.availableOnly && (item.isSoldOut || item.isShopOnVacation)) return false;
        if (f.onSale && !item.isOnSale) return false;
        if (f.freeShipping && !item.hasFreeShipping && item.shipping !== 0) return false;
        if (f.itemFormat === 'digital' && !(item.known?.isDownload && item.isDownload)) return false;
        if (f.itemFormat === 'physical' && item.known?.isDownload && item.isDownload) return false;
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
};

/* Harden scope changes: invalidate all completion/promise markers along with the
 * original caches so no old collection can satisfy a new collection's request. */
var favResetForNativeChangeBaseV073 = favResetForNativeChange;
favResetForNativeChange = function favResetForNativeChangeAuditHardened() {
    favState.loadPromise = null;
    favState.loadComplete = false;
    favState.extraPromise = null;
    favState.extraKey = '';
    favState.extraReady = false;
    favState.nativeCaptured = false;
    favState.groupQueryResolved = false;
    return favResetForNativeChangeBaseV073();
};

/* Keep the Favorites rule editor consistent with the main editor's modal
 * behavior: lock background scrolling, close on backdrop/Escape, and clean up. */
var favOpenMultiModalBaseV073 = favOpenMultiModal;
favOpenMultiModal = function favOpenMultiModalHardened() {
    const existed = Boolean(favState.ruleModal);
    const result = favOpenMultiModalBaseV073();
    if (existed || !favState.ruleModal) return result;
    lockPageScroll();
    const layer = favState.ruleModal;
    layer.addEventListener('pointerdown', (event) => {
        if (event.target === layer) favCloseMultiModal();
    });
    return result;
};

var favCloseMultiModalBaseV073 = favCloseMultiModal;
favCloseMultiModal = function favCloseMultiModalHardened() {
    const hadModal = Boolean(favState.ruleModal);
    const result = favCloseMultiModalBaseV073();
    if (hadModal) unlockPageScroll();
    return result;
};

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (favState.settingsModal) return;
        if (favState.ruleModal) favCloseMultiModal();
        else if (favState.filterOpen) favCloseFilters();
        else favCloseSortMenu();
    }
});
