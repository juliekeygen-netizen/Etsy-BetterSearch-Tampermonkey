'use strict';

/* v0.14.0 authoritative Favorites catalogue service.
 *
 * This module is the only implementation that crawls a complete Favorites
 * dataset. UI loading, manual sync, stale auto-refresh and presentation-cache
 * migration all delegate here. Dataset-local in-flight state prevents one
 * collection from blocking another, while a cross-tab lease prevents two tabs
 * from needlessly crawling the same dataset at the same time.
 */
var FAV_CATALOG_PAGE_SIZE0141 = 20;
var FAV_CATALOG_LEASE_MS0141 = 30000;
var FAV_CATALOG_LEASE_POLL_MS0141 = 250;
var favCatalogInflight0141 = new Map();
var favCatalogStates0141 = new Map();
var favCatalogWorkerId0141 = globalThis.crypto?.randomUUID?.()
    || `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function favCatalogDescriptor0141(scope = favScope(), query = favDatasetQuery()) {
    const descriptor = { ...scope, query:String(query || '') };
    descriptor.scopeKey = favIndexScopeKey(descriptor);
    descriptor.datasetKey = `${descriptor.owner || ''}|${descriptor.type || 'items'}|${descriptor.id || ''}|q:${descriptor.query}`;
    descriptor.authoritativeFavoriteScope = descriptor.type === 'items' && !descriptor.query;
    return descriptor;
}

function favCatalogCurrentDescriptor0141() {
    return favCatalogDescriptor0141(favScope(), favDatasetQuery());
}

function favCatalogKey0141(scope) {
    return String(scope?.datasetKey || favCatalogDescriptor0141(scope, scope?.query || '').datasetKey);
}

function favCatalogIsCurrent0141(scope) {
    return isFavoritesPage() && favDatasetKey() === favCatalogKey0141(scope);
}

function favCatalogExpectedTotal0141(scope) {
    if (!favCatalogIsCurrent0141(scope)) return 0;
    const props = favProps();
    const liveQuery = String(props?.query || '').trim();
    if (normalize(scope.query) !== normalize(liveQuery)) return 0;
    return Math.max(0, Number(props?.totalListings) || 0);
}

function favCatalogState0141(scope) {
    const key = favCatalogKey0141(scope);
    return favCatalogStates0141.get(key) || {
        status:'idle', datasetKey:key, scopeKey:scope?.scopeKey || '', processed:0,
        expectedTotal:0, pagesProcessed:0, startedAt:0, completedAt:0,
        error:'', retryCount:0,
    };
}

function favCatalogPublish0141(scope, patch = {}) {
    const key = favCatalogKey0141(scope);
    const state = { ...favCatalogState0141(scope), ...patch, datasetKey:key, scopeKey:scope.scopeKey };
    favCatalogStates0141.set(key, state);
    document.dispatchEvent(new CustomEvent('ebsf:favorites-catalog-state', { detail:{ ...state, scope:{ ...scope } } }));
    return state;
}

function favCatalogProgressText0141(state) {
    if (state.expectedTotal) return `Loading favorites… ${Math.min(state.processed, state.expectedTotal)} / ${state.expectedTotal}`;
    return `Loading favorites… ${state.processed} loaded`;
}

function favCatalogLeaseName0141(scope) {
    return `etsy-bettersearch:favorites-catalog:${favCatalogKey0141(scope)}`;
}

function favCatalogLeaseStorageKey0141(scope) {
    return `etsy-bettersearch.catalog-lease.${encodeURIComponent(favCatalogKey0141(scope))}`;
}

function favCatalogReadLease0141(scope) {
    try {
        const raw = localStorage.getItem(favCatalogLeaseStorageKey0141(scope));
        const value = raw ? JSON.parse(raw) : null;
        return value && typeof value === 'object' ? value : null;
    } catch (_) {
        return null;
    }
}

function favCatalogWriteLease0141(scope, lease) {
    try {
        localStorage.setItem(favCatalogLeaseStorageKey0141(scope), JSON.stringify(lease));
        return true;
    } catch (_) {
        return false;
    }
}

function favCatalogReleaseLease0141(scope, token) {
    try {
        const current = favCatalogReadLease0141(scope);
        if (current?.token === token) localStorage.removeItem(favCatalogLeaseStorageKey0141(scope));
    } catch (_) {}
}

function favCatalogRefreshLease0141(scope, token) {
    const current = favCatalogReadLease0141(scope);
    if (current?.token !== token) return false;
    return favCatalogWriteLease0141(scope, { ...current, leaseUntil:Date.now() + FAV_CATALOG_LEASE_MS0141 });
}

async function favCatalogPeerCompleted0141(scope, requestedAt) {
    const stored = await favIndexGetScope(scope.scopeKey).catch(() => null);
    return Boolean(stored?.complete && Number(stored.lastCompleteSyncAt) >= requestedAt);
}

async function favCatalogAcquireStorageLease0141(scope, requestedAt, signal) {
    const token = `${favCatalogWorkerId0141}:${Math.random().toString(36).slice(2)}`;
    for (;;) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (await favCatalogPeerCompleted0141(scope, requestedAt)) return { peerCompleted:true, token:'' };
        const now = Date.now();
        const existing = favCatalogReadLease0141(scope);
        if (!existing || Number(existing.leaseUntil) <= now || existing.workerId === favCatalogWorkerId0141) {
            const next = { token, workerId:favCatalogWorkerId0141, datasetKey:favCatalogKey0141(scope), leaseUntil:now + FAV_CATALOG_LEASE_MS0141 };
            if (favCatalogWriteLease0141(scope, next) && favCatalogReadLease0141(scope)?.token === token) {
                return { peerCompleted:false, token };
            }
        }
        await sleep(FAV_CATALOG_LEASE_POLL_MS0141, signal);
    }
}

async function favCatalogWithCrossTabLease0141(scope, requestedAt, signal, work) {
    if (navigator?.locks?.request) {
        return navigator.locks.request(favCatalogLeaseName0141(scope), { mode:'exclusive', signal }, async () => {
            if (await favCatalogPeerCompleted0141(scope, requestedAt)) return { peerCompleted:true };
            return work(() => {});
        });
    }
    const lease = await favCatalogAcquireStorageLease0141(scope, requestedAt, signal);
    if (lease.peerCompleted) return { peerCompleted:true };
    try {
        return await work(() => favCatalogRefreshLease0141(scope, lease.token));
    } finally {
        favCatalogReleaseLease0141(scope, lease.token);
    }
}

function favCatalogRepeatedFingerprint0141(previous, records) {
    const fingerprint = records.map((record) => record.id).filter(Boolean).join(',');
    if (fingerprint && fingerprint === previous) throw new Error('Favorites endpoint repeated a page; catalogue refresh stopped safely.');
    return fingerprint;
}

async function favCatalogCrawlSimple0141(scope, controller, options = {}) {
    const liveNodes = favCardMap(document);
    const recordMap = new Map();
    let offset = 0;
    let pagesProcessed = 0;
    let repeatedFingerprint = '';
    let boundaryVerified = false;
    for (;;) {
        const payload = await favFetchJson(
            favApiUrlForScope(scope, offset, FAV_CATALOG_PAGE_SIZE0141, scope.query),
            controller.signal,
            3,
            (retryCount) => favCatalogPublish0141(scope, { retryCount }),
        );
        const listings = favApiListings(payload);
        const records = favRecordsFromListings(listings, offset, liveNodes);
        repeatedFingerprint = favCatalogRepeatedFingerprint0141(repeatedFingerprint, records);
        favMergeRecords(recordMap, records);
        pagesProcessed += 1;
        options.touchLease?.();
        const state = favCatalogPublish0141(scope, {
            status:'running', processed:recordMap.size, pagesProcessed,
            expectedTotal:options.expectedTotal || 0, lastProgressAt:Date.now(), retryCount:0,
        });
        if (options.uiProgress && favCatalogIsCurrent0141(scope)) favProgress(favCatalogProgressText0141(state));
        await favIndexObserveRecords(records, { scope, complete:false, syncState:'running' });
        if (listings.length < FAV_CATALOG_PAGE_SIZE0141) {
            boundaryVerified = true;
            break;
        }
        offset += FAV_CATALOG_PAGE_SIZE0141;
        if (options.pageDelayMs) await sleep(options.pageDelayMs, controller.signal);
    }
    return { records:Array.from(recordMap.values()).sort((a,b) => a.order - b.order), boundaryVerified, pagesProcessed };
}

async function favCatalogCrawlGroupQuery0141(scope, controller, options = {}) {
    const groupScope = favCatalogDescriptor0141({ ...scope, query:'' }, '');
    const group = await favCatalogCrawlSimple0141(groupScope, controller, { ...options, uiProgress:false });
    const queryScope = favCatalogDescriptor0141({ ...scope, type:'items', id:'' }, scope.query);
    const queried = await favCatalogCrawlSimple0141(queryScope, controller, { ...options, uiProgress:false });
    const groupIds = new Set(group.records.map((record) => record.id));
    const records = queried.records.filter((record) => groupIds.has(record.id)).map((record, order) => ({ ...record, order }));
    favCatalogPublish0141(scope, {
        status:'running', processed:records.length,
        pagesProcessed:group.pagesProcessed + queried.pagesProcessed,
        expectedTotal:options.expectedTotal || 0, lastProgressAt:Date.now(),
    });
    if (options.uiProgress && favCatalogIsCurrent0141(scope)) favProgress(`Loading matching favorites… ${records.length} found`);
    return { records, boundaryVerified:group.boundaryVerified && queried.boundaryVerified, pagesProcessed:group.pagesProcessed + queried.pagesProcessed };
}

function favCatalogCommitLive0141(scope, records) {
    if (!favCatalogIsCurrent0141(scope)) return false;
    favState.records = records.slice().sort((a,b) => a.order - b.order);
    favState.recordsById = new Map(favState.records.map((record) => [record.id, record]));
    favState.total = favState.records.length;
    favState.loadKey = favDatasetKey();
    favState.loadComplete = true;
    favState.loading = false;
    favState.loadSource0137 = 'network';
    favState.groupQueryResolved = scope.type !== 'group' || !scope.query || true;
    favState.extraReady = false;
    favState.extraKey = '';
    return true;
}

async function favCatalogLoadPeerSnapshot0141(scope) {
    if (!favCatalogIsCurrent0141(scope)) return [];
    await favPrimeDatasetFromCache0137?.({ force:true });
    return favState.records || [];
}

function favCatalogRefresh(scopeInput, options = {}) {
    const scope = favCatalogDescriptor0141(scopeInput, scopeInput?.query || '');
    const key = favCatalogKey0141(scope);
    const existing = favCatalogInflight0141.get(key);
    if (existing) return existing.promise;

    const requestedAt = Date.now();
    const controller = new AbortController();
    const expectedTotal = Math.max(0, Number(options.expectedTotal) || favCatalogExpectedTotal0141(scope));
    const applyLive = options.applyLive !== false;
    const bindCurrent = options.bindCurrent !== false && favCatalogIsCurrent0141(scope);
    if (bindCurrent) {
        favState.controller?.abort();
        favState.controller = controller;
        favState.loading = true;
        favState.loadKey = key;
        favState.loadComplete = false;
    }
    favCatalogPublish0141(scope, {
        status:'running', processed:0, expectedTotal, pagesProcessed:0,
        startedAt:requestedAt, completedAt:0, error:'', retryCount:0,
    });

    const promise = (async () => {
        let partialRecords = [];
        try {
            const leased = await favCatalogWithCrossTabLease0141(scope, requestedAt, controller.signal, async (touchLease) => {
                const crawlOptions = {
                    expectedTotal, touchLease, uiProgress:options.uiProgress === true,
                    pageDelayMs:Math.max(0, Number(options.pageDelayMs) || 0),
                };
                const result = scope.type === 'group' && scope.query
                    ? await favCatalogCrawlGroupQuery0141(scope, controller, crawlOptions)
                    : await favCatalogCrawlSimple0141(scope, controller, crawlOptions);
                partialRecords = result.records;
                if (!result.boundaryVerified) throw new Error('Favorites catalogue boundary was not verified.');
                await favIndexObserveRecords(result.records, { scope, complete:true, syncState:'completed' });
                await favIndexHydrateRecords(result.records);
                return { ...result, peerCompleted:false };
            });

            if (leased?.peerCompleted) {
                const records = await favCatalogLoadPeerSnapshot0141(scope);
                favCatalogPublish0141(scope, {
                    status:'completed', processed:records.length, completedAt:Date.now(),
                    lastProgressAt:Date.now(), error:'', retryCount:0, peerCompleted:true,
                });
                return records;
            }

            const records = leased.records || partialRecords;
            if (applyLive) favCatalogCommitLive0141(scope, records);
            if (favCatalogIsCurrent0141(scope)) {
                favClearProgress();
                const snapshot = await favCacheReadScope0137?.(favIndexCurrentScope()).catch(() => null);
                if (snapshot) {
                    favState.cacheScope0137 = snapshot.scopeRecord;
                    favState.cachePresentationReady0137 = favCachePresentationReadyForScope0137(snapshot);
                }
            }
            favCatalogPublish0141(scope, {
                status:'completed', processed:records.length, completedAt:Date.now(),
                lastProgressAt:Date.now(), error:'', retryCount:0,
            });
            return records;
        } catch (error) {
            const cancelled = error?.name === 'AbortError' || controller.signal.aborted;
            if (!cancelled && partialRecords.length) {
                await favIndexObserveRecords(partialRecords, { scope, complete:false, syncState:'partial' }).catch(() => {});
            }
            if (bindCurrent && favCatalogIsCurrent0141(scope)) {
                favState.loading = false;
                favState.loadComplete = false;
                if (!cancelled) {
                    favProgress(partialRecords.length
                        ? `Favorites load incomplete · ${partialRecords.length} items available`
                        : 'Could not load favorites. Try again later.');
                }
            }
            favCatalogPublish0141(scope, {
                status:cancelled ? 'cancelled' : 'error', completedAt:Date.now(),
                processed:partialRecords.length, error:cancelled ? '' : String(error?.message || error),
            });
            if (cancelled) return favCatalogIsCurrent0141(scope) ? favState.records : [];
            throw error;
        } finally {
            if (bindCurrent && favState.controller === controller) {
                favState.controller = null;
                favState.loading = false;
            }
        }
    })();

    const entry = { scope, controller, promise:null, requestedAt };
    const wrapped = promise.finally(() => {
        if (favCatalogInflight0141.get(key) === entry) favCatalogInflight0141.delete(key);
    });
    entry.promise = wrapped;
    favCatalogInflight0141.set(key, entry);
    return wrapped;
}

async function favCatalogAcquireCurrent(options = {}) {
    if (!isFavoritesPage()) return [];
    const scope = favCatalogCurrentDescriptor0141();
    const key = favCatalogKey0141(scope);
    const force = options.force === true;
    if (!force && favState.loadKey === key && favState.loadComplete && favState.loadSource0137 !== 'cache') return favState.records;

    if (!force) {
        const primed = await favPrimeDatasetFromCache0137?.();
        if (primed && favState.cachePresentationReady0137) return favState.records;
        if (primed) {
            return favCatalogRefresh(scope, {
                reason:'presentation-migration', applyLive:true, bindCurrent:true,
                uiProgress:true, expectedTotal:favCatalogExpectedTotal0141(scope),
            });
        }
    }

    return favCatalogRefresh(scope, {
        reason:force ? 'forced' : 'missing-cache', applyLive:true, bindCurrent:true,
        uiProgress:true, expectedTotal:favCatalogExpectedTotal0141(scope),
    });
}

function favCatalogCancel0141(scopeOrKey, reason = 'cancelled') {
    const key = typeof scopeOrKey === 'string' ? scopeOrKey : favCatalogKey0141(scopeOrKey);
    const entry = favCatalogInflight0141.get(key);
    if (!entry) return false;
    entry.cancelReason = reason;
    entry.controller.abort();
    return true;
}

function favCatalogInflight0141For(scopeOrKey) {
    const key = typeof scopeOrKey === 'string' ? scopeOrKey : favCatalogKey0141(scopeOrKey);
    return favCatalogInflight0141.get(key) || null;
}
