'use strict';

var FAV_SYNC_STALE_MS = 12 * 60 * 60 * 1000;
var FAV_SYNC_PAGE_DELAY_MS = 120;
var favSyncSequence = 0;

function favSyncCreateState() {
    return {
        status: 'idle', jobId: 0, scope: null, scopeKey: '', independent: false,
        processed: 0, expectedTotal: 0, pagesProcessed: 0, startedAt: 0,
        lastProgressAt: 0, completedAt: 0, estimatedRemainingMs: 0,
        controller: null, error: '', retryCount: 0,
    };
}

var favSyncState = favSyncCreateState();

function favSyncIsDue(scopeRecord, now = Date.now(), staleMs = FAV_SYNC_STALE_MS) {
    const completedAt = Number(scopeRecord?.lastCompleteSyncAt) || 0;
    return !completedAt || now - completedAt >= staleMs;
}

function favSyncScopeDescriptor(scope, query = '') {
    const descriptor = { ...scope, query:String(query || '') };
    descriptor.scopeKey = favIndexScopeKey(descriptor);
    descriptor.authoritativeFavoriteScope = descriptor.type === 'items' && !descriptor.query;
    return descriptor;
}

function favSyncAllItemsScope() {
    const current = favScope();
    return favSyncScopeDescriptor({ type:'items', id:'', owner:current.owner, login:current.login }, '');
}

function favSyncCurrentScope() {
    return favSyncScopeDescriptor(favScope(), favNativeQuery());
}

function favSyncJobIsCurrent(jobId, scopeKey) {
    return favSyncState.jobId === jobId && favSyncState.scopeKey === scopeKey;
}

function favSyncProgressModel(state = favSyncState) {
    const processed = Math.max(0, Number(state.processed) || 0);
    const expected = Math.max(0, Number(state.expectedTotal) || 0);
    const ratio = expected ? Math.min(1, processed / expected) : 0;
    const remainingPages = expected ? Math.max(0, Math.ceil((expected - processed) / 20)) : 0;
    const eta = state.estimatedRemainingMs ? ` · ~${Math.max(1, Math.round(state.estimatedRemainingMs / 1000))}s` : '';
    return {
        title: 'Syncing',
        detail: expected
            ? `${processed} / ${expected}${remainingPages ? ` · ${remainingPages} ${remainingPages === 1 ? 'page' : 'pages'} left` : ''}${eta}`
            : `${processed} indexed · ${state.pagesProcessed || 0} ${state.pagesProcessed === 1 ? 'page' : 'pages'} processed${eta}`,
        ratio,
    };
}

function favSyncSetState(patch) {
    favSyncState = { ...favSyncState, ...patch };
    document.dispatchEvent(new CustomEvent('ebsf:favorites-sync-state', { detail:{ ...favSyncState, controller:null } }));
    return favSyncState;
}

function favSyncExpectedTotal(scope) {
    const current = favSyncCurrentScope();
    if (current.scopeKey !== scope.scopeKey) return 0;
    return Math.max(0, Number(favProps()?.totalListings) || 0);
}

async function favSyncObservePage(records, scope, status) {
    if (!records.length) return;
    await favIndexObserveRecords(records, { scope, complete:false, syncState:status });
}

async function favSyncFetchSimpleScope(scope, jobId, controller, recordMap, liveNodes, options = {}) {
    const limit = 20;
    let offset = 0;
    let pages = favSyncState.pagesProcessed || 0;
    let repeatedFingerprint = '';
    for (;;) {
        const payload = await favFetchJson(favApiUrlForScope(scope, offset, limit, scope.query), controller.signal, 3, (retryCount) => {
            if (favSyncJobIsCurrent(jobId, options.jobScopeKey || scope.scopeKey)) favSyncSetState({ retryCount });
        });
        if (!favSyncJobIsCurrent(jobId, options.jobScopeKey || scope.scopeKey)) throw new DOMException('Stale sync job', 'AbortError');
        const listings = favApiListings(payload);
        const records = favRecordsFromListings(listings, offset, liveNodes);
        const fingerprint = records.map((record) => record.id).join(',');
        if (listings.length && fingerprint === repeatedFingerprint) throw new Error('Favorites endpoint repeated a page; synchronization stopped safely.');
        repeatedFingerprint = fingerprint;
        for (const record of records) if (!recordMap.has(record.id)) recordMap.set(record.id, { ...record, order:recordMap.size });
        if (options.observe !== false) await favSyncObservePage(records, scope, 'running');
        pages += 1;
        const elapsed = Math.max(1, Date.now() - favSyncState.startedAt);
        const expected = favSyncState.expectedTotal;
        const rate = recordMap.size / elapsed;
        favSyncSetState({
            processed:recordMap.size, pagesProcessed:pages, lastProgressAt:Date.now(),
            estimatedRemainingMs: expected && rate ? Math.max(0, (expected - recordMap.size) / rate) : 0,
        });
        if (listings.length < limit) break;
        offset += limit;
        await sleep(FAV_SYNC_PAGE_DELAY_MS, controller.signal);
    }
}

async function favSyncFetchGroupQuery(scope, jobId, controller, recordMap, liveNodes) {
    const groupScope = { ...scope, query:'' };
    const groupRecords = new Map();
    await favSyncFetchSimpleScope(groupScope, jobId, controller, groupRecords, liveNodes, { observe:false, jobScopeKey:scope.scopeKey });
    const queryScope = favSyncScopeDescriptor({ ...scope, type:'items', id:'' }, scope.query);
    const queryRecords = new Map();
    await favSyncFetchSimpleScope(queryScope, jobId, controller, queryRecords, liveNodes, { observe:false, jobScopeKey:scope.scopeKey });
    for (const [idValue, record] of queryRecords) if (groupRecords.has(idValue)) recordMap.set(idValue, { ...record, order:recordMap.size });
    await favSyncObservePage(Array.from(recordMap.values()), scope, 'running');
}

async function favSyncScope(scope, options = {}) {
    if (!scope?.owner) return favSyncSetState({ status:'error', error:'Could not determine the Favorites profile owner.', completedAt:Date.now(), controller:null });
    if (favSyncState.status === 'running') return favSyncState.promise;
    const jobId = ++favSyncSequence;
    const controller = new AbortController();
    const expectedTotal = Math.max(0, Number(options.expectedTotal) || favSyncExpectedTotal(scope));
    const startedAt = Date.now();
    const independent = options.independent === true || scope.authoritativeFavoriteScope === true;
    const recordMap = new Map();
    const liveNodes = favCardMap(document);
    const promise = (async () => {
        try {
            if (scope.type === 'group' && scope.query) await favSyncFetchGroupQuery(scope, jobId, controller, recordMap, liveNodes);
            else await favSyncFetchSimpleScope(scope, jobId, controller, recordMap, liveNodes);
            if (!favSyncJobIsCurrent(jobId, scope.scopeKey) || controller.signal.aborted) throw new DOMException('Stale sync job', 'AbortError');
            const records = Array.from(recordMap.values());
            await favIndexObserveRecords(records, { scope, complete:true, syncState:'completed' });
            await favIndexHydrateRecords(records);
            if (!favSyncJobIsCurrent(jobId, scope.scopeKey)) return favSyncState;
            if (favSyncCurrentScope().scopeKey === scope.scopeKey) {
                favState.records = records.slice().sort((a,b) => a.order - b.order);
                favState.recordsById = new Map(favState.records.map((record) => [record.id, record]));
                favState.total = favState.records.length;
                favState.loadKey = favDatasetKey();
                favState.loadComplete = true;
            }
            return favSyncSetState({ status:'completed', processed:records.length, completedAt:Date.now(), lastProgressAt:Date.now(), estimatedRemainingMs:0, controller:null, error:'' });
        } catch (error) {
            if (!favSyncJobIsCurrent(jobId, scope.scopeKey)) return favSyncState;
            const cancelled = error?.name === 'AbortError' || controller.signal.aborted;
            return favSyncSetState({ status:cancelled?'cancelled':'error', completedAt:Date.now(), controller:null, error:cancelled?'':String(error?.message || error) });
        }
    })();
    favSyncState = {
        status:'running', jobId, scope, scopeKey:scope.scopeKey, independent,
        processed:0, expectedTotal, pagesProcessed:0, startedAt, lastProgressAt:startedAt,
        completedAt:0, estimatedRemainingMs:0, controller, error:'', retryCount:0, promise,
    };
    favSyncSetState({});
    return promise;
}

function favCancelSync(reason = 'cancelled') {
    if (favSyncState.status !== 'running') return false;
    favSyncState.cancelReason = reason;
    favSyncState.controller?.abort();
    return true;
}

function favSyncHandleRouteChange() {
    if (favSyncState.status !== 'running') return;
    const current = favSyncCurrentScope();
    const ownerChanged = String(current.owner || '') !== String(favSyncState.scope?.owner || '');
    if (ownerChanged || (!favSyncState.independent && current.scopeKey !== favSyncState.scopeKey)) favCancelSync('route-change');
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
    for (const descriptor of descriptors) {
        const activeScope = favSyncCurrentScope();
        if (String(activeScope.owner || '') !== String(descriptor.owner || '')) break;
        if (!descriptor.authoritativeFavoriteScope && activeScope.scopeKey !== descriptor.scopeKey) break;
        const stored = await favIndexGetScope(descriptor.scopeKey);
        if (!favCfg.autoSync || !favSyncIsDue(stored, Date.now())) continue;
        await favSyncScope(descriptor, { independent:descriptor.authoritativeFavoriteScope });
        if (favSyncState.status === 'error' || favSyncState.status === 'cancelled') break;
    }
    return true;
}
