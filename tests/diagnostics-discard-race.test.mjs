import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serviceWorker = await readFile(new URL('../diagnostics-extension/service-worker.js', import.meta.url), 'utf8');
const discard = await readFile(new URL('../diagnostics-extension/background-discard-hardening.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('destructive Cancel hardening loads after all detach recovery/export layers', () => {
  const streaming = serviceWorker.indexOf("'background-streaming-export.js'");
  const hardening = serviceWorker.indexOf("'background-discard-hardening.js'");
  assert.ok(streaming >= 0);
  assert.ok(hardening > streaming);
  assert.match(build, /background-discard-hardening\.js/);
  assert.match(build, /diagnosticsBackgroundDiscardHardening/);
});

test('confirmed Cancel removes recovery pointers before chrome debugger detach', () => {
  const clearActiveAt = discard.indexOf('await clearActive(tabId)');
  const clearRememberedAt = discard.indexOf('await chrome.storage.session.remove(lastSessionKey(tabId))');
  const detachAt = discard.indexOf('await detach(tabId)');
  assert.ok(clearActiveAt >= 0);
  assert.ok(clearRememberedAt > clearActiveAt);
  assert.ok(detachAt > clearRememberedAt);
});

test('destructive Cancel uses explicit-id finalization after detaching and verifies deletion', () => {
  const detachAt = discard.indexOf('await detach(tabId)');
  const finalizeAt = discard.indexOf("action: 'finalize_export', sessionId: id");
  const verifyAt = discard.indexOf('remaining = await getSession(id)');
  assert.ok(detachAt >= 0);
  assert.ok(finalizeAt > detachAt);
  assert.ok(verifyAt > finalizeAt);
  assert.match(discard, /deleteSessionData\(id\)/);
  assert.match(discard, /discard_stream_recording/);
});

test('successful Stop & Export waits beyond every detach-recovery timer before deleting data', () => {
  assert.match(discard, /FINALIZE_DETACH_SETTLE_MS = 750/);
  assert.match(discard, /action === 'finalize_stream_export'/);
  assert.match(discard, /setTimeout\(resolve, FINALIZE_DETACH_SETTLE_MS\)/);
  assert.match(discard, /background-controls recovery waits 250 ms/);
  assert.match(discard, /Chrome-banner recovery/);
});
