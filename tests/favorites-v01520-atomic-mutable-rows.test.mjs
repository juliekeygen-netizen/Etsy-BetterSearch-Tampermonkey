import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const primitivePath = resolve(ROOT, 'src/61ab-favorites-atomic-mutations.js');
const integrationPath = resolve(ROOT, 'src/74a-favorites-atomic-mutable-rows.js');

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

async function makeIntegrationContext({ listing, shop, jobs = {} } = {}) {
  const source = await readFile(integrationPath, 'utf8');
  let currentListing = clone(listing);
  let currentShop = clone(shop);
  const queue = new Map(Object.entries(clone(jobs)));
  const context = vm.createContext({
    console,
    Date,
    FAV_DEEP_PARSER_VERSION:'listing-html-v3',
    FAV_DEEP_SHIPPING_ORIGIN_VERSION:'shipping-origin-v1',
    FAV_DEEP_QUEUE_STORE:'deepScanQueue',
    FAV_DEEP_QUEUE_RETRY_LIMIT:3,
    favState:{ recordsById:new Map() },
    favIndexEnqueue:(operation) => Promise.resolve().then(operation),
    favDeepQueueSerialize:(operation) => Promise.resolve().then(operation),
    favAtomicPut01520:(value, result = value) => ({ write:true, value, result }),
    favAtomicNoWrite01520:(result = null) => ({ write:false, result }),
    favIndexMutateListingAndShop01520:async (_id, mutator) => {
      const outcome = mutator(clone(currentListing), clone(currentShop));
      if (outcome?.listing !== undefined) currentListing = clone(outcome.listing);
      if (outcome?.shop !== undefined && outcome?.shop !== null) currentShop = clone(outcome.shop);
      return clone(outcome?.result);
    },
    favIndexMutateStoreRow01520:async (_storeName, key, mutator) => {
      const current = queue.has(String(key)) ? clone(queue.get(String(key))) : undefined;
      const outcome = mutator(current);
      if (outcome?.write === true) queue.set(String(key), clone(outcome.value));
      return clone(outcome?.result);
    },
    favIndexMergeMetadata(existing = {}, incoming = {}) {
      return { ...(existing || {}), ...(incoming || {}) };
    },
    favIndexMarkListingAvailability(existing, availabilityState, observedAt) {
      return { ...existing, availabilityState, availabilityObservedAt:observedAt };
    },
    favIndexMergeShop(existing, patch) {
      return { ...(existing || {}), ...patch };
    },
    favIndexUnknown:() => ({ known:false, value:null }),
    favIndexApplyListingMetadataToRecord:() => {},
    favDeepQueueJob(listingId, options = {}, now = 1000) {
      const type = options.type || 'missing_metadata';
      return {
        id:`listing:${listingId}`,
        listingId:String(listingId),
        type,
        priority:Number(options.priority) || (type === 'forced_update' ? 1 : 2),
        status:'queued',
        attempts:0,
        createdAt:now,
        startedAt:0,
        finishedAt:0,
        error:'',
        url:String(options.url || ''),
        updatedAt:now,
        nextAttemptAt:0,
      };
    },
    favDeepQueueMergeJob(existing, incoming, options = {}) {
      if (!existing) return incoming;
      const forceRequeue = options.requeue === true || incoming.type === 'forced_update';
      const active = existing.status === 'queued' || existing.status === 'running';
      return {
        ...existing,
        type:incoming.priority < existing.priority ? incoming.type : existing.type,
        priority:Math.min(existing.priority, incoming.priority),
        url:incoming.url || existing.url || '',
        status:active && !forceRequeue ? existing.status : 'queued',
        attempts:forceRequeue || ['completed','failed'].includes(existing.status) ? 0 : existing.attempts,
        startedAt:forceRequeue ? 0 : existing.startedAt,
        finishedAt:forceRequeue ? 0 : existing.finishedAt,
        error:forceRequeue || existing.status === 'failed' ? '' : existing.error,
        nextAttemptAt:forceRequeue ? 0 : (existing.nextAttemptAt || 0),
        updatedAt:incoming.updatedAt,
      };
    },
    favDeepQueueFailBefore0103:async () => null,
  });
  vm.runInContext(source, context);
  return {
    context,
    get listing() { return clone(currentListing); },
    get shop() { return clone(currentShop); },
    job(id) { return clone(queue.get(id)); },
  };
}

test('deep metadata merges onto latest listing and preserves newer owner-removal evidence', async () => {
  const membershipKey = 'ownerA|items||';
  const harness = await makeIntegrationContext({
    listing:{
      listingId:'X',
      shopId:'S',
      metadataRevision:7,
      favoriteScopes:{
        [membershipKey]:{ active:false, removedAt:500, removalSource:'viewer-own-native-heart' },
      },
      listingMetadata:{ old:{ known:true, value:'old' } },
      shippingMetadata:{},
      cardMetadata:{},
      lastDeepScanAt:100,
    },
    shop:{ shopId:'S', shopRevision:4, shopName:'Old' },
  });

  const parsed = {
    observedAt:600,
    parserVersion:'listing-html-v3',
    identity:{ url:'https://www.etsy.com/listing/X', title:'Updated', shopName:'Shop' },
    availabilityState:'available',
    listingMetadata:{ fresh:{ known:true, value:'new' } },
    shippingMetadata:{ shipping:{ known:true, value:5 } },
    cardMetadata:{ price:{ known:true, value:10 } },
    shopMetadata:{ starSeller:{ known:true, value:true } },
  };
  const result = await harness.context.favIndexApplyDeepListingObservationNow('X', parsed);

  assert.equal(result.metadataRevision, 7, 'unrelated latest-row fields survive');
  assert.equal(result.favoriteScopes[membershipKey].active, false);
  assert.equal(result.favoriteScopes[membershipKey].removalSource, 'viewer-own-native-heart');
  assert.equal(result.listingMetadata.fresh.value, 'new');
  assert.equal(result.availabilityState, 'available');
  assert.equal(harness.shop.shopRevision, 4, 'latest shop row fields survive');
  assert.equal(harness.shop.shopName, 'Shop');
});

test('availability mutation preserves unrelated newer listing fields', async () => {
  const harness = await makeIntegrationContext({
    listing:{ listingId:'X', metadataRevision:9, favoriteScopes:{ a:{ active:true } } },
  });
  harness.context.favState.recordsById.set('X', {});

  assert.equal(await harness.context.favDeepMarkAvailability0103('X', 'deleted', 700), true);
  assert.equal(harness.listing.metadataRevision, 9);
  assert.equal(harness.listing.favoriteScopes.a.active, true);
  assert.equal(harness.listing.availabilityState, 'deleted');
  assert.equal(harness.listing.availabilityObservedAt, 700);
});

test('enqueue after another tab claim preserves latest running worker lease', async () => {
  const id = 'listing:X';
  const harness = await makeIntegrationContext({ jobs:{
    [id]:{
      id,
      listingId:'X',
      type:'missing_metadata',
      priority:2,
      status:'running',
      attempts:3,
      startedAt:500,
      finishedAt:0,
      error:'',
      url:'old',
      updatedAt:550,
      nextAttemptAt:0,
      workerId:'worker-B',
      leaseUntil:5000,
    },
  }});

  const next = await harness.context.favDeepQueueEnqueue('X', { url:'new', priority:1 });
  assert.equal(next.status, 'running');
  assert.equal(next.workerId, 'worker-B');
  assert.equal(next.leaseUntil, 5000);
  assert.equal(next.attempts, 3);
  assert.equal(next.url, 'new');
  assert.equal(next.priority, 1);
});

test('non-running queue results clear stale worker lease fields', async () => {
  const id = 'listing:X';
  const harness = await makeIntegrationContext({ jobs:{
    [id]:{
      id,
      listingId:'X',
      type:'refresh_metadata',
      priority:3,
      status:'failed',
      attempts:3,
      startedAt:400,
      finishedAt:500,
      error:'old',
      url:'old',
      updatedAt:500,
      nextAttemptAt:0,
      workerId:'stale-worker',
      leaseUntil:9000,
    },
  }});

  const next = await harness.context.favDeepQueueEnqueue('X', { type:'forced_update', requeue:true });
  assert.equal(next.status, 'queued');
  assert.equal(next.workerId, '');
  assert.equal(next.leaseUntil, 0);
  assert.equal(next.attempts, 0);
});

test('generic atomic update preserves latest running lease for non-terminal patches', async () => {
  const id = 'listing:X';
  const harness = await makeIntegrationContext({ jobs:{
    [id]:{
      id,
      listingId:'X',
      status:'running',
      attempts:2,
      workerId:'worker-B',
      leaseUntil:8000,
      updatedAt:500,
      nextAttemptAt:0,
    },
  }});

  const next = await harness.context.favDeepQueueUpdate(id, { nextAttemptAt:9000 });
  assert.equal(next.status, 'running');
  assert.equal(next.workerId, 'worker-B');
  assert.equal(next.leaseUntil, 8000);
  assert.equal(next.attempts, 2);
  assert.equal(next.nextAttemptAt, 9000);
});

test('atomic base failure keeps module-73 wrapper ownership and clears queued lease', async () => {
  const id = 'listing:X';
  const harness = await makeIntegrationContext({ jobs:{
    [id]:{
      id,
      listingId:'X',
      status:'running',
      attempts:1,
      workerId:'legacy-worker',
      leaseUntil:8000,
      updatedAt:500,
    },
  }});

  const next = await harness.context.favDeepQueueFailBefore0103(id, new Error('retry'), 1000);
  assert.equal(next.status, 'queued');
  assert.equal(next.workerId, '');
  assert.equal(next.leaseUntil, 0);
  assert.equal(next.nextAttemptAt, 2000);
});

test('atomic primitive reads and writes one row in the same readwrite transaction', async () => {
  const source = await readFile(primitivePath, 'utf8');
  let stored = { id:'X', revision:5 };
  const modes = [];
  const db = {
    transaction(_stores, mode) {
      modes.push(mode);
      const transaction = {
        oncomplete:null,
        onerror:null,
        onabort:null,
        error:null,
        objectStore() {
          return {
            get() {
              const request = { result:undefined, error:null, onsuccess:null, onerror:null };
              queueMicrotask(() => {
                request.result = clone(stored);
                request.onsuccess?.();
                queueMicrotask(() => transaction.oncomplete?.());
              });
              return request;
            },
            put(value) { stored = clone(value); },
          };
        },
      };
      return transaction;
    },
  };
  const context = vm.createContext({ favIndexOpen:async () => db, console });
  vm.runInContext(source, context);

  const result = await context.favIndexMutateStoreRow01520('listings', 'X', (current) =>
    context.favAtomicPut01520({ ...current, availabilityState:'deleted' })
  );
  assert.deepEqual(modes, ['readwrite']);
  assert.equal(result.revision, 5);
  assert.equal(stored.revision, 5);
  assert.equal(stored.availabilityState, 'deleted');
});

test('load order makes atomic integration the module-75 fallback at behavior version', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const primitive = userscript.indexOf('/src/61ab-favorites-atomic-mutations.js?v=0.15.19');
  const hardening = userscript.indexOf('/src/73-favorites-phase5-hardening.js?v=0.15.19');
  const runtimeGuard = userscript.indexOf('/src/74-favorites-phase5-runtime-guard.js?v=0.15.19');
  const integration = userscript.indexOf('/src/74a-favorites-atomic-mutable-rows.js?v=0.15.19');
  const lease = userscript.indexOf('/src/75-favorites-phase5-multitab-lease.js?v=0.15.19');
  assert.ok(primitive >= 0 && hardening > primitive && runtimeGuard > hardening && integration > runtimeGuard && lease > integration);
  assert.match(userscript, /@version\s+0\.15\.19/);
});

test('integration replaces module-73 captured base failure instead of discarding hardening wrapper', async () => {
  const source = await readFile(integrationPath, 'utf8');
  assert.match(source, /favDeepQueueFailBefore0103\s*=\s*function favDeepQueueFailAtomic01520/);
  assert.doesNotMatch(source, /favDeepQueueFail\s*=\s*function favDeepQueueFailAtomic01520/);
});
