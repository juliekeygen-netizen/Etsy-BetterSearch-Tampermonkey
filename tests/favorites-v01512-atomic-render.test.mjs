import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const transaction = await readFile(new URL('../src/105-favorites-v01512-atomic-render.js', import.meta.url), 'utf8');
const smoke = await readFile(new URL('../src/101-favorites-v0141-smoke-fixes.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function block(source, startText, endText = '') {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `missing block start: ${startText}`);
  const end = endText ? source.indexOf(endText, start) : source.length;
  assert.ok(end > start, `missing block end: ${endText}`);
  return source.slice(start, end);
}

function executable(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('atomic render transaction stays final until the metadata-context boundary', () => {
  const requires = Array.from(userscript.matchAll(/^\/\/ @require\s+([^\s]+)$/gm), (match) => match[1]);
  assert.equal(requires.at(-3) || '', `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/104-favorites-v0157-filter-state-sync.js?v=${packageJson.version}`);
  assert.equal(requires.at(-2) || '', `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/105-favorites-v01512-atomic-render.js?v=${packageJson.version}`);
  assert.equal(requires.at(-1) || '', `https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/106-favorites-v01524-metadata-context-generation.js?v=${packageJson.version}`);
  assert.doesNotMatch(smoke, /01512/, 'the rejected first draft must not remain appended to module 101');
});

test('historical local mode cannot hide Etsy without explicit transaction approval', () => {
  const guard = block(
    transaction,
    'var favApplyLocalVisualOwnershipBefore01512',
    'var favRenderPaginationBefore01512',
  );
  assert.match(guard, /favState\.renderClaimApproved01512 !== true/);
  assert.match(guard, /return false/);
  assert.match(guard, /return favApplyLocalVisualOwnershipBefore01512\(\)/);
});

test('final renderer stages local grid and pager before any ownership commit', () => {
  const render = block(
    transaction,
    'favRenderCurrent = function favRenderCurrent01512',
    'favLocalGridAuthoritative0142 = function favLocalGridAuthoritative01512',
  );
  const hideLocal = render.indexOf('localGrid.hidden = true');
  const inertLocal = render.indexOf('localGrid.inert = true');
  const stageMode = render.indexOf("favState.renderMode0141 = 'bettersearch-staged'");
  const pager = render.indexOf('favRenderPagination(pages)');
  const token = render.indexOf('const token = favRenderTransactionToken01512(nativeGrid)');
  const commit = render.indexOf('favCommitStagedRender01512(token, pages, nativeGrid)');
  assert.ok(hideLocal >= 0 && inertLocal > hideLocal && stageMode > inertLocal && pager > stageMode && token > pager && commit > token);
  assert.doesNotMatch(render, /nativeGrid\.hidden\s*=\s*true/);
  assert.doesNotMatch(render, /favHideNativePagers0150/);
});

test('commit validates token, metadata, pager and staged grid before opening the ownership gate', () => {
  const commit = block(
    transaction,
    'function favCommitStagedRender01512',
    '/* Final renderer.',
  );
  const tokenCheck = commit.indexOf('token !== favRenderTransactionToken01512(nativeGrid)');
  const metadataCheck = commit.indexOf('!favMetadataCoverageCurrent01512()');
  const pagerCheck = commit.indexOf('!favStagedPaginationReady01512(pages)');
  const stagedGridCheck = commit.indexOf("!localGrid.hasAttribute('data-ebsf-local-staged')");
  const approval = commit.indexOf('favState.renderClaimApproved01512 = true');
  const apply = commit.indexOf('favApplyLocalVisualOwnership0150()');
  const revealGrid = commit.indexOf('localGrid.inert = false');
  const tokenCommit = commit.indexOf('favState.renderToken01512 = token');
  const header = commit.indexOf('favUpdateScopeHeader0120?.()');
  assert.ok(tokenCheck >= 0 && metadataCheck > tokenCheck && pagerCheck >= metadataCheck);
  assert.ok(stagedGridCheck > pagerCheck && approval > stagedGridCheck && apply > approval);
  assert.ok(revealGrid > apply && tokenCommit > revealGrid && header > tokenCommit);
});

test('pager staging uses module 95 presentation without allowing its historical hide side effect', () => {
  const pager = block(
    transaction,
    'var favRenderPaginationBefore01512',
    'function favAbortStagedRender01512',
  );
  assert.match(pager, /favState\.renderMode0141 = 'bettersearch-local'/);
  assert.match(pager, /favRenderPaginationBefore01512\(pages\)/);
  assert.match(pager, /favState\.renderMode0141 = previousMode/);
  assert.match(pager, /pager\.hidden = true/);
  assert.match(pager, /pager\.inert = true/);
  assert.match(pager, /data-ebsf-local-staged/);
});

test('integrity repair proves signed ownership before doing anything and never blindly re-hides Etsy', () => {
  const repair = block(
    transaction,
    'favRepairLocalOwnership0142 = function favRepairLocalOwnership01512',
    '/* Request changes release',
  );
  assert.match(repair, /if \(favLocalGridAuthoritative0142\(\)\)/);
  assert.match(repair, /favAbortStagedRender01512\('native-fallback'\)/);
  assert.match(repair, /Promise\.resolve\(favReapply\(\)\)/);
  assert.doesNotMatch(repair, /favApplyLocalVisualOwnership0150/);
  assert.doesNotMatch(repair, /favHideNativePagers0150/);
});

test('render request signature separates catalogue identity from local Search/view identity', () => {
  const signature = block(
    transaction,
    'function favRenderRequestSignature01512',
    '/* Keep module-101',
  );
  assert.match(signature, /favDatasetKey\(\)/);
  assert.match(signature, /favScopeKey\(\)/);
  assert.match(signature, /favState\.loadKey/);
  assert.match(signature, /favState\.nativeQueryGeneration01511/);
  assert.match(signature, /favSnapshotRevision01512\(\)/);
  assert.match(signature, /favNormalizedConfigText01512/);
  assert.match(signature, /favMetadataDestination0141/);
  assert.match(signature, /favCurrentMetadataCapabilities01512/);
});

test('stable catalogue identity excludes partial observation timestamps', () => {
  const records = block(
    transaction,
    'function favRecordsRevision01512',
    'function favLocalResultRequestKey01512',
  );
  const snapshot = block(
    transaction,
    'function favSnapshotRevision01512',
    'function favRecordsRevision01512',
  );
  assert.doesNotMatch(executable(records), /indexObservedAt|metadataMeta0141|scannedAt|observedAt/);
  assert.doesNotMatch(executable(snapshot), /lastObservedAt/);
  assert.match(snapshot, /snapshotGeneration/);
  assert.match(snapshot, /snapshotCommittedAt/);
  assert.match(snapshot, /lastCompleteSyncAt/);
  assert.match(transaction, /Number\(coverage\.observedAt\) \|\| 0/);
});

test('Strict query changes reset local page even when the full catalogue dataset is unchanged', () => {
  const helpers = [
    block(transaction, 'function favHashText01512', 'function favNormalizedConfigText01512'),
    block(transaction, 'function favNormalizedConfigText01512', 'function favCurrentMetadataCapabilities01512'),
    block(transaction, 'function favLocalResultRequestKey01512', 'favEnsureLocalPageContext0150 = function'),
    block(transaction, 'favEnsureLocalPageContext0150 = function favEnsureLocalPageContext01512', 'function favRenderRequestSignature01512'),
  ].join('\n');
  let query = 'first';
  const context = vm.createContext({
    String, Number, Math, JSON,
    favCfg:{ strict:true, filters:{} },
    favState:{ localResultKey0150:'', localPage:3, pageSize:20 },
    FAV_LOCAL_PAGE_SIZE0150:20,
    favDatasetKey:() => 'owner|items||q:',
    favScopeKey:() => `owner|items||${query}`,
    favNormalizeConfig:(value) => value,
  });
  vm.runInContext(`${helpers}\nglobalThis.testApi={ensure:favEnsureLocalPageContext0150,state:favState};`, context);
  context.testApi.ensure();
  assert.equal(context.testApi.state.localPage, 1);
  context.testApi.state.localPage = 3;
  context.testApi.ensure();
  assert.equal(context.testApi.state.localPage, 3, 'same Strict query preserves intentional local page');
  query = 'second';
  context.testApi.ensure();
  assert.equal(context.testApi.state.localPage, 1, 'new Strict query resets the local result page');
});

test('committed multi-page ownership requires a visible non-inert local pager', () => {
  const committed = block(
    transaction,
    'function favCommittedPaginationReady01512',
    '/* The old module-95 helper',
  );
  assert.match(committed, /pager\.hidden !== true/);
  assert.match(committed, /pager\.inert !== true/);
  assert.match(committed, /pager\.getAttribute\('aria-hidden'\) !== 'true'/);
  assert.match(committed, /!favNodeVisuallySuppressed0143\(pager\)/);
  assert.match(committed, /if \(pages <= 1\) return !pager/);
});

test('final shown count preserves 0.15.11 total provenance but trusts filtered count only under signed ownership', () => {
  const counts = block(
    transaction,
    'var favScopeCountsBefore01512',
    'var favRestoreNativeBefore01512',
  );
  assert.match(counts, /const previous = favScopeCountsBefore01512\(\)/);
  assert.match(counts, /\.\.\.previous/);
  assert.match(counts, /shown:favLocalGridAuthoritative0142\(\)/);
  assert.match(counts, /Array\.isArray\(favState\.filtered\)/);
  assert.match(counts, /: total/);
});

test('restore clears render transaction ownership and staging state', () => {
  const restore = block(transaction, 'var favRestoreNativeBefore01512');
  assert.match(restore, /favState\.renderToken01512 = ''/);
  assert.match(restore, /favState\.renderRequestSignature01512 = ''/);
  assert.match(restore, /favState\.renderClaimApproved01512 = false/);
  assert.match(restore, /removeAttribute\('data-ebsf-local-staged'\)/);
  assert.match(restore, /return favRestoreNativeBefore01512\(\)/);
});

test('atomic integration adds no MutationObserver or polling loop', () => {
  assert.doesNotMatch(transaction, /new MutationObserver/);
  assert.doesNotMatch(transaction, /setInterval\(/);
});
