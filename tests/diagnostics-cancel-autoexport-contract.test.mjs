import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backgroundDetach = await readFile(new URL('../diagnostics-extension/background-detach-autoexport.js', import.meta.url), 'utf8');
const controlsDetach = await readFile(new URL('../diagnostics-extension/controls-detach-autoexport.js', import.meta.url), 'utf8');

test('unexpected Chrome debugger detach requests retained auto-export', () => {
  assert.match(backgroundDetach, /chrome\.debugger\.onDetach\.addListener/);
  assert.match(backgroundDetach, /autoExportPending = true/);
  assert.match(backgroundDetach, /ebsf-diagnostics-unexpected-detach/);
});

test('page auto-export closes transport and clears reload arm before exporting', () => {
  const body = controlsDetach.slice(
    controlsDetach.indexOf('async function autoExportStoppedSession'),
    controlsDetach.indexOf('function installPanelGuard')
  );
  assert.match(body, /clearReloadArm\(\)/);
  assert.match(body, /setCaptureEnabled\(false\)/);
  assert.match(body, /stop\.click\(\)/);
  assert.ok(body.indexOf('clearReloadArm()') < body.indexOf('stop.click()'));
});
