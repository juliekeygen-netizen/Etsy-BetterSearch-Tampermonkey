import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/106-favorites-v01524-metadata-context-generation.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture({ destination = 'FI|00100' } = {}) {
  let currentDestination = destination;
  let datasetKey = 'owner|items||';
  const records = [{ id:'1', shipping:Number.NaN, estimatedDelivery:'', known:{}, metadataMeta0141:{} }];
  const fetches = [];
  const persisted = [];
  const coverageEvents = [];
  let renderCalls = 0;

  const context = vm.createContext({
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Promise,
    URL,
    AbortController,
    DOMException,
    location:{ origin:'https://www.etsy.com' },
    favState:{ records, metadataCoverage0141:null },
    favCfg:{ filters:{ maxShipping:'10' }, sort:'etsy' },
    favMetadataInflight0141:new Map(),
    isFavoritesPage:() => true,
    favDatasetKey:() => datasetKey,
    favMetadataDestination0141:() => {
      const [country = '', postal = ''] = currentDestination.split('|');
      return { country, postal, contextKey:currentDestination };
    },
    favMetadataMeta0141:(record, key) => record?.metadataMeta0141?.[key] || null,
    favMetadataPriorityRecords0141:() => records,
    favMetadataAuxRequestNeeded0141:() => true,
    favIndexCurrentScope:() => ({ owner:'owner', type:'items', id:'', query:'', scopeKey:'scope' }),
    favFetchJson:(url) => {
      const pending = deferred();
      fetches.push({ url:String(url), ...pending });
      return pending.promise;
    },
    favMetadataApplyAux0141:(record, extra, requirements, observedAt, dest) => {
      record.known = record.known || {};
      record.metadataMeta0141 = record.metadataMeta0141 || {};
      if (requirements.has('shipping') || requirements.has('freeShippingFallback')) {
        record.shipping = Number(extra?.shipping_costs);
        record.known.shipping = Number.isFinite(record.shipping);
        record.estimatedDelivery = String(extra?.estimated_delivery || '');
        record.known.estimatedDelivery = Boolean(record.estimatedDelivery);
        record.metadataMeta0141.shipping = { observedAt, contextKey:dest.contextKey, known:record.known.shipping };
        record.metadataMeta0141.estimatedDelivery = { observedAt, contextKey:dest.contextKey, known:record.known.estimatedDelivery };
      }
      if (requirements.has('returns')) {
        record.acceptsReturns = String(extra?.accepts_returns) === '1';
        record.known.acceptsReturns = Object.prototype.hasOwnProperty.call(extra || {}, 'accepts_returns');
      }
    },
    favIndexObserveRecords:async (batch) => {
      persisted.push(batch.map((record) => ({
        id:record.id,
        shipping:record.shipping,
        contextKey:record.metadataMeta0141?.shipping?.contextKey || '',
      })));
      return batch;
    },
    favMetadataFieldState0141:(record, capability) => {
      const key = capability === 'freeShippingFallback' ? 'shipping' : capability;
      if (key === 'shipping') {
        const meta = record.metadataMeta0141?.shipping;
        const known = meta?.known === true && meta.contextKey === currentDestination;
        return { known, resolved:known, fresh:known };
      }
      return { known:true, resolved:true, fresh:true };
    },
    favMetadataRequirements0141:(config) => {
      const required = new Set();
      if (config?.filters?.maxShipping || config?.sort === 'shipping') required.add('shipping');
      if (config?.filters?.returns) required.add('returns');
      return required;
    },
    favMetadataAuxRequirements0141:(requirements) => new Set(Array.from(requirements).filter((value) => ['shipping','returns','freeShippingFallback'].includes(value))),
    favMetadataDeepRequirements0141:() => new Set(),
    favMetadataQueueDeep0141:async () => ({ queued:0, unresolved:0 }),
    favMetadataCoverage0141:(requirements, auxResult = {}, deepResult = {}) => {
      const coverage = {
        datasetKey,
        capabilities:Array.from(requirements),
        auxRequested:Number(auxResult.requested) || 0,
        pending:Number(deepResult.queued) || 0,
        unresolved:Number(auxResult.unresolved) || 0,
        complete:true,
        observedAt:Date.now(),
      };
      context.favState.metadataCoverage0141 = coverage;
      coverageEvents.push(coverage);
      return coverage;
    },
    favMetadataCoverageCurrent01512:() => {
      const coverage = context.favState.metadataCoverage0141;
      return Boolean(coverage && coverage.datasetKey === datasetKey && Number(coverage.pending) <= 0);
    },
    favIndexApplyListingMetadataToRecord:(record, listing) => {
      const shipping = listing?.shippingMetadata || {};
      record.known = record.known || {};
      if (shipping.cost?.known === true) {
        record.shipping = Number(shipping.cost.value);
        record.known.shipping = Number.isFinite(record.shipping);
      }
      if (shipping.estimatedDelivery?.known === true) {
        record.estimatedDelivery = String(shipping.estimatedDelivery.value || '');
        record.known.estimatedDelivery = Boolean(record.estimatedDelivery);
      }
      if (shipping.returnsAccepted?.known === true) {
        record.acceptsReturns = shipping.returnsAccepted.value === true;
        record.known.acceptsReturns = true;
      }
      if (shipping.exchangesAccepted?.known === true) {
        record.acceptsExchanges = shipping.exchangesAccepted.value === true;
        record.known.acceptsExchanges = true;
      }
      return record;
    },
    favCacheRecordFromIndexed0137:(indexed, _shop, liveListing) => ({
      id:String(indexed.listingId || '1'),
      shipping:Number(indexed.shippingMetadata?.cost?.value),
      estimatedDelivery:String(indexed.shippingMetadata?.estimatedDelivery?.value || ''),
      known:{
        shipping:indexed.shippingMetadata?.cost?.known === true,
        estimatedDelivery:indexed.shippingMetadata?.estimatedDelivery?.known === true,
      },
      metadataMeta0141:{},
      fromLive:Boolean(liveListing),
    }),
    favReapply:async () => { renderCalls += 1; return 'rendered'; },
    favEnsureExtraInfo:async () => true,
  });

  vm.runInContext(`${source}\nglobalThis.testApi={
    fetchAux:favMetadataFetchAux0141,
    ensure:favMetadataEnsureCurrentRequirements0141,
    snapshot:favMetadataContextSnapshot01524,
    current:favMetadataContextSnapshotCurrent01524,
    hydrate:favIndexApplyListingMetadataToRecord,
    cache:favCacheRecordFromIndexed0137,
    coverageCurrent:favMetadataCoverageCurrent01512,
    reapply:favReapply,
  };`, context);

  return {
    context,
    api:context.testApi,
    records,
    fetches,
    persisted,
    coverageEvents,
    setDestination(value) { currentDestination = value; },
    setDataset(value) { datasetKey = value; },
    get renderCalls() { return renderCalls; },
  };
}

function response(shipping, estimated = '', acceptsReturns = '1') {
  return { map:{ '1':{ shipping_costs:String(shipping), estimated_delivery:estimated, accepts_returns:acceptsReturns } } };
}

test('release loads 106 after final renderer at v0.15.24 identity', () => {
  const p105 = userscript.indexOf('/src/105-favorites-v01512-atomic-render.js?v=0.15.24');
  const p106 = userscript.indexOf('/src/106-favorites-v01524-metadata-context-generation.js?v=0.15.24');
  assert.ok(p105 >= 0 && p106 > p105);
  assert.match(userscript, /@version\s+0\.15\.24/);
});

test('same dataset A -> B: B applies and a late A response cannot mutate or persist', async () => {
  const f = fixture({ destination:'FI|00100' });
  const a = f.api.fetchAux(new Set(['shipping']));
  assert.equal(f.fetches.length, 1);
  assert.match(f.fetches[0].url, /country_iso_code=FI/);

  f.setDestination('DE|10115');
  const b = f.api.fetchAux(new Set(['shipping']));
  assert.equal(f.fetches.length, 2);
  assert.match(f.fetches[1].url, /country_iso_code=DE/);

  f.fetches[1].resolve(response(2, 'B delivery'));
  await b;
  assert.equal(f.records[0].shipping, 2);
  assert.equal(f.records[0].metadataMeta0141.shipping.contextKey, 'DE|10115');
  assert.equal(f.persisted.length, 1);
  assert.equal(f.persisted[0][0].contextKey, 'DE|10115');

  f.fetches[0].resolve(response(99, 'late A'));
  await assert.rejects(a, (error) => error?.name === 'AbortError' && /Stale Favorites metadata context/.test(error.message));
  assert.equal(f.records[0].shipping, 2, 'late A never overwrites the live B value');
  assert.equal(f.records[0].metadataMeta0141.shipping.contextKey, 'DE|10115');
  assert.equal(f.persisted.length, 1, 'late A never reaches durable observation');
});

test('A -> B -> A uses a new generation and never reuses the original A inflight request', async () => {
  const f = fixture({ destination:'FI|00100' });
  const a1 = f.api.fetchAux(new Set(['shipping']));
  f.setDestination('DE|10115');
  const b = f.api.fetchAux(new Set(['shipping']));
  f.setDestination('FI|00100');
  const a2 = f.api.fetchAux(new Set(['shipping']));
  assert.equal(f.fetches.length, 3, 'returning to A creates a new generation/request rather than aliasing A1');

  f.fetches[2].resolve(response(3, 'fresh A2'));
  await a2;
  f.fetches[0].resolve(response(90, 'stale A1'));
  await assert.rejects(a1, /Stale Favorites metadata context/);
  f.fetches[1].resolve(response(80, 'stale B'));
  await assert.rejects(b, /Stale Favorites metadata context/);
  assert.equal(f.records[0].shipping, 3);
  assert.equal(f.persisted.length, 1);
});

test('wrong-context indexed shipping cannot overwrite a current live/card shipping value', () => {
  const f = fixture({ destination:'DE|10115' });
  const record = {
    id:'1', shipping:4, estimatedDelivery:'current live delivery',
    known:{ shipping:true, estimatedDelivery:true }, metadataMeta0141:{},
  };
  const listing = {
    shippingMetadata:{
      cost:{ known:true, value:44, contextKey:'FI|00100' },
      estimatedDelivery:{ known:true, value:'stale indexed delivery', contextKey:'FI|00100' },
      returnsAccepted:{ known:true, value:true, contextKey:'' },
    },
  };
  const next = f.api.hydrate(record, listing);
  assert.equal(next.shipping, 4);
  assert.equal(next.known.shipping, true);
  assert.equal(next.estimatedDelivery, 'current live delivery');
  assert.equal(next.acceptsReturns, true, 'destination-independent metadata still hydrates');
});

test('wrong-context indexed shipping cannot promote an unknown raw value to numeric zero', () => {
  const f = fixture({ destination:'DE|10115' });
  const record = {
    id:'1', shipping:'', estimatedDelivery:'',
    known:{ shipping:false, estimatedDelivery:false }, metadataMeta0141:{},
  };
  const listing = {
    shippingMetadata:{
      cost:{ known:true, value:44, contextKey:'FI|00100' },
    },
  };
  const next = f.api.hydrate(record, listing);
  assert.equal(Number.isFinite(next.shipping), false);
  assert.equal(next.known.shipping, false);
});

test('wrong-context indexed shipping is cleared when the existing raw value is itself tagged stale', () => {
  const f = fixture({ destination:'DE|10115' });
  const record = {
    id:'1', shipping:44, estimatedDelivery:'stale raw',
    known:{ shipping:true, estimatedDelivery:true },
    metadataMeta0141:{
      shipping:{ known:true, contextKey:'FI|00100' },
      estimatedDelivery:{ known:true, contextKey:'FI|00100' },
    },
  };
  const listing = {
    shippingMetadata:{
      cost:{ known:true, value:44, contextKey:'FI|00100' },
      estimatedDelivery:{ known:true, value:'stale indexed', contextKey:'FI|00100' },
    },
  };
  const next = f.api.hydrate(record, listing);
  assert.equal(Number.isFinite(next.shipping), false);
  assert.equal(next.known.shipping, false);
  assert.equal(next.estimatedDelivery, '');
  assert.equal(next.known.estimatedDelivery, false);
});

test('cache-only materialization clears destination-sensitive indexed values from another context', () => {
  const f = fixture({ destination:'DE|10115' });
  const indexed = {
    listingId:'1',
    shippingMetadata:{
      cost:{ known:true, value:44, contextKey:'FI|00100' },
      estimatedDelivery:{ known:true, value:'A delivery', contextKey:'FI|00100' },
      exchangesAccepted:{ known:true, value:true, contextKey:'' },
    },
  };
  const record = f.api.cache(indexed, null, null, null, 0);
  assert.equal(Number.isFinite(record.shipping), false);
  assert.equal(record.known.shipping, false);
  assert.equal(record.estimatedDelivery, '');
  assert.equal(record.known.estimatedDelivery, false);
});

test('current-context indexed shipping still hydrates normally', () => {
  const f = fixture({ destination:'DE|10115' });
  const record = { id:'1', shipping:Number.NaN, estimatedDelivery:'', known:{}, metadataMeta0141:{} };
  const listing = { shippingMetadata:{
    cost:{ known:true, value:5, contextKey:'DE|10115' },
    estimatedDelivery:{ known:true, value:'B delivery', contextKey:'DE|10115' },
  }};
  const next = f.api.hydrate(record, listing);
  assert.equal(next.shipping, 5);
  assert.equal(next.known.shipping, true);
  assert.equal(next.estimatedDelivery, 'B delivery');
  assert.equal(next.known.estimatedDelivery, true);
});

test('destination-sensitive coverage is invalid immediately after destination generation changes', async () => {
  const f = fixture({ destination:'FI|00100' });
  const ensure = f.api.ensure({ requirements:new Set(['shipping']) });
  f.fetches[0].resolve(response(1));
  const coverage = await ensure;
  assert.equal(coverage.metadataContextKey01524, 'FI|00100');
  assert.equal(f.api.coverageCurrent(), true);

  f.setDestination('DE|10115');
  assert.equal(f.api.coverageCurrent(), false);
});

test('destination-independent coverage remains valid across destination changes', async () => {
  const f = fixture({ destination:'FI|00100' });
  f.context.favCfg.filters.maxShipping = '';
  f.context.favCfg.filters.returns = true;
  const ensure = f.api.ensure({ requirements:new Set(['returns']) });
  f.fetches[0].resolve(response(0, '', '1'));
  const coverage = await ensure;
  assert.equal(coverage.destinationSensitive01524, false);
  assert.equal(f.api.coverageCurrent(), true);
  f.setDestination('DE|10115');
  assert.equal(f.api.coverageCurrent(), true);
});

test('final reapply swallows only the exact stale-context cancellation', async () => {
  const f = fixture();
  f.context.favReapplyBefore01524 = async () => {
    throw new DOMException('Stale Favorites metadata context', 'AbortError');
  };
  assert.equal(await f.api.reapply(), false);

  f.context.favReapplyBefore01524 = async () => { throw new Error('real failure'); };
  await assert.rejects(f.api.reapply(), /real failure/);
});

test('source boundary is metadata-only and does not take catalogue/deep-queue ownership', () => {
  assert.match(source, /favMetadataFetchAux0141\s*=\s*async function favMetadataFetchAux01524/);
  assert.match(source, /favIndexApplyListingMetadataToRecord\s*=\s*function favIndexApplyListingMetadataToRecord01524/);
  assert.match(source, /favMetadataCoverageCurrent01512\s*=\s*function favMetadataCoverageCurrent01524/);
  assert.doesNotMatch(source, /favCatalogWithCrossTabLease0141\s*=/);
  assert.doesNotMatch(source, /favDeepRunQueue\s*=/);
  assert.doesNotMatch(source, /favSnapshotScopeRecord0156\s*=/);
});
