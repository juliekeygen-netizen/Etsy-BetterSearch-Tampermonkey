'use strict';

/* v0.14.0 Favorites catalogue service + sync compatibility layer.
 *
 * This module is the single owner of complete Favorites dataset crawling.
 * favLoadAll(), manual Sync now, stale auto-sync and background refresh all
 * delegate here. Request ownership is keyed by dataset rather than by one
 * global sync promise, and complete snapshots are committed only after a
 * verified short-page boundary.
 */
var FAV_CATALOG_PAGE_SIZE0141 = 20;
var FAV_CATALOG_LEASE_MS0141 = 30000;
var FAV_CATALOG_LEASE_POLL_MS0141 = 250;
var favCatalogInflight0141 = new Map();
var favCatalogStates0141 = new Map();
var favCatalogWorkerId0141 = globalThis.crypto?.randomUUID?.()
    || `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function favCatalogDescriptor0141(scope = favScope(), query = typeof favDatasetQuery === 'function' ? favDatasetQuery() : '') {
    const descriptor = { ...scope, query:String(query || '') };
    descriptor.scopeKey = favIndexScopeKey(descriptor);
    descriptor.datasetKey = `${descriptor.owner || ''}|${descriptor.type || 'items'}|${descriptor.id || ''}|q:${descriptor.query}`;
    descriptor.authoritativeFavoriteScope = descriptor.type === 'items' && !descriptor.query;
    return descriptor;
}

function favCatalogCurrentDescriptor0141() {
    return favCatalogDescriptor0141(favScope(), typeof favDatasetQuery === 'function' ? favDatasetQuery() : '');
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
    const normalizeValue = typeof normalize === 'function' ? normalize : (value) => String(value || '').trim().toLowerCase();
    if (normalizeValue(scope.query) !== normalizeValue(liveQuery)) return 0;
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
    document.dispatchEvent?.(new CustomEvent('ebsf:favorites-catalog-state', { detail:{ ...state, scope:{ ...scope } } }));
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

function favCatalogStorage0141() {
    try { return globalThis.localStorage || null; } catch (_) { return null; }
}

function favCatalogReadLease0141(scope) {
    try {
        const raw = favCatalogStorage0141()?.getItem(favCatalogLeaseStorageKey0141(scope));
        const value = raw ? JSON.parse(raw) : null;
        return value && typeof value === 'object' ? value : null;
    } catch (_) {
        return null;
    }
}

function favCatalogWriteLease0141(scope, lease) {
    try {
        const storage = favCatalogStorage0141();
        if (!storage) return false;
        storage.setItem(favCatalogLeaseStorageKey0141(scope), JSON.stringify(lease));
        return true;
    } catch (_) {
        return false;
    }
}

function favCatalogReleaseLease0141(scope, token) {
    try {
        const current = favCatalogReadLease0141(scope);
        if (current?.token === token) favCatalogStorage0141()?.removeItem(favCatalogLeaseStorageKey0141(scope));
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
    const locks = globalThis.navigator?.locks;
    if (locks?.request) {
        return locks.request(favCatalogLeaseName0141(scope), { mode:'exclusive', signal }, async () => {
            if (await favCatalogPeerCompleted0141(scope, requestedAt)) return { peerCompleted:true };
            return work(() => {});
        });
    }
    const storage = favCatalogStorage0141();
    if (!storage) return work(() => {});
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

/* Catalogue-local merge semantics: keep the earliest Etsy order for duplicate
 * listing IDs while accepting fresher fields from that earlier observation.
 * The crawler therefore has no hidden dependency on 61-favorites-data.js. */
function favCatalogMergeRecords0141(map, records) {
    for (const record of records) {
        const old = map.get(record.id);
        if (!old || record.order < old.order) {
            map.set(record.id, old ? { ...old, ...record, order:Math.min(old.order, record.order) } : record);
        }
    }
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
        favCatalogMergeRecords0141(recordMap, records);
        pagesProcessed += 1;
        options.touchLease?.();
        const state = favCatalogPublish0141(scope, {
            status:'running', processed:recordMap.size, pagesProcessed,
            expectedTotal:options.expectedTotal || 0, lastProgressAt:Date.now(), retryCount:0,
        });
        if (options.uiProgress && favCatalogIsCurrent0141(scope) && typeof favProgress === 'function') favProgress(favCatalogProgressText0141(state));
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
    if (options.uiProgress && favCatalogIsCurrent0141(scope) && typeof favProgress === 'function') favProgress(`Loading matching favorites… ${records.length} found`);
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
    favState.groupQueryResolved = true;
    favState.extraReady = false;
    favState.extraKey = '';
    return true;
}

async function favCatalogLoadPeerSnapshot0141(scope) {
    if (!favCatalogIsCurrent0141(scope)) return [];
    if (typeof favPrimeDatasetFromCache0137 === 'function') await favPrimeDatasetFromCache0137({ force:true });
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
        favState.controller?.abort?.();
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
            if (applyLive || favCatalogIsCurrent0141(scope)) favCatalogCommitLive0141(scope, records);
            if (favCatalogIsCurrent0141(scope)) {
                if (typeof favClearProgress === 'function') favClearProgress();
                if (typeof favCacheReadScope0137 === 'function') {
                    const snapshot = await favCacheReadScope0137(favIndexCurrentScope()).catch(() => null);
                    if (snapshot) {
                        favState.cacheScope0137 = snapshot.scopeRecord;
                        favState.cachePresentationReady0137 = typeof favCachePresentationReadyForScope0137 === 'function'
                            ? favCachePresentationReadyForScope0137(snapshot)
                            : true;
                    }
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
                if (!cancelled && typeof favProgress === 'function') {
                    favProgress(partialRecords.length
                        ? `Favorites load incomplete · ${partialRecords.length} items available`
                        : 'Could not load favorites. Try again later.');
                }
            }
            favCatalogPublish0141(scope, {
                status:cancelled ? 'cancelled' : 'error', completedAt:Date.now(),
                processed:partialRecords.length, error:cancelled ? '' : String(error?.message || error),
            });
            if (cancelled) return favCatalogIsCurrent0141(scope) ? (favState.records || []) : [];
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

    if (!force && typeof favPrimeDatasetFromCache0137 === 'function') {
        const primed = await favPrimeDatasetFromCache0137();
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

/* Sync UI/controller compatibility. It does not implement another crawler. */
var FAV_SYNC_STALE_MS = 12 * 60 * 60 * 1000;
var FAV_SYNC_PAGE_DELAY_MS = 120;
var favSyncSequence = 0;
var favSyncStates0141 = new Map();

function favSyncCreateState() {
    return {
        status:'idle', jobId:0, scope:null, scopeKey:'', datasetKey:'', independent:false,
        processed:0, expectedTotal:0, pagesProcessed:0, startedAt:0,
        lastProgressAt:0, completedAt:0, estimatedRemainingMs:0,
        controller:null, error:'', retryCount:0, promise:null,
    };
}

var favSyncState = favSyncCreateState();

function favSyncIsDue(scopeRecord, now = Date.now(), staleMs = FAV_SYNC_STALE_MS) {
    const completedAt = Number(scopeRecord?.lastCompleteSyncAt) || 0;
    return !completedAt || now - completedAt >= staleMs;
}

function favSyncScopeDescriptor(scope, query = '') {
    return favCatalogDescriptor0141(scope, query);
}

function favSyncAllItemsScope() {
    const current = favScope();
    return favSyncScopeDescriptor({ type:'items', id:'', owner:current.owner, login:current.login }, '');
}

function favSyncCurrentScope() {
    return favSyncScopeDescriptor(favScope(), typeof favDatasetQuery === 'function' ? favDatasetQuery() : '');
}

function favSyncJobIsCurrent(jobId, scopeKey) {
    return favSyncState.jobId === jobId && favSyncState.scopeKey === scopeKey;
}

function favSyncProgressModel(state = favSyncState) {
    const processed = Math.max(0, Number(state.processed) || 0);
    const expected = Math.max(0, Number(state.expectedTotal) || 0);
    const ratio = expected ? Math.min(1, processed / expected) : 0;
    const remainingPages = expected ? Math.max(0, Math.ceil((expected - processed) / FAV_CATALOG_PAGE_SIZE0141)) : 0;
    const eta = state.estimatedRemainingMs ? ` · ~${Math.max(1, Math.round(state.estimatedRemainingMs / 1000))}s` : '';
    return {
        title:'Syncing',
        detail:expected
            ? `${processed} / ${expected}${remainingPages ? ` · ${remainingPages} ${remainingPages === 1 ? 'page' : 'pages'} left` : ''}${eta}`
            : `${processed} indexed · ${state.pagesProcessed || 0} ${state.pagesProcessed === 1 ? 'page' : 'pages'} processed${eta}`,
        ratio,
    };
}

function favSyncSetState(patch, datasetKey = favSyncState.datasetKey) {
    const current = datasetKey ? (favSyncStates0141.get(datasetKey) || favSyncCreateState()) : favSyncState;
    const next = { ...current, ...patch };
    if (datasetKey) favSyncStates0141.set(datasetKey, next);
    if (!favSyncState.datasetKey || favSyncState.datasetKey === datasetKey || patch.makeCurrent === true) {
        favSyncState = { ...next };
    }
    delete favSyncState.makeCurrent;
    document.dispatchEvent?.(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...next, controller:null } }));
    return next;
}

function favSyncExpectedTotal(scope) {
    return favCatalogExpectedTotal0141(scope);
}

function favSyncScope(scopeInput, options = {}) {
    const scope = favSyncScopeDescriptor(scopeInput, scopeInput?.query || '');
    if (!scope?.owner) {
        return Promise.resolve(favSyncSetState({ status:'error', error:'Could not determine the Favorites profile owner.', completedAt:Date.now(), controller:null, makeCurrent:true }, scope.datasetKey));
    }
    const datasetKey = favCatalogKey0141(scope);
    const existingState = favSyncStates0141.get(datasetKey);
    if (existingState?.status === 'running' && existingState.promise) {
        favSyncState = existingState;
        return existingState.promise;
    }

    const jobId = ++favSyncSequence;
    const startedAt = Date.now();
    const expectedTotal = Math.max(0, Number(options.expectedTotal) || favSyncExpectedTotal(scope));
    const independent = options.independent === true || scope.authoritativeFavoriteScope === true;
    const state = {
        status:'running', jobId, scope, scopeKey:scope.scopeKey, datasetKey, independent,
        processed:0, expectedTotal, pagesProcessed:0, startedAt, lastProgressAt:startedAt,
        completedAt:0, estimatedRemainingMs:0, controller:null, error:'', retryCount:0,
        promise:null,
    };
    favSyncStates0141.set(datasetKey, state);
    favSyncState = state;
    document.dispatchEvent?.(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...state, controller:null } }));

    const applyLive = options.applyLive !== false && favCatalogIsCurrent0141(scope);
    const promise = favCatalogRefresh(scope, {
        reason:options.reason || 'sync',
        applyLive,
        bindCurrent:false,
        expectedTotal,
        pageDelayMs:FAV_SYNC_PAGE_DELAY_MS,
        uiProgress:false,
    }).then((records) => {
        const catalogState = favCatalogState0141(scope);
        const completed = {
            ...state,
            status:catalogState.status === 'cancelled' ? 'cancelled' : 'completed',
            processed:Number(catalogState.processed) || records.length,
            expectedTotal:Number(catalogState.expectedTotal) || expectedTotal,
            pagesProcessed:Number(catalogState.pagesProcessed) || 0,
            lastProgressAt:Date.now(), completedAt:Date.now(), estimatedRemainingMs:0,
            error:'', retryCount:0, controller:null,
        };
        favSyncStates0141.set(datasetKey, completed);
        if (favSyncState.datasetKey === datasetKey) favSyncState = completed;
        document.dispatchEvent?.(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...completed, controller:null } }));
        return completed;
    }).catch((error) => {
        const cancelled = error?.name === 'AbortError' || favCatalogState0141(scope).status === 'cancelled';
        const failed = {
            ...state,
            status:cancelled ? 'cancelled' : 'error',
            completedAt:Date.now(), lastProgressAt:Date.now(), controller:null,
            error:cancelled ? '' : String(error?.message || error),
        };
        favSyncStates0141.set(datasetKey, failed);
        if (favSyncState.datasetKey === datasetKey) favSyncState = failed;
        document.dispatchEvent?.(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...failed, controller:null } }));
        return failed;
    });

    state.promise = promise;
    favSyncStates0141.set(datasetKey, state);
    favSyncState = state;
    return promise;
}

function favCancelSync(reason = 'cancelled') {
    if (favSyncState.status !== 'running' || !favSyncState.datasetKey) return false;
    favSyncState.cancelReason = reason;
    return favCatalogCancel0141(favSyncState.datasetKey, reason);
}

function favSyncHandleRouteChange() {
    if (favSyncState.status !== 'running' || !favSyncState.scope) return;
    const current = favSyncCurrentScope();
    const ownerChanged = String(current.owner || '') !== String(favSyncState.scope.owner || '');
    const datasetChanged = favCatalogKey0141(current) !== favSyncState.datasetKey;
    if (ownerChanged || (!favSyncState.independent && datasetChanged)) favCancelSync('route-change');
}

async function favMaybeAutoSync(forceCheck = false) {
    if (!favCfg.autoSync || !isFavoritesPage() || !favIsOwnFavoritesPage()) return false;
    const current = favSyncCurrentScope();
    const checkKey = `${current.owner}|${current.scopeKey}`;
    const now = Date.now();
    if (!forceCheck && favState.autoSyncCheckKey === checkKey && now - favState.autoSyncCheckAt < 60000) return false;
    favState.autoSyncCheckKey = checkKey;
    favState.autoSyncCheckAt = now;

    const allItems = favSyncAllItemsScope();
    const descriptors = [allItems];
    if (current.scopeKey !== allItems.scopeKey) descriptors.push(current);
    const due = [];
    for (const descriptor of descriptors) {
        const stored = await favIndexGetScope(descriptor.scopeKey);
        if (!favCfg.autoSync || !favSyncIsDue(stored, Date.now())) continue;
        due.push(descriptor);
    }
    if (!due.length) return false;

    await Promise.all(due.map((descriptor) => favSyncScope(descriptor, {
        independent:descriptor.authoritativeFavoriteScope,
        reason:'auto-sync',
        applyLive:favCatalogIsCurrent0141(descriptor),
    })));
    return true;
}

/* Keep the established sync UI updated from the authoritative catalogue service. */
document.addEventListener?.('ebsf:favorites-catalog-state', (event) => {
    const detail = event.detail || {};
    const datasetKey = String(detail.datasetKey || '');
    const state = favSyncStates0141.get(datasetKey);
    if (!state || state.status !== 'running') return;
    const elapsed = Math.max(1, Date.now() - state.startedAt);
    const processed = Math.max(0, Number(detail.processed) || 0);
    const expected = Math.max(0, Number(detail.expectedTotal) || state.expectedTotal || 0);
    const rate = processed / elapsed;
    const next = {
        ...state,
        processed,
        expectedTotal:expected,
        pagesProcessed:Number(detail.pagesProcessed) || state.pagesProcessed || 0,
        lastProgressAt:Date.now(),
        retryCount:Number(detail.retryCount) || 0,
        estimatedRemainingMs:expected && rate ? Math.max(0, (expected - processed) / rate) : 0,
    };
    favSyncStates0141.set(datasetKey, next);
    if (favSyncState.datasetKey === datasetKey) favSyncState = next;
    document.dispatchEvent?.(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...next, controller:null } }));
});
