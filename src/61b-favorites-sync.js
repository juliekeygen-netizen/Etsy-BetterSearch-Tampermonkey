'use strict';

/* v0.14.0 sync compatibility/controller layer.
 *
 * Synchronization no longer has its own crawler. Manual sync, stale auto-sync
 * and current-scope refresh all delegate to FavoritesCatalogService. The
 * compatibility state below exists for the established progress/settings UI;
 * request ownership is dataset-local in the catalogue service.
 */
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
    return favSyncScopeDescriptor(favScope(), favDatasetQuery());
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
    document.dispatchEvent(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...next, controller:null } }));
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
    document.dispatchEvent(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...state, controller:null } }));

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
        document.dispatchEvent(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...completed, controller:null } }));
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
        document.dispatchEvent(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...failed, controller:null } }));
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

    /* Independent datasets may refresh concurrently. The catalogue service
     * deduplicates only identical dataset keys, so All can never block VNs. */
    await Promise.all(due.map((descriptor) => favSyncScope(descriptor, {
        independent:descriptor.authoritativeFavoriteScope,
        reason:'auto-sync',
        applyLive:favCatalogIsCurrent0141(descriptor),
    })));
    return true;
}

/* Keep established sync UI updated from the authoritative catalogue service. */
document.addEventListener('ebsf:favorites-catalog-state', (event) => {
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
    document.dispatchEvent(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...next, controller:null } }));
});
