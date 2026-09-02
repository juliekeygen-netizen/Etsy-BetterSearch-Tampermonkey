import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const membershipPath = resolve(ROOT, 'src/61eb-favorites-multi-owner-membership.js');
const coordinatorPath = resolve(ROOT, 'src/61h-favorites-metadata-coordinator.js');
const finalPath = resolve(ROOT, 'src/61ha-favorites-owner-maintenance-final.js');

function scopeKey(owner, type = 'items', id = '', query = '') {
  return [owner, type, id, query].map((part) => encodeURIComponent(String(part))).join('|');
}

function extractFunction(source, name) {
  const pattern = new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `expected ${name} in source`);
  return match[0];
}

function extractAssignment(source, functionName) {
  const pattern = new RegExp(`favIndexGetActiveListings\\s*=\\s*async function ${functionName}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\};`);
  const match = source.match(pattern);
  assert.ok(match, `expected ${functionName} assignment in source`);
  return match[0];
}

function extractRemovalSource(source) {
  const match = source.match(/var FAV_OWNER_HEART_REMOVAL_SOURCE01519\s*=\s*(['"])(.*?)\1;/);
  assert.ok(match, 'expected v0.15.19 owner-heart removal source in real module');
  return match[2];
}

test('final userscript order reasserts owner maintenance after 61h at release identity', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const membership = userscript.indexOf('/src/61eb-favorites-multi-owner-membership.js?v=0.15.29');
  const coordinator = userscript.indexOf('/src/61h-favorites-metadata-coordinator.js?v=0.15.29');
  const finalOwner = userscript.indexOf('/src/61ha-favorites-owner-maintenance-final.js?v=0.15.29');
  const ui = userscript.indexOf('/src/62-favorites-ui.js?v=0.15.29');

  assert.ok(membership >= 0 && coordinator > membership && finalOwner > coordinator && ui > finalOwner);
  assert.match(userscript, /@version\s+0\.15\.28/);
});

test('61h stale global gate is inverted by the final owner-aware maintenance boundary', async () => {
  const [membershipSource, coordinatorSource, finalSource] = await Promise.all([
    readFile(membershipPath, 'utf8'),
    readFile(coordinatorPath, 'utf8'),
    readFile(finalPath, 'utf8'),
  ]);

  const owner = 'ownerA';
  const key = scopeKey(owner);
  const removalSource = extractRemovalSource(membershipSource);
  const scope = {
    owner,
    type:'items',
    id:'',
    query:'',
    scopeKey:key,
    complete:true,
    listingIds:['X', 'Y'],
    snapshotCommittedAt:100,
    lastCompleteSyncAt:100,
  };
  const listings = [
    {
      listingId:'X',
      isFavorite:false,
      favoriteScopes:{
        [key]:{ active:false, removedAt:200 },
      },
    },
    {
      listingId:'Y',
      isFavorite:true,
      favoriteScopes:{
        [key]:{ active:false, removedAt:200, removalSource },
      },
    },
  ];

  const byId = new Map(listings.map((listing) => [listing.listingId, listing]));
  const db = {
    transaction(stores) {
      const names = Array.isArray(stores) ? stores : [stores];
      return {
        objectStore(name) {
          assert.ok(names.includes(name));
          if (name === 'scopes') {
            return {
              get(requestedKey) { return { result:requestedKey === key ? scope : undefined }; },
              getAll() { return { result:[scope] }; },
            };
          }
          if (name === 'listings') {
            return {
              get(id) { return { result:byId.get(String(id)) }; },
              getAll() { return { result:listings }; },
            };
          }
          throw new Error(`unexpected store ${name}`);
        },
      };
    },
  };

  const context = vm.createContext({
    console,
    FAV_OWNER_HEART_REMOVAL_SOURCE01519:removalSource,
    favIndexOpen:async () => db,
    favIndexRequest:async (request) => request.result,
    favIndexScopeKey:(value) => scopeKey(value.owner, value.type, value.id, value.query),
    favCanonicalAllScope01510(scopes, wantedOwner) {
      return scopes.find((entry) =>
        entry.owner === wantedOwner
        && entry.type === 'items'
        && !entry.query
        && entry.complete === true
      ) || null;
    },
    favOwnerScopeIds01510(scopes, wantedOwner) {
      const canonical = context.favCanonicalAllScope01510(scopes, wantedOwner);
      return new Set((canonical?.listingIds || []).map(String));
    },
  });

  vm.runInContext(extractFunction(membershipSource, 'favScopeCommittedAt01519'), context);
  vm.runInContext(extractFunction(membershipSource, 'favTrustedOwnHeartRemoval01519'), context);
  vm.runInContext(extractFunction(membershipSource, 'favOwnerMembershipScopes01519'), context);
  vm.runInContext(extractFunction(membershipSource, 'favOwnerScopeBaselineActive01519'), context);
  vm.runInContext(extractFunction(membershipSource, 'favOwnerActiveListings01519'), context);
  vm.runInContext(extractAssignment(coordinatorSource, 'favIndexGetActiveListings0141'), context);

  assert.deepEqual(
    Array.from(await context.favIndexGetActiveListings(owner), (listing) => listing.listingId),
    ['Y'],
    'the later historical 61h override gates on global isFavorite and returns the wrong owner set',
  );

  vm.runInContext(finalSource, context);

  assert.deepEqual(
    Array.from(await context.favIndexGetActiveListings(owner), (listing) => listing.listingId),
    ['X'],
    'the final boundary restores committed owner membership and the trusted post-snapshot removal overlay',
  );
});

test('final owner-maintenance boundary delegates to the v0.15.19 semantic helper only', async () => {
  const source = await readFile(finalPath, 'utf8');
  assert.match(source, /return favOwnerActiveListings01519\(listings, scopes, owner\);/);
  assert.doesNotMatch(source, /isFavorite\s*===\s*true/);
  assert.doesNotMatch(source, /listingIds\s*=|\.put\(|readwrite/);
});
