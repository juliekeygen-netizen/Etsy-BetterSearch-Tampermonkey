import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../diagnostics-extension/manifest.json', import.meta.url), 'utf8'));
const serviceWorker = await readFile(new URL('../diagnostics-extension/service-worker.js', import.meta.url), 'utf8');
const backgroundControls = await readFile(new URL('../diagnostics-extension/background-controls.js', import.meta.url), 'utf8');
const backgroundDetach = await readFile(new URL('../diagnostics-extension/background-detach-autoexport.js', import.meta.url), 'utf8');
const backgroundHealth = await readFile(new URL('../diagnostics-extension/background-session-health.js', import.meta.url), 'utf8');
const backgroundStreaming = await readFile(new URL('../diagnostics-extension/background-streaming-export.js', import.meta.url), 'utf8');
const bootstrapGuard = await readFile(new URL('../diagnostics-extension/bootstrap-guard.js', import.meta.url), 'utf8');
const controls = await readFile(new URL('../diagnostics-extension/controls.js', import.meta.url), 'utf8');
const exportStreaming = await readFile(new URL('../diagnostics-extension/export-streaming.js', import.meta.url), 'utf8');
const controlsDetach = await readFile(new URL('../diagnostics-extension/controls-detach-autoexport.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

function loadStreamingTestHooks() {
  const context = {
    handleMessage: async () => ({ ok: true }),
    globalThis: null,
    indexedDB: {},
    IDBKeyRange: {},
    getSession: async () => null,
    readEvents: async () => [],
    buildHar: () => ({ log: { entries: [] } }),
    buildSummary: () => ({}),
    deleteSessionData: async () => {},
    Object,
    Array,
    Map,
    Set,
    Date,
    RegExp,
    Error,
    ArrayBuffer,
    Uint8Array,
    WeakSet,
    Number,
    String,
    Boolean,
    BigInt,
    Math,
    JSON
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(backgroundStreaming, context);
  return context.__EBSF_DIAG_STREAM_TEST__;
}

test('diagnostics v0.2.8 keeps passive startup and resumable bounded exporter in safe script order', () => {
  assert.equal(manifest.version, '0.2.8');
  assert.deepEqual(manifest.content_scripts[0].js, [
    'transport.js', 'bootstrap-guard.js', 'content.js', 'controls.js', 'export-resume-guard.js', 'export-ui-polish.js', 'export-streaming.js', 'controls-detach-autoexport.js'
  ]);
  assert.match(serviceWorker, /background-detach-autoexport\.js/);
  assert.match(serviceWorker, /background-session-health\.js/);
  assert.match(serviceWorker, /background-streaming-export\.js/);
  assert.match(serviceWorker, /background-export-resume\.js/);
  assert.match(bootstrapGuard, /__EBSF_DIAG_PANEL_OBSERVER_GUARD__/);
  assert.match(bootstrapGuard, /attributeOldValue: true/);
  for (const file of ['background-streaming-export.js', 'background-export-resume.js', 'bootstrap-guard.js', 'export-resume-guard.js', 'export-ui-polish.js', 'export-streaming.js', 'controls-detach-autoexport.js']) {
    assert.match(build, new RegExp(file.replaceAll('.', '\\.')));
  }
});

test('active Record & Reload is presented as Cancel and requires destructive confirmation', () => {
  assert.match(exportStreaming, /content:\"Cancel\"/);
  assert.match(exportStreaming, /Cancel this diagnostics recording\?/);
  assert.match(exportStreaming, /permanently discarded and no ZIP will be exported/);
  assert.match(exportStreaming, /discard_stream_recording/);
  assert.match(exportStreaming, /Recording cancelled\. Captured diagnostic data was discarded; nothing was exported\./);
  assert.match(exportStreaming, /setCaptureEnabled\(false\)/);
  assert.match(exportStreaming, /clearLocalSessionHints\(\)/);
});

test('Cancel does not invoke the ZIP preparation or finalization path', () => {
  const body = exportStreaming.slice(
    exportStreaming.indexOf('async function handleCancelClick'),
    exportStreaming.indexOf('function install()')
  );
  assert.doesNotMatch(body, /prepare_stream_export/);
  assert.doesNotMatch(body, /finalize_stream_export/);
  assert.doesNotMatch(body, /downloadBlob\(/);
  assert.match(body, /confirm\(/);
  assert.match(body, /discard_stream_recording/);
});

test('Stop & Export stops, exports, verifies cleanup and reloads into a clean ready state', () => {
  assert.match(exportStreaming, /async function stopIfNeeded/);
  assert.match(exportStreaming, /action: 'stop_recording'/);
  assert.match(exportStreaming, /prepare_stream_export/);
  assert.match(exportStreaming, /ZIP download requested:/);
  assert.match(exportStreaming, /finalize_stream_export/);
  assert.match(exportStreaming, /Export complete\. The exported recording and temporary export cache were cleared\./);
  assert.match(exportStreaming, /Ready to record/);
  assert.match(exportStreaming, /setElapsedZero\(\)/);
  assert.match(exportStreaming, /location\.reload\(\)/);
  assert.match(backgroundStreaming, /finalizeAndVerify/);
  assert.match(backgroundStreaming, /remaining = await getSession\(id\)/);
});

test('export failure remains recoverable instead of deleting the stopped capture', () => {
  assert.match(exportStreaming, /Export failed safely:/);
  assert.match(exportStreaming, /data retained/);
  const streamingBody = exportStreaming.slice(
    exportStreaming.indexOf('async function streamingExport'),
    exportStreaming.indexOf('async function stopIfNeeded')
  );
  assert.ok(streamingBody.indexOf('downloadBlob(blob, filename)') < streamingBody.indexOf("action: 'finalize_stream_export'"));
  assert.match(backgroundControls, /stoppedSessionForTab/);
});

test('bounded serializer never recreates the old whole-recording string', () => {
  assert.doesNotMatch(backgroundStreaming, /JSON\.stringify\(\{ ok: true, session, summary, har, events \}\)/);
  assert.doesNotMatch(backgroundStreaming, /JSON\.stringify\(entries\[index\]\)/);
  assert.match(backgroundStreaming, /jsonValuePieces/);
  assert.match(backgroundStreaming, /jsonStringPieces/);
  assert.match(backgroundStreaming, /boundedPieces/);
  assert.match(exportStreaming, /StreamingZipBuilder/);
  assert.match(exportStreaming, /stream_export_chunk/);
  assert.doesNotMatch(exportStreaming, /parts\.join\(''\)/);
});

test('UTF-16 chunk boundaries preserve emoji/non-BMP characters exactly', () => {
  const hooks = loadStreamingTestHooks();
  const prefix = 'a'.repeat(hooks.chunkChars - 1);
  const source = `${prefix}😀Z`;
  const chunks = hooks.boundedPiecesForTest([source]);
  assert.equal(chunks.join(''), source);
  for (let index = 0; index < chunks.length - 1; index++) {
    const last = chunks[index].charCodeAt(chunks[index].length - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff), 'chunk must not end with a high surrogate');
  }
});

test('incremental JSON survives unusual characters, BigInt and circular data', () => {
  const hooks = loadStreamingTestHooks();
  const value = { note: 'quote " newline\n emoji 😀 lone \ud800', big: 42n };
  value.self = value;
  const json = hooks.jsonForTest(value);
  const parsed = JSON.parse(json);
  assert.equal(parsed.big, '42n');
  assert.equal(parsed.self, '[Circular]');
  assert.match(parsed.note, /emoji 😀/);
  assert.ok(parsed.note.includes('\ud800'));
});

test('filenames and ZIP paths are sanitized and duplicate paths are recovered', () => {
  assert.match(backgroundStreaming, /safeFilePart/);
  assert.match(backgroundStreaming, /uniquePath/);
  assert.match(exportStreaming, /normalizeZipPath/);
  assert.match(exportStreaming, /safeDownloadFilename/);
  assert.match(exportStreaming, /raw === '\.' \|\| raw === '\.\.'/);
  assert.match(exportStreaming, /this\.paths\.has\(normalized\)/);
});

test('ZIP writer uses ZIP64 records when classic ZIP limits are exceeded', () => {
  assert.match(exportStreaming, /ZIP32_MAX/);
  assert.match(exportStreaming, /ZIP16_MAX/);
  assert.match(exportStreaming, /zip64Extra/);
  assert.match(exportStreaming, /0x06064b50/);
  assert.match(exportStreaming, /0x07064b50/);
  assert.match(exportStreaming, /u64\(/);
});

test('one corrupt base64 screenshot is preserved as recovery text instead of aborting export', () => {
  assert.match(exportStreaming, /base64Failed/);
  assert.match(exportStreaming, /base64-recovery\.txt/);
  assert.match(exportStreaming, /invalid base64/);
});

test('temporary export cache and raw session cleanup are verified for both export and Cancel', () => {
  assert.match(backgroundStreaming, /clearPreparedSession/);
  assert.match(backgroundStreaming, /finalize_stream_export/);
  assert.match(backgroundStreaming, /discard_stream_recording/);
  assert.match(backgroundStreaming, /deleteSessionData\(id\)/);
  assert.match(backgroundStreaming, /Could not completely discard/);
});

test('existing pause/resume and panel safety behavior remains intact', () => {
  assert.match(controls, /Recording paused/);
  assert.match(controls, /Recording resumed/);
  assert.match(backgroundControls, /pause_recording/);
  assert.match(backgroundControls, /resume_recording/);
  assert.match(bootstrapGuard, /isNoopAttributeMutation/);
  assert.match(backgroundHealth, /chrome\.debugger\.getTargets\(\)/);
  assert.match(backgroundHealth, /stale-active-session-without-debugger/);
});

test('Chrome debugger banner Cancel still means Stop + Export, separate from in-panel Cancel', () => {
  assert.match(backgroundDetach, /canceled_by_user/);
  assert.match(backgroundDetach, /autoExportPending = true/);
  assert.match(controlsDetach, /stop\.click\(\)/);
  assert.match(controlsDetach, /Export complete/);
  assert.doesNotMatch(controlsDetach, /ZIP download requested:/);
  assert.match(exportStreaming, /ZIP download requested:/);
  assert.match(exportStreaming, /handleCancelClick/);
});

test('failed Chrome-banner auto-export remains manual-retry only on later navigation', () => {
  assert.match(controlsDetach, /surfacePendingAutoExport/);
  assert.match(controlsDetach, /Use Export ZIP to retry/);
  const body = controlsDetach.slice(
    controlsDetach.indexOf('async function surfacePendingAutoExport'),
    controlsDetach.indexOf('installPanelGuard();')
  );
  assert.doesNotMatch(body, /autoExportStoppedSession\(/);
});
