import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const sourcePath = resolve(ROOT, 'src/107-favorites-v01525-native-heart-confirmation.js');
const source = await readFile(sourcePath, 'utf8');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeHarness() {
  let captureHandler = null;
  let dataset = 'dataset:A';
  let scope = 'scope:A';
  let view = 'view:A';
  let ownProfile = true;
  let removeSucceeds = false;
  let durableWrites = 0;
  let localRemovals = 0;
  let refreshes = 0;
  let integritySchedules = 0;
  let reapplyCalls = 0;
  let bridgeCalls = 0;
  const opened = [];
  const nativeGrid = { isConnected:true };
  let nativeCards = new Map();

  function makeCard(id, favorited = true) {
    const card = {
      id:String(id),
      isConnected:true,
      dataset:{ ebsfId:String(id) },
      querySelectorAll:() => [button],
    };
    const button = {
      favorite:true,
      favorited:Boolean(favorited),
      card,
      closest:() => card,
    };
    card.button = button;
    return card;
  }

  const context = vm.createContext({
    console,
    Map,
    Array,
    String,
    Number,
    Math,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    favState:{ renderMode0141:'native' },
    document:{
      addEventListener(type, handler, capture) {
        if (type === 'click' && capture === true) captureHandler = handler;
      },
    },
    window:{
      open(...args) {
        opened.push(args);
        return {};
      },
    },
    bridgeFavorite:async () => {
      bridgeCalls += 1;
      return true;
    },
    isFavoritesPage:() => true,
    favDatasetKey:() => dataset,
    favScopeKey:() => scope,
    favViewKey0137:() => view,
    favNativeMainGrid0141:() => nativeGrid,
    favNativeCardMap0141:() => nativeCards,
    favListingIdFromNode:(card) => String(card?.id || ''),
    favoriteButtonFromEvent:(target) => target?.favorite === true ? target : null,
    isFavoritedButton:(button) => button?.favorited === true,
    favIsOwnFavoritesPage:() => ownProfile,
    favRemoveLocalFavorite() {
      localRemovals += 1;
      return removeSucceeds;
    },
    favIndexMarkUnfavorite() {
      durableWrites += 1;
      return Promise.resolve(true);
    },
    favRenderCurrent:() => true,
    favReapply:() => {
      reapplyCalls += 1;
      return Promise.resolve(true);
    },
    favRefreshOwnedCardsFromNative0143:() => { refreshes += 1; return true; },
    favScheduleRenderIntegrity0142:() => { integritySchedules += 1; },
  });

  vm.runInContext(source, context);
  context.FAV_NATIVE_HEART_CONFIRM_TIMEOUT01525 = 90;
  context.FAV_NATIVE_HEART_STATE_STABLE01525 = 25;
  context.FAV_NATIVE_HEART_ABSENCE_STABLE01525 = 25;
  context.FAV_NATIVE_HEART_POLL01525 = 5;
  context.FAV_NATIVE_HEART_ACTION_TTL01525 = 250;

  return {
    context,
    makeCard,
    capture(card) {
      captureHandler?.({ target:card.button });
      return context.favState.nativeHeartActions01525.get(String(card.id));
    },
    setCards(cards) {
      nativeCards = new Map(cards.map((card) => [String(card.id), card]));
    },
    setDataset(value) { dataset = value; },
    setScope(value) { scope = value; },
    setView(value) { view = value; },
    setOwn(value) { ownProfile = Boolean(value); },
    setRemoveSucceeds(value) { removeSucceeds = Boolean(value); },
    counts:() => ({ durableWrites, localRemovals, refreshes, integritySchedules, reapplyCalls, bridgeCalls }),
    opened,
  };
}

test('source replaces fixed-delay persistence with same-context reacquisition and bounded stable evidence', () => {
  assert.match(source, /favNativeCardMap0141\?\.\(document\)/);
  assert.match(source, /favDatasetKey\(\).*action\.datasetKey/s);
  assert.match(source, /favScopeKey\(\).*action\.scopeKey/s);
  assert.match(source, /favViewKey0137\(\).*action\.viewKey/s);
  assert.match(source, /explicitSamples >= 3/);
  assert.match(source, /absenceSamples >= 3/);
  assert.match(source, /FAV_NATIVE_HEART_STATE_STABLE01525/);
  assert.match(source, /FAV_NATIVE_HEART_ABSENCE_STABLE01525/);
  assert.match(source, /Promise\.resolve\(\)\.then\(\(\) =>/);
  assert.doesNotMatch(source, /bridgeFavorite\(/);
});

test('delayed explicit unfavorited state commits exactly once instead of trusting the original node', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  const intercepted = await harness.context.favIndexMarkUnfavorite('X');
  assert.equal(intercepted, false, 'historical 900 ms writer is consumed while confirmation runs');
  assert.equal(harness.counts().durableWrites, 0);

  await sleep(12);
  card.button.favorited = false;
  assert.equal(await action.confirmationPromise, true);
  assert.equal(harness.counts().durableWrites, 1);
});

test('capture starts removal confirmation even if the historical bubble listener never schedules its timeout', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  await sleep(8);
  assert.ok(action.confirmationPromise, 'capture must independently start confirmation');
  card.button.favorited = false;
  assert.equal(await action.confirmationPromise, true);
  assert.equal(harness.counts().durableWrites, 1);
});

test('detached original card cannot prove removal when its current replacement is still favorited', async () => {
  const harness = makeHarness();
  const oldCard = harness.makeCard('X', true);
  harness.setCards([oldCard]);
  const action = harness.capture(oldCard);
  const replacement = harness.makeCard('X', true);
  oldCard.isConnected = false;
  harness.setCards([replacement]);

  await harness.context.favIndexMarkUnfavorite('X');
  assert.equal(await action.confirmationPromise, false);
  assert.equal(harness.counts().durableWrites, 0);
  assert.ok(harness.counts().refreshes >= 1, 'unresolved current context asks the presentation owner to reconcile');
});

test('optimistic unfavorited state that rolls back before stability never becomes durable evidence', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  await sleep(8);
  card.button.favorited = false;
  await sleep(10);
  card.button.favorited = true;

  assert.equal(await action.confirmationPromise, false);
  assert.equal(harness.counts().durableWrites, 0);
});

test('same-view stable card absence after a removal click is accepted only after the bounded stability window', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  card.isConnected = false;
  harness.setCards([]);
  await sleep(0);

  assert.equal(await action.confirmationPromise, true);
  assert.equal(harness.counts().durableWrites, 1);
});

test('route/view change while the native action is in flight fails closed without durable removal', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  harness.setView('view:B');
  await sleep(0);

  assert.equal(await action.confirmationPromise, false);
  assert.equal(harness.counts().durableWrites, 0);
});

test('a second heart click supersedes the prior removal intent and suppresses its delayed writer', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  harness.capture(card);
  card.button.favorited = false;
  const superseding = harness.capture(card);
  assert.equal(superseding.intent, 'other');

  assert.equal(await harness.context.favIndexMarkUnfavorite('X'), false);
  await sleep(110);
  assert.equal(harness.counts().durableWrites, 0);
});

test('captured removal fence reports not-committed so historical callers cannot direct-render', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);

  assert.equal(harness.context.favRemoveLocalFavorite('X'), false);
  assert.equal(harness.counts().localRemovals, 0, 'fenced historical callback never reaches the real local remover');

  card.button.favorited = false;
  assert.equal(await action.confirmationPromise, true);
});

test('confirmed local removal uses the real remover once then re-enters favReapply', async () => {
  const harness = makeHarness();
  harness.setRemoveSucceeds(true);
  harness.context.favState.renderMode0141 = 'bettersearch-local';
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);

  assert.equal(harness.context.favRemoveLocalFavorite('X'), false, 'historical caller still sees not committed');
  card.button.favorited = false;
  assert.equal(await action.confirmationPromise, true);
  await sleep(0);

  assert.equal(harness.counts().localRemovals, 1);
  assert.equal(harness.counts().durableWrites, 0, 'successful local remover owns persistence');
  assert.equal(harness.counts().reapplyCalls, 1, 'confirmation returns through the current reapply pipeline exactly once');
});

test('BetterSearch-owned off-page Favorite bridge opens the listing instead of using the hidden iframe bridge', async () => {
  const harness = makeHarness();
  let title = '';
  const card = {
    dataset:{
      ebsfOwnedCard:'1',
      ebsfUrl:'https://www.etsy.com/listing/123/example',
    },
  };
  const button = { setAttribute(name, value) { if (name === 'title') title = value; } };

  assert.equal(await harness.context.bridgeFavorite(card, button), false);
  assert.equal(harness.counts().bridgeCalls, 0, 'generic hidden-iframe bridge is bypassed for an owned Favorites clone');
  assert.deepEqual(harness.opened, [['https://www.etsy.com/listing/123/example', '_blank', 'noopener']]);
  assert.match(title, /Open this listing/i);
});

test('generic non-owned bridge consumers retain their existing behavior', async () => {
  const harness = makeHarness();
  const card = { dataset:{ ebsfOwnedCard:'0', ebsfUrl:'https://www.etsy.com/listing/456/example' } };
  assert.equal(await harness.context.bridgeFavorite(card, {}), true);
  assert.equal(harness.counts().bridgeCalls, 1);
  assert.deepEqual(harness.opened, []);
});

test('confirmed tombstone suppresses a later copy of module 63 fixed-delay persistence', async () => {
  const harness = makeHarness();
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  card.button.favorited = false;
  await sleep(0);
  assert.equal(await action.confirmationPromise, true);
  assert.equal(harness.counts().durableWrites, 1);
  assert.equal(action.intent, 'confirmed-remove');

  assert.equal(harness.context.favRemoveLocalFavorite('X'), false, 'confirmed tombstone cannot trigger historical direct render');
  assert.equal(await harness.context.favIndexMarkUnfavorite('X'), false);
  assert.equal(harness.counts().durableWrites, 1, 'historical delayed callback must not write twice');
});

test('confirmed viewer-personal heart change on another profile never mutates profile membership', async () => {
  const harness = makeHarness();
  harness.setOwn(false);
  const card = harness.makeCard('X', true);
  harness.setCards([card]);
  const action = harness.capture(card);
  card.button.favorited = false;
  await sleep(0);

  assert.equal(await action.confirmationPromise, true);
  assert.equal(harness.counts().durableWrites, 0);
  assert.equal(harness.counts().localRemovals, 0);
  assert.ok(harness.counts().refreshes >= 1);
});
