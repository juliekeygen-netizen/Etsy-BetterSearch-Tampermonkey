import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ROOT } from '../scripts/project.mjs';

const hardeningPath = resolve(ROOT, 'src/73-favorites-phase5-hardening.js');

async function source() {
  return readFile(hardeningPath, 'utf8');
}

test('Phase 5 hardening parses raw JSON-LD before entity-decoding fallback', async () => {
  const text = await source();
  const rawParse = text.indexOf('parsed = JSON.parse(raw)');
  const decoded = text.indexOf('const decoded = favDeepDecodeText(raw)');
  assert.ok(rawParse >= 0);
  assert.ok(decoded > rawParse);
  assert.match(text, /FAV_DEEP_PARSER_VERSION\s*=\s*'listing-html-v2'/);
});

test('Phase 5 hardening refuses challenge, empty, and mismatched listing responses', async () => {
  const text = await source();
  assert.match(text, /challenge-page/);
  assert.match(text, /empty-listing-metadata/);
  assert.match(text, /listing-identity-mismatch/);
  assert.match(text, /favDeepObservationHasEvidence0103/);
});

test('Phase 5 hardening treats 404 and 410 as terminal availability observations', async () => {
  const text = await source();
  assert.match(text, /!\[404, 410\]\.includes\(response\.status\)/);
  assert.match(text, /Number\(error\.httpStatus\) === 410 \? 'deleted' : 'unavailable'/);
  assert.match(text, /record\.availabilityState === 'unavailable'/);
  assert.match(text, /record\.availabilityState === 'deleted'/);
});

test('Phase 5 queue runner preserves expanded totals and cancellation does not burn retry budget', async () => {
  const text = await source();
  assert.match(text, /total = Math\.max\(total, Number\(favDeepState\.total\) \|\| 0, completed \+ failed\)/);
  assert.match(text, /attempts:Math\.max\(0, \(Number\(job\.attempts\) \|\| 1\) - 1\)/);
  assert.match(text, /status:'cancelled'/);
  assert.match(text, /favDeepRunnerController\.abort\(\)/);
});

test('manual deep cancellation suppresses automatic self-restart until explicitly resumed', async () => {
  const text = await source();
  assert.match(text, /favDeepAutoResumeSuppressed0103 = true/);
  assert.match(text, /if \(favDeepAutoResumeSuppressed0103\) return false/);
  assert.match(text, /favDeepScanMissing0103/);
  assert.match(text, /favDeepUpdateAll0103/);
  assert.match(text, /Cancel deep scan/);
});

test('repeated deep failures respect Retry-After and apply a bounded cooldown', async () => {
  const text = await source();
  assert.match(text, /error\.retryAfterMs = favRetryAfterMs/);
  assert.match(text, /favDeepConsecutiveFailures0103 >= 3|favDeepConsecutiveFailures0103 < 3/);
  assert.match(text, /Math\.min\(2 \* 60 \* 1000/);
  assert.match(text, /cooldown ~\$\{seconds\}s/);
});

test('Phase 5 hardening module loads after catalogue fixes and before Favorites runtime', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const category = userscript.indexOf('src/72-favorites-catalog-category-fix.js');
  const hardening = userscript.indexOf('src/73-favorites-phase5-hardening.js');
  const runtime = userscript.indexOf('src/63-favorites-runtime.js');
  assert.ok(category >= 0);
  assert.ok(hardening > category);
  assert.ok(runtime > hardening);
});
