import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../diagnostics-extension/manifest.json', import.meta.url), 'utf8'));
const serviceWorker = await readFile(new URL('../diagnostics-extension/service-worker.js', import.meta.url), 'utf8');
const backgroundControls = await readFile(new URL('../diagnostics-extension/background-controls.js', import.meta.url), 'utf8');
const backgroundStability = await readFile(new URL('../diagnostics-extension/background-stability.js', import.meta.url), 'utf8');
const bootstrapGuard = await readFile(new URL('../diagnostics-extension/bootstrap-guard.js', import.meta.url), 'utf8');
const controls = await readFile(new URL('../diagnostics-extension/controls.js', import.meta.url), 'utf8');
const stability = await readFile(new URL('../diagnostics-extension/stability.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');


test('diagnostics v0.2.2 loads stale-arm guard, recorder and stability layers in safe order', () => {
  assert.equal(manifest.version, '0.2.2');
  assert.deepEqual(manifest.content_scripts[0].js, [
    'transport.js',
    'bootstrap-guard.js',
    'content.js',
    'controls.js',
    'stability.js'
  ]);
  assert.match(serviceWorker, /importScripts\('background\.js', 'har-extra-info\.js', 'background-controls\.js', 'background-stability\.js'\)/);
  for (const name of ['background-controls.js', 'background-stability.js', 'transport.js', 'bootstrap-guard.js', 'controls.js', 'stability.js']) {
    assert.match(build, new RegExp(name.replaceAll('.', '\\.')));
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


test('collapsed launcher shell exactly matches the existing 42px plus button', () => {
  assert.match(stability, /width:42px!important/);
  assert.match(stability, /height:42px!important/);
  assert.match(stability, /header>span\{display:none!important\}/);
  assert.match(stability, /header>button\{position:absolute!important;inset:0!important;width:42px!important;height:42px!important/);
});


test('Record & Reload stays document-start armed and Start button is Pause\/Resume', () => {
  assert.match(controls, /startAndReload/);
  assert.match(controls, /start_recording/);
  assert.match(controls, /sessionStorage\.setItem\(ARM_KEY/);
  assert.match(controls, /location\.reload\(\)/);
  assert.match(controls, /target\.matches\('\[data-start="start"\]'\)/);
  assert.match(controls, /pauseRecording/);
  assert.match(controls, /resumeRecording/);
});


test('stale document-start arm cannot resurrect the heavy recorder indefinitely', () => {
  assert.match(bootstrapGuard, /MAX_ARM_AGE_MS = 45 \* 1000/);
  assert.match(bootstrapGuard, /armedAt/);
  assert.match(bootstrapGuard, /Storage\.prototype\.setItem/);
  assert.match(bootstrapGuard, /sessionStorage\.removeItem\(ARM_KEY\)/);
  assert.match(bootstrapGuard, /setTimeout\(\(\) =>/);
  assert.match(bootstrapGuard, /one-shot/);
});


test('background get_state validates that a supposedly active debugger is really attached', () => {
  assert.match(backgroundStability, /chrome\.debugger\.getTargets\(\)/);
  assert.match(backgroundStability, /stale-active-session-without-debugger/);
  assert.match(backgroundStability, /recoverAsStopped/);
  assert.match(backgroundStability, /message\?\.action === 'get_state'/);
  assert.match(backgroundStability, /chrome\.storage\.session\.remove\(activeKey\(tabId\)\)/);
});


test('Chrome debugger Cancel becomes a recoverable stopped session and requests automatic export', () => {
  assert.match(backgroundStability, /canceled_by_user/);
  assert.match(backgroundStability, /debugger-cancel-auto-export-requested/);
  assert.match(backgroundStability, /ebsf_diag_debugger_cancelled/);
  assert.match(backgroundStability, /chrome\.tabs\.sendMessage/);
  assert.match(stability, /triggerCancelExport/);
  assert.match(stability, /stop\.click\(\)/);
  assert.match(stability, /captured session is retained/);
});


test('drawer cannot collapse while recording and remains visibly open', () => {
  assert.match(stability, /forceOpenWhileActive/);
  assert.match(stability, /host\?\.dataset\.recording !== '1'/);
  assert.match(stability, /event\.stopImmediatePropagation\(\)/);
  assert.match(stability, /attributeFilter: \['data-recording', 'data-collapsed'\]/);
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


test('large stopped exports use a persistent chunk cache instead of one giant runtime response', () => {
  assert.match(backgroundControls, /EXPORT_DB_NAME/);
  assert.match(backgroundControls, /EXPORT_CHUNK_CHARS = 256 \* 1024/);
  assert.match(backgroundControls, /prepare_export/);
  assert.match(backgroundControls, /export_chunk/);
  assert.match(backgroundControls, /persistExportChunks/);
  assert.match(controls, /readPreparedExport/);
  assert.match(controls, /Reading export data/);
  assert.doesNotMatch(controls, /action: 'export_stopped'/);
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
