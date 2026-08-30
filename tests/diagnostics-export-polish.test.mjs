import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { ROOT } from '../scripts/project.mjs';

const manifest = JSON.parse(await readFile(resolve(ROOT, 'diagnostics-extension/manifest.json'), 'utf8'));
const polish = await readFile(resolve(ROOT, 'diagnostics-extension/export-ui-polish.js'), 'utf8');
const exporter = await readFile(resolve(ROOT, 'diagnostics-extension/export-streaming.js'), 'utf8');

function localEntry(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const method = view.getUint16(8, true);
  const compressedSize = view.getUint32(18, true);
  const uncompressedSize = view.getUint32(22, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const start = 30 + nameLength + extraLength;
  return { method, compressedSize, uncompressedSize, data: bytes.subarray(start, start + compressedSize) };
}

async function loadZipBuilder() {
  const start = exporter.indexOf('function crcTable()');
  const end = exporter.indexOf('function safeDownloadFilename', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({
    Uint8Array,
    Uint32Array,
    BigInt,
    Blob,
    Response,
    CompressionStream,
    TextEncoder,
    Date,
    Math,
    Number,
    String,
    setTimeout,
    encoder: new TextEncoder(),
    ZIP32_MAX: 0xffffffff,
    ZIP16_MAX: 0xffff,
    ZIP_DEFLATE_METHOD: 8,
    ZIP_STORE_METHOD: 0,
    COMPRESS_MIN_BYTES: 1024,
  });
  vm.runInContext(`${exporter.slice(start, end)}\nglobalThis.testApi={StreamingZipBuilder};`, context);
  return context.testApi.StreamingZipBuilder;
}

function loadLockHelpers() {
  const start = polish.indexOf('function lockPanel(root)');
  const end = polish.indexOf('function exportOverlayVisible()', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({
    OWNED_ARIA_DISABLED:'data-ebsf-export-aria-disabled-owned',
    OWNED_ARIA_BUSY:'data-ebsf-export-aria-busy-owned',
    installStyle:() => {},
    freezeElapsed:() => {},
  });
  vm.runInContext(`${polish.slice(start, end)}\nglobalThis.testApi={lockPanel,unlockPanel};`, context);
  return context.testApi;
}

function fakeElement(initial = {}) {
  const attrs = new Map(Object.entries(initial));
  return {
    dataset:{},
    getAttribute:(name) => attrs.has(name) ? attrs.get(name) : null,
    setAttribute:(name, value) => attrs.set(name, String(value)),
    removeAttribute:(name) => attrs.delete(name),
    querySelectorAll:() => [],
    attrs,
  };
}

test('Diagnostics 0.2.8+ loads resumable guard, visual export lock, then streaming exporter', () => {
  const scripts = manifest.content_scripts.find((entry) => entry.run_at === 'document_start')?.js || [];
  const guard = scripts.indexOf('export-resume-guard.js');
  const ui = scripts.indexOf('export-ui-polish.js');
  const stream = scripts.indexOf('export-streaming.js');
  assert.ok(guard >= 0 && ui > guard && stream > ui);
});

test('export lock shows Exporting, freezes elapsed presentation and blocks stale controls', () => {
  assert.match(polish, /data-ebsf-exporting="1"/);
  assert.match(polish, /content:"Exporting…"/);
  assert.match(polish, /data-ebsf-export-frozen/);
  assert.match(polish, /stoppedAt/);
  assert.match(polish, /pointer-events:none!important/);
  assert.match(polish, /aria-disabled/);
  assert.match(polish, /event\.isTrusted !== true/);
  assert.match(polish, /readStopped\(\)\?\.sessionId.*location\.reload/s);
});

test('export lock preserves controls that were already aria-disabled and restores only state it owns', () => {
  const { lockPanel, unlockPanel } = loadLockHelpers();
  const alreadyDisabled = fakeElement({ 'aria-disabled':'true' });
  const enabled = fakeElement();
  const root = fakeElement();
  root.querySelectorAll = (selector) => selector.startsWith('button')
    ? [alreadyDisabled, enabled]
    : selector.includes('data-ebsf-export-aria-disabled-owned')
      ? [enabled]
      : [];

  lockPanel(root);
  assert.equal(alreadyDisabled.getAttribute('aria-disabled'), 'true');
  assert.equal(alreadyDisabled.getAttribute('data-ebsf-export-aria-disabled-owned'), null);
  assert.equal(enabled.getAttribute('aria-disabled'), 'true');
  assert.equal(enabled.getAttribute('data-ebsf-export-aria-disabled-owned'), '1');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.getAttribute('data-ebsf-export-aria-busy-owned'), '1');

  unlockPanel(root);
  assert.equal(alreadyDisabled.getAttribute('aria-disabled'), 'true');
  assert.equal(enabled.getAttribute('aria-disabled'), null);
  assert.equal(enabled.getAttribute('data-ebsf-export-aria-disabled-owned'), null);
  assert.equal(root.getAttribute('aria-busy'), null);
});

test('export UI observes only the overlay lifecycle and has no 120ms whole-page polling loop', () => {
  assert.match(polish, /rootObserver\.observe\(document\.documentElement, \{ childList:true \}\)/);
  assert.match(polish, /overlayObserver\.observe\(root, \{ attributes:true, attributeFilter:\['hidden'\] \}\)/);
  assert.doesNotMatch(polish, /subtree:\s*true/);
  assert.doesNotMatch(polish, /setInterval\(sync,\s*120\)/);
});

test('streaming ZIP losslessly DEFLATEs compressible forensic text', async () => {
  const StreamingZipBuilder = await loadZipBuilder();
  const zip = new StreamingZipBuilder();
  const raw = new TextEncoder().encode('mutation-event-same-value\n'.repeat(10000));
  zip.addParts('dom/mutations.ndjson', [raw]);
  const stats = await zip.prepareCompression();
  assert.equal(stats.deflatedFiles, 1);
  assert.ok(stats.packedBytes < stats.rawBytes / 4);

  const bytes = new Uint8Array(await zip.toBlob().arrayBuffer());
  const entry = localEntry(bytes);
  assert.equal(entry.method, 8);
  assert.equal(entry.uncompressedSize, raw.length);
  const restored = inflateRawSync(entry.data);
  assert.deepEqual(Buffer.from(restored), Buffer.from(raw));
});

test('streaming ZIP stores already-compressed/binary extensions instead of wasting DEFLATE work', async () => {
  const StreamingZipBuilder = await loadZipBuilder();
  const zip = new StreamingZipBuilder();
  const raw = new Uint8Array(4096).map((_, index) => index % 251);
  zip.addParts('markers/problem/screenshot.png', [raw]);
  const stats = await zip.prepareCompression();
  assert.equal(stats.deflatedFiles, 0);

  const bytes = new Uint8Array(await zip.toBlob().arrayBuffer());
  const entry = localEntry(bytes);
  assert.equal(entry.method, 0);
  assert.equal(entry.compressedSize, raw.length);
  assert.deepEqual(Buffer.from(entry.data), Buffer.from(raw));
});

test('exporter keeps STORE as a safe fallback if raw DEFLATE is unavailable or unhelpful', () => {
  assert.match(exporter, /typeof CompressionStream !== 'function'/);
  assert.match(exporter, /catch \(_\) \{\s*return null;\s*\}/);
  assert.match(exporter, /compressed\.length < file\.size/);
  assert.match(exporter, /method: ZIP_STORE_METHOD/);
  assert.match(exporter, /u16\(file\.method\)/);
});
