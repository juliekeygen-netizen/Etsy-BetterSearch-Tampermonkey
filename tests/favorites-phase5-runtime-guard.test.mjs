import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ROOT } from '../scripts/project.mjs';

const guardPath = resolve(ROOT, 'src/74-favorites-phase5-runtime-guard.js');

async function source() {
  return readFile(guardPath, 'utf8');
}

test('zero-work automatic deep scans are silent instead of emitting completion loops', async () => {
  const text = await source();
  assert.match(text, /if \(!queued\.length\)/);
  assert.match(text, /status:'idle'/);
  assert.match(text, /skipped:true/);
});

test('recent failed and unavailable deep jobs are not auto-requeued immediately', async () => {
  const text = await source();
  assert.match(text, /FAV_DEEP_FAILED_REQUEUE_MS0104 = 6 \* 60 \* 60 \* 1000/);
  assert.match(text, /FAV_DEEP_UNAVAILABLE_RETRY_MS0104 = 24 \* 60 \* 60 \* 1000/);
  assert.match(text, /existingJob\?\.status === 'failed'/);
  assert.match(text, /\['unavailable', 'deleted'\]\.includes\(listing\.availabilityState\)/);
});

test('manual deep actions can explicitly retry recent failures', async () => {
  const text = await source();
  assert.match(text, /retryFailed:true/);
  assert.match(text, /favDeepScanMissing0104/);
  assert.match(text, /favDeepUpdateAll0104/);
});

test('challenge detection uses structural markers rather than arbitrary listing text', async () => {
  const text = await source();
  const start = text.indexOf('function favDeepLooksLikeChallenge0104');
  const end = text.indexOf('/* Replace the broad v0.10.3 text check', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const detector = text.slice(start, end);
  assert.doesNotMatch(detector, /robot check/);
  assert.match(detector, /g-recaptcha/);
  assert.match(detector, /challenge-container/);
});

test('deep scanning is named separately from Favorites sync in production UI', async () => {
  const text = await source();
  assert.match(text, /title:'Scanning metadata'/);
  assert.match(text, /node\.textContent = 'Scanning'/);
});

test('runtime guard loads after Phase 5 hardening and before Favorites runtime', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const hardening = userscript.indexOf('src/73-favorites-phase5-hardening.js');
  const guard = userscript.indexOf('src/74-favorites-phase5-runtime-guard.js');
  const runtime = userscript.indexOf('src/63-favorites-runtime.js');
  assert.ok(hardening >= 0);
  assert.ok(guard > hardening);
  assert.ok(runtime > guard);
});
