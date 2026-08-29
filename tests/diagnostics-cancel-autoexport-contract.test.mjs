import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backgroundDetach = await readFile(new URL('../diagnostics-extension/background-detach-autoexport.js', import.meta.url), 'utf8');
const controlsDetach = await readFile(new URL('../diagnostics-extension/controls-detach-autoexport.js', import.meta.url), 'utf8');

test('Chrome debugger banner Cancel is the only detach reason that requests automatic export', () => {
  assert.match(backgroundDetach, /chrome\.debugger\.onDetach\.addListener/);
  assert.match(backgroundDetach, /canceled_by_user/);
  assert.match(backgroundDetach, /String\(reason \|\| ''\) !== 'canceled_by_user'/);
  assert.match(backgroundDetach, /autoExportPending = true/);
  assert.match(backgroundDetach, /bannerCancel: true/);
  assert.match(backgroundDetach, /debugger-banner-cancel-stop-export-requested/);
});

test('banner Cancel auto-export closes transport and clears reload arm before exporting', () => {
  const body = controlsDetach.slice(
    controlsDetach.indexOf('async function autoExportStoppedSession'),
    controlsDetach.indexOf('function installPanelGuard')
  );
  assert.match(body, /reason !== 'canceled_by_user'/);
  assert.match(body, /clearReloadArm\(\)/);
  assert.match(body, /setCaptureEnabled\(false\)/);
  assert.match(body, /stop\.click\(\)/);
  assert.ok(body.indexOf('clearReloadArm()') < body.indexOf('stop.click()'));
});

test('pending failed export is retained but never auto-retried on a later Etsy navigation', () => {
  const body = controlsDetach.slice(
    controlsDetach.indexOf('async function surfacePendingAutoExport'),
    controlsDetach.indexOf('installPanelGuard();')
  );
  assert.match(body, /stopped\.autoExportPending/);
  assert.match(body, /Use Export ZIP to retry/);
  assert.doesNotMatch(body, /autoExportStoppedSession\(/);
});
