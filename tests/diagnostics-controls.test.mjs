import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../diagnostics-extension/manifest.json', import.meta.url), 'utf8'));
const serviceWorker = await readFile(new URL('../diagnostics-extension/service-worker.js', import.meta.url), 'utf8');
const backgroundControls = await readFile(new URL('../diagnostics-extension/background-controls.js', import.meta.url), 'utf8');
const controls = await readFile(new URL('../diagnostics-extension/controls.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');


test('diagnostics v0.2 loads transport, content and control layers in safe order', () => {
  assert.equal(manifest.version, '0.2.0');
  assert.deepEqual(manifest.content_scripts[0].js, ['transport.js', 'content.js', 'controls.js']);
  assert.match(serviceWorker, /importScripts\('background\.js', 'har-extra-info\.js', 'background-controls\.js'\)/);
  assert.match(build, /background-controls\.js/);
  assert.match(build, /transport\.js/);
  assert.match(build, /controls\.js/);
});


test('recording control state provides Pause\/Resume and Stop without forcing export', () => {
  assert.match(controls, /Stop recording/);
  assert.match(controls, /Recording paused/);
  assert.match(controls, /Recording resumed/);
  assert.match(controls, /Stopped · ready to export/);
  assert.match(controls, /Export ZIP/);
  assert.match(backgroundControls, /pause_recording/);
  assert.match(backgroundControls, /resume_recording/);
  assert.match(backgroundControls, /export_stopped/);
  assert.match(backgroundControls, /active\.recording = false/);
  assert.match(backgroundControls, /active\.paused = true/);
  assert.match(backgroundControls, /active\.recording = true/);
});


test('pause keeps debugger attached while stop uses the core stop path that detaches it', () => {
  const pauseBody = backgroundControls.slice(
    backgroundControls.indexOf('async function pauseRecording'),
    backgroundControls.indexOf('async function resumeRecording')
  );
  assert.doesNotMatch(pauseBody, /detach\(/);
  assert.match(controls, /action: 'stop_recording'/);
});


test('drawer is forced open during recording or pause and collapses to a tiny square launcher otherwise', () => {
  assert.match(controls, /ui\.mode === 'recording' \|\| ui\.mode === 'paused'/);
  assert.match(controls, /Drawer stays open while recording/);
  assert.match(controls, /width:42px!important/);
  assert.match(controls, /header>span\{display:none!important\}/);
  assert.match(controls, /header>button\{width:42px!important;height:42px!important/);
});


test('Record & Reload is owned by the new control layer and keeps document-start arming', () => {
  assert.match(controls, /startAndReload/);
  assert.match(controls, /start_recording/);
  assert.match(controls, /sessionStorage\.setItem\(ARM_KEY/);
  assert.match(controls, /location\.reload\(\)/);
  assert.match(controls, /target\.matches\('\[data-start="reload"\]'\)/);
});


test('manual marker dialog has true Cancel in addition to keep-without-note and save-note', () => {
  assert.match(controls, /data-role="marker-cancel"/);
  assert.match(controls, /button\.textContent = 'Cancel'/);
  assert.match(controls, /cancel_marker/);
  assert.match(backgroundControls, /deleteMarkerEvents/);
  assert.match(backgroundControls, /item\.delete\(\)/);
  assert.match(controls, /setTimeout\(\(\) => void send\(request\), 650\)/);
});


test('stopped capture is retained until explicit export or replacement', () => {
  assert.match(controls, /STOPPED_KEY/);
  assert.match(controls, /stoppedExportData/);
  assert.match(controls, /finalize_export/);
  assert.match(backgroundControls, /readEvents\(id\)/);
  assert.match(backgroundControls, /buildHar\(session, events\)/);
  assert.match(backgroundControls, /buildSummary\(session, events, har\)/);
});


test('unexpected debugger detach is recovered as a stopped exportable session', () => {
  assert.match(backgroundControls, /LAST_SESSION_KEY_PREFIX/);
  assert.match(backgroundControls, /chrome\.debugger\.onDetach\.addListener/);
  assert.match(backgroundControls, /unexpected-detach-recovered/);
  assert.match(backgroundControls, /recoverableAfterDetach = true/);
  assert.match(backgroundControls, /await setActive\(tabId, persisted\)/);
  assert.match(backgroundControls, /if \(!persisted \|\| persisted\.stoppedAt\) return/);
});
