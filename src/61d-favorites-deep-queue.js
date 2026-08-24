'use strict';

/* Phase 5 foundation: persistent deep metadata jobs.
 * The queue intentionally does not start crawling automatically yet.
 * It provides durable job state for later scanner ownership/background work.
 */
var FAV_DEEP_QUEUE_DB = 'etsy-bettersearch-favorites';
var FAV_DEEP_QUEUE_STORE = 'deepScanQueue';
var FAV_DEEP_QUEUE_VERSION = 1;

function favDeepQueuePriority(type = 'general') {
    return ({
        'active-filter': 1,
        'missing-metadata': 2,
        'stale-refresh': 3,
        general: 4,
    })[type] || 4;
}

async function favDeepQueueEnsureStore() {
    if (!window.indexedDB) throw new Error('IndexedDB unavailable.');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FAV_DEEP_QUEUE_DB, FAV_DEEP_QUEUE_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(FAV_DEEP_QUEUE_STORE)) {
                const store = db.createObjectStore(FAV_DEEP_QUEUE_STORE, { keyPath: 'jobId' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('priority', 'priority', { unique: false });
                store.createIndex('listingId', 'listingId', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function favDeepQueueRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function favDeepQueueAdd(listingId, options = {}) {
    const db = await favDeepQueueEnsureStore();
    const job = {
        jobId: `${String(listingId)}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        listingId: String(listingId),
        url: String(options.url || ''),
        reason: String(options.reason || 'general'),
        priority: favDeepQueuePriority(options.reason),
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastError: '',
    };
    await favDeepQueueRequest(db.transaction(FAV_DEEP_QUEUE_STORE, 'readwrite').objectStore(FAV_DEEP_QUEUE_STORE).put(job));
    return job;
}

async function favDeepQueueList(status) {
    const db = await favDeepQueueEnsureStore();
    const store = db.transaction(FAV_DEEP_QUEUE_STORE, 'readonly').objectStore(FAV_DEEP_QUEUE_STORE);
    const jobs = await favDeepQueueRequest(store.getAll());
    return jobs.filter((job) => !status || job.status === status)
        .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}

async function favDeepQueueUpdate(jobId, patch) {
    const db = await favDeepQueueEnsureStore();
    const tx = db.transaction(FAV_DEEP_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(FAV_DEEP_QUEUE_STORE);
    const job = await favDeepQueueRequest(store.get(jobId));
    if (!job) return null;
    const next = { ...job, ...patch, updatedAt: Date.now() };
    store.put(next);
    return next;
}

async function favDeepQueueClaimNext() {
    const jobs = await favDeepQueueList('pending');
    if (!jobs.length) return null;
    return favDeepQueueUpdate(jobs[0].jobId, { status: 'running', attempts: jobs[0].attempts + 1 });
}
