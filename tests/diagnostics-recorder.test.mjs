import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../diagnostics-extension/manifest.json', import.meta.url), 'utf8'));
const background = await readFile(new URL('../diagnostics-extension/background.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../diagnostics-extension/content.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('diagnostics extension is isolated, MV3, Etsy-scoped and starts at document_start', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('debugger'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.deepEqual(manifest.host_permissions, ['https://www.etsy.com/*']);
  assert.equal(manifest.background?.service_worker, 'service-worker.js');
  assert.equal(manifest.content_scripts?.[0]?.run_at, 'document_start');
  assert.deepEqual(manifest.content_scripts?.[0]?.matches, ['https://www.etsy.com/*']);
});

test('CDP recorder enables network, page, runtime and log domains without disabling cache', () => {
  assert.match(background, /Network\.enable/);
  assert.match(background, /Page\.enable/);
  assert.match(background, /Runtime\.enable/);
  assert.match(background, /Log\.enable/);
  assert.match(background, /Page\.setLifecycleEventsEnabled/);
  assert.doesNotMatch(background, /Network\.setCacheDisabled/);
});

test('network capture includes HAR, request\/response bodies, initiators and timing', () => {
  assert.match(background, /Network\.requestWillBeSent/);
  assert.match(background, /Network\.responseReceived/);
  assert.match(background, /Network\.loadingFinished/);
  assert.match(background, /Network\.getResponseBody/);
  assert.match(background, /Network\.getRequestPostData/);
  assert.match(background, /function buildHar\(/);
  assert.match(background, /_initiator/);
  assert.match(background, /startedDateTime/);
  assert.match(background, /timings:/);
  assert.match(content, /network\/network\.har/);
});

test('all diagnostic event families carry precise wall-clock and monotonic timing', () => {
  assert.match(content, /epochMs/);
  assert.match(content, /iso:/);
  assert.match(content, /performanceMs/);
  assert.match(content, /sinceNavigationMs/);
  assert.match(content, /navigationTimeOriginMs/);
  assert.match(content, /sinceRecordingMs/);
  assert.match(background, /epochMs/);
  assert.match(background, /workerPerformanceMs/);
});

test('DOM recorder watches lifecycle and snapshots BetterSearch\/native ownership elements', () => {
  assert.match(content, /new MutationObserver/);
  assert.match(content, /attributeOldValue:\s*true/);
  assert.match(content, /\[data-testid="sidebar"\]/);
  assert.match(content, /\[data-ebsf-rail\]/);
  assert.match(content, /\[data-ebsf-local-grid\]/);
  assert.match(content, /data-ebsf-local-pagination/);
  assert.match(content, /Favorite Items Page Results/);
  assert.match(content, /getBoundingClientRect/);
  assert.match(content, /getComputedStyle/);
});

test('manual markers immediately capture state, screenshot and DOMSnapshot before optional note', () => {
  assert.match(content, /Mark problem/);
  assert.match(content, /marker_begin/);
  assert.match(content, /What did you notice\?/);
  assert.match(content, /Keep without note/);
  assert.match(background, /Page\.captureScreenshot/);
  assert.match(background, /DOMSnapshot\.captureSnapshot/);
  assert.match(background, /marker-note/);
});

test('automatic markers cover known BetterSearch lifecycle and owner\/request failures', () => {
  assert.match(content, /sidebar-host-replaced/);
  assert.match(content, /rail-disconnected/);
  assert.match(content, /both-grids-visible/);
  assert.match(content, /both-pagers-visible/);
  assert.match(content, /no-grid-visible/);
  assert.match(background, /ownerless-collection-request/);
  assert.match(background, /users\\\/\\\/collections/);
  assert.match(background, /runtime-exception/);
});

test('Record & Reload is armed per-tab across navigation before the page reloads', () => {
  assert.match(content, /Record &amp; Reload/);
  assert.match(content, /ARM_KEY/);
  assert.match(content, /sessionStorage\.setItem\(ARM_KEY/);
  assert.match(content, /sessionStorage\.getItem\(ARM_KEY/);
  assert.doesNotMatch(content, /localStorage\.(?:setItem|getItem)\(ARM_KEY/);
  assert.match(content, /armed-document-start/);
  assert.match(content, /location\.reload\(\)/);
});

test('diagnostic export is one ZIP containing HAR, raw CDP, DOM, timeline, markers and screenshots', () => {
  assert.match(content, /class ZipBuilder/);
  assert.match(content, /network\/cdp-events\.ndjson/);
  assert.match(content, /dom\/mutations\.ndjson/);
  assert.match(content, /dom\/important-elements\.ndjson/);
  assert.match(content, /timeline\/interactions\.ndjson/);
  assert.match(content, /timeline\/errors\.ndjson/);
  assert.match(content, /markers\/markers\.json/);
  assert.match(content, /screenshot\.png/);
  assert.match(content, /dom-snapshot\.json/);
  assert.match(content, /Stop &amp; Export ZIP/);
});

test('npm build preserves production outputs and also builds diagnostics-chrome', () => {
  assert.match(build, /for \(const target of \['chrome', 'firefox'\]\)/);
  assert.match(build, /diagnostics-extension/);
  assert.match(build, /diagnostics-chrome/);
  assert.match(build, /Built Etsy BetterSearch Diagnostics/);
});

test('CI publishes the diagnostics Chrome build as a separate artifact', () => {
  assert.match(workflow, /Upload Diagnostics Chrome build/);
  assert.match(workflow, /etsy-bettersearch-diagnostics-chrome/);
  assert.match(workflow, /dist\/diagnostics-chrome/);
});
