import test from 'node:test';
import assert from 'node:assert/strict';
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


test('diagnostics v0.2.6 display build loads passive-startup, observer-loop, streaming export and detach hardening in safe order', () => {
  assert.equal(manifest.version, '0.2.5');
  assert.equal(manifest.version_name, '0.2.6');
  assert.deepEqual(manifest.content_scripts[0].js, [
    'transport.js', 'bootstrap-guard.js', 'content.js', 'controls.js', 'export-streaming.js', 'controls-detach-autoexport.js'
  ]);
  assert.match(serviceWorker, /background-detach-autoexport\.js/);
  assert.match(serviceWorker, /background-session-health\.js/);
  assert.match(serviceWorker, /background-streaming-export\.js/);
  assert.match(bootstrapGuard, /__EBSF_DIAG_PANEL_OBSERVER_GUARD__/);
  assert.match(bootstrapGuard, /attributeOldValue: true/);
  assert.match(bootstrapGuard, /isNoopAttributeMutation/);
  for (const file of ['background-detach-autoexport.js', 'background-session-health.js', 'background-streaming-export.js', 'bootstrap-guard.js', 'export-streaming.js', 'controls-detach-autoexport.js', 'transport.js', 'controls.js']) {
    assert.match(build, new RegExp(file.replaceAll('.', '\\.')));
  }
});


test('recording controls provide Pause\/Resume, Stop without export and later Export ZIP', () => {
  assert.match(controls, /Stop recording/);
  assert.match(controls, /Recording paused/);
  assert.match(controls, /Recording resumed/);
  assert.match(controls, /Stopped · ready to export/);
  assert.match(controls, /Export ZIP/);
  assert.match(backgroundControls, /pause_recording/);
  assert.match(backgroundControls, /resume_recording/);
  assert.match(backgroundControls, /stopRecordingCompact/);
  assert.match(backgroundControls, /active\.recording = false/);
  assert.match(backgroundControls, /active\.paused = true/);
  assert.match(backgroundControls, /active\.recording = true/);
});


test('pause keeps debugger attached while explicit stop detaches and persists stopped state first', () => {
  const pauseBody = backgroundControls.slice(
    backgroundControls.indexOf('async function pauseRecording'),
    backgroundControls.indexOf('async function resumeRecording')
  );
  const stopBody = backgroundControls.slice(
    backgroundControls.indexOf('async function stopRecordingCompact'),
    backgroundControls.indexOf('async function prepareExport')
  );
  assert.doesNotMatch(pauseBody, /detach\(/);
  assert.match(stopBody, /await putSession\(active\)/);
  assert.match(stopBody, /await detach\(tabId\)/);
  assert.ok(stopBody.indexOf('await putSession(active)') < stopBody.indexOf('await detach(tabId)'));
});


test('drawer remembers open\/closed preference across reload while active reload opens it once', () => {
  assert.match(controls, /PANEL_OPEN_KEY/);
  assert.match(controls, /sessionStorage\.setItem\(PANEL_OPEN_KEY/);
  assert.match(controls, /sessionStorage\.getItem\(PANEL_OPEN_KEY/);
  assert.match(controls, /applyPanelOpen\(active\?\.recording \|\| active\?\.paused \? true : readPanelOpen\(\), false\)/);
  assert.match(controls, /target\.matches\('\[data-role="collapse"\]'\)/);
});


test('final collapsed launcher shell exactly matches the unchanged 42px plus control', () => {
  assert.match(controlsDetach, /width:42px!important;min-width:42px!important;max-width:42px!important/);
  assert.match(controlsDetach, /height:42px!important;min-height:42px!important;max-height:42px!important/);
  assert.doesNotMatch(controlsDetach, /width:44px!important/);
  assert.match(controlsDetach, /header>button\{/);
  assert.match(controlsDetach, /width:42px!important;height:42px!important/);
  assert.match(controlsDetach, /place-items:center!important/);
});


test('active recording or pause state forces the diagnostics drawer open and blocks collapse', () => {
  assert.match(controlsDetach, /root\.dataset\.recording !== '1'/);
  assert.match(controlsDetach, /event\.stopImmediatePropagation\(\)/);
  assert.match(controlsDetach, /forcePanelOpen\(\)/);
  assert.match(controlsDetach, /root\.dataset\.recording === '1' && root\.dataset\.collapsed === '1'/);
});


test('Record & Reload still arms its current document and Start button is repurposed as Pause\/Resume', () => {
  assert.match(controls, /startAndReload/);
  assert.match(controls, /start_recording/);
  assert.match(controls, /sessionStorage\.setItem\(ARM_KEY/);
  assert.match(controls, /location\.reload\(\)/);
  assert.match(controls, /target\.matches\('\[data-start="start"\]'\)/);
  assert.match(controls, /pauseRecording/);
  assert.match(controls, /resumeRecording/);
});


test('new documents consume any arm before content.js and require background debugger confirmation', () => {
  assert.match(bootstrapGuard, /__EBSF_DIAG_CONSUMED_ARM__/);
  assert.match(bootstrapGuard, /__EBSF_DIAG_BACKGROUND_CONFIRMATION_REQUIRED__/);
  assert.match(bootstrapGuard, /sessionStorage\.removeItem\(ARM_KEY\)/);
  assert.doesNotMatch(bootstrapGuard, /Storage\.prototype\.setItem/);
  assert.doesNotMatch(bootstrapGuard, /setTimeout\(/);
});


test('panel MutationObserver guard prevents same-value UI writes from feeding syncUi forever', () => {
  assert.match(controls, /new MutationObserver/);
  assert.match(controls, /attributeFilter: \['disabled', 'data-recording', 'data-collapsed', 'hidden'\]/);
  assert.match(controls, /panel\.dataset\.recording = active \? '1' : '0'/);
  assert.match(bootstrapGuard, /target\.id === PANEL_ID/);
  assert.match(bootstrapGuard, /record\.oldValue === target\.getAttribute\(record\.attributeName\)/);
  assert.match(bootstrapGuard, /records\.filter\(\(record\) => !isNoopAttributeMutation\(record\)\)/);
});


test('get_state refuses to resurrect a heavy recorder when Chrome no longer has debugger attached', () => {
  assert.match(backgroundHealth, /chrome\.debugger\.getTargets\(\)/);
  assert.match(backgroundHealth, /stale-active-session-without-debugger/);
  assert.match(backgroundHealth, /recoverStopped/);
  assert.match(backgroundHealth, /message\?\.action !== 'get_state'/);
  assert.match(backgroundHealth, /chrome\.storage\.session\.remove\(activeKey\(tabId\)\)/);
});


test('resume after a page refresh while paused restores document-start DOM capture', () => {
  assert.match(controls, /function hasArmedSession\(/);
  assert.match(controls, /const needsDocumentReload = !hasArmedSession\(\)/);
  assert.match(controls, /restore document-start DOM capture/);
  const resumeBody = controls.slice(
    controls.indexOf('async function resumeRecording'),
    controls.indexOf('async function stopRecordingOnly')
  );
  assert.match(resumeBody, /armSession\(response\.session\)/);
  assert.match(resumeBody, /if \(needsDocumentReload\)/);
  assert.match(resumeBody, /location\.reload\(\)/);
});


test('manual marker dialog has true Cancel that removes captured marker artifacts', () => {
  assert.match(controls, /data-role="marker-cancel"/);
  assert.match(controls, /button\.textContent = 'Cancel'/);
  assert.match(controls, /cancel_marker/);
  assert.match(backgroundControls, /deleteMarkerEvents/);
  assert.match(backgroundControls, /item\.delete\(\)/);
  assert.match(controls, /setTimeout\(\(\) => void send\(request\), 650\)/);
});


test('v0.2.6 bypasses the old whole-recording JSON stringify and whole-recording join exporter', () => {
  assert.match(backgroundControls, /JSON\.stringify\(\{ ok: true, session, summary, har, events \}\)/);
  assert.match(controls, /parts\.join\(''\)/);
  assert.match(backgroundStreaming, /prepare_stream_export/);
  assert.match(backgroundStreaming, /stream_export_chunk/);
  assert.match(backgroundStreaming, /boundedPieces/);
  assert.match(backgroundStreaming, /harPieces/);
  assert.match(backgroundStreaming, /ndjsonPieces/);
  assert.doesNotMatch(backgroundStreaming, /JSON\.stringify\(\{ ok: true, session, summary, har, events \}\)/);
  assert.match(exportStreaming, /StreamingZipBuilder/);
  assert.match(exportStreaming, /zip\.addParts/);
  assert.match(exportStreaming, /stream_export_chunk/);
  assert.doesNotMatch(exportStreaming, /parts\.join\(''\)/);
  assert.match(exportStreaming, /document\.addEventListener\('click'/);
  assert.match(exportStreaming, /stopImmediatePropagation/);
});


test('streaming exporter keeps every runtime transfer bounded and clears only temporary prepared chunks', () => {
  assert.match(backgroundStreaming, /CHUNK_CHARS = 256 \* 1024/);
  assert.match(backgroundStreaming, /persistFile/);
  assert.match(backgroundStreaming, /clear_stream_export_cache/);
  assert.match(exportStreaming, /clear_stream_export_cache/);
  assert.match(exportStreaming, /captured data remains retained/);
  assert.doesNotMatch(exportStreaming, /finalize_export/);
});


test('stopped data survives export failure, successful download request and refresh until replacement', () => {
  assert.match(controls, /STOPPED_KEY/);
  assert.match(controls, /data is still retained/);
  assert.match(controls, /Export failed safely/);
  assert.match(controls, /can be retried after refresh/);
  const exportBody = controls.slice(controls.indexOf('async function exportStopped'), controls.indexOf('async function stopAndExport'));
  assert.doesNotMatch(exportBody, /finalize_export/);
  assert.match(controls, /discardStoppedIfNeeded/);
  assert.match(controls, /finalize_export/);
  assert.match(exportStreaming, /readStopped\(\)/);
  assert.match(exportStreaming, /Export failed safely:/);
});


test('control layer owns visible status\/timer so stopped UI cannot keep counting from legacy recorder timer', () => {
  assert.match(controls, /status-core/);
  assert.match(controls, /elapsed-core/);
  assert.match(controls, /status-v2/);
  assert.match(controls, /elapsed-v2/);
  assert.match(controls, /ui\.mode === 'stopped'/);
  assert.match(controls, /ui\.stopped\?\.stoppedAt/);
});


test('unexpected debugger detach remains recoverable as a stopped exportable session', () => {
  assert.match(backgroundControls, /LAST_SESSION_KEY_PREFIX/);
  assert.match(backgroundControls, /chrome\.debugger\.onDetach\.addListener/);
  assert.match(backgroundControls, /unexpected-detach-recovered/);
  assert.match(backgroundControls, /recoverableAfterDetach = true/);
  assert.match(backgroundControls, /stoppedSessionForTab/);
  assert.match(backgroundControls, /stoppedAt/);
});


test('Chrome debugger banner Cancel turns canceled_by_user detach into stop plus automatic retained export', () => {
  assert.match(backgroundDetach, /chrome\.debugger\.onDetach\.addListener/);
  assert.match(backgroundDetach, /canceled_by_user/);
  assert.match(backgroundDetach, /recoverableAfterDetach/);
  assert.match(backgroundDetach, /autoExportPending = true/);
  assert.match(backgroundDetach, /bannerCancel: true/);
  assert.match(backgroundDetach, /clear_auto_export/);
  assert.match(controlsDetach, /__EBSF_DIAG_TRANSPORT__/);
  assert.match(controlsDetach, /setCaptureEnabled\(false\)/);
  assert.match(controlsDetach, /clearReloadArm\(\)/);
  assert.match(controlsDetach, /stop\.click\(\)/);
  assert.match(controlsDetach, /ZIP download requested:/);
  assert.match(exportStreaming, /ZIP download requested:/);
});


test('failed or interrupted automatic export is retained without navigation-time auto-retry', () => {
  assert.match(controlsDetach, /Export failed safely:/);
  assert.match(controlsDetach, /surfacePendingAutoExport/);
  assert.match(controlsDetach, /Use Export ZIP to retry/);
  const pendingBody = controlsDetach.slice(
    controlsDetach.indexOf('async function surfacePendingAutoExport'),
    controlsDetach.indexOf('installPanelGuard();')
  );
  assert.doesNotMatch(pendingBody, /autoExportStoppedSession\(/);
  assert.match(backgroundDetach, /autoExportPending = false/);
});
