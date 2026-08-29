import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../diagnostics-extension/background-session-health.js', import.meta.url), 'utf8');

test('session health checks Chrome targets before allowing get_state to resume capture', () => {
  assert.match(source, /chrome\.debugger\.getTargets\(\)/);
  assert.match(source, /target\.tabId === tabId && target\.attached/);
  assert.match(source, /message\?\.action !== 'get_state'/);
  assert.match(source, /attached === false \|\| active\.debuggerAttached === false/);
});

test('stale active sessions are preserved as stopped recoverable recordings', () => {
  assert.match(source, /session\.recording = false/);
  assert.match(source, /session\.paused = false/);
  assert.match(source, /session\.recoverableAfterDetach = true/);
  assert.match(source, /stale-active-session-without-debugger/);
  assert.match(source, /lastSessionKey\(tabId\)/);
  assert.match(source, /chrome\.storage\.session\.remove\(activeKey\(tabId\)\)/);
});
