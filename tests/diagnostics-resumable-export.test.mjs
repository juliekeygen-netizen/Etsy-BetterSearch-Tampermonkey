import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../diagnostics-extension/manifest.json', import.meta.url), 'utf8'));
const serviceWorker = await readFile(new URL('../diagnostics-extension/service-worker.js', import.meta.url), 'utf8');
const background = await readFile(new URL('../diagnostics-extension/background-export-resume.js', import.meta.url), 'utf8');
const guard = await readFile(new URL('../diagnostics-extension/export-resume-guard.js', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../diagnostics-extension/export-streaming.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const check = await readFile(new URL('../scripts/check.mjs', import.meta.url), 'utf8');

test('v0.2.8 installs the resume guard before the existing bounded ZIP exporter', () => {
  assert.equal(manifest.version, '0.2.8');
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf('export-resume-guard.js') > scripts.indexOf('controls.js'));
  assert.ok(scripts.indexOf('export-resume-guard.js') < scripts.indexOf('export-streaming.js'));
  assert.ok(serviceWorker.indexOf("'background-export-resume.js'") > serviceWorker.indexOf("'background-discard-hardening.js'"));
});

test('export intent is persisted before the background stops a live recording', () => {
  const start = background.indexOf('async function startOrClaimJob');
  const persist = background.indexOf('let job = await writeJob', start);
  const stop = background.indexOf("action: 'stop_recording'", start);
  assert.ok(start >= 0);
  assert.ok(persist > start);
  assert.ok(stop > persist, 'job must be durable before debugger detach/stop work begins');
  assert.match(background, /chrome\.storage\.local\.set/);
  assert.match(background, /ebsf-diagnostics:resumable-export:v1/);
});

test('refresh or tab-close leaves an active job that a later Etsy document can claim', () => {
  assert.match(background, /get_resumable_export_job/);
  assert.match(background, /autoResume: !ownedElsewhere/);
  assert.match(background, /HEARTBEAT_STALE_MS = 9000/);
  assert.match(background, /recoverClosedOwnerSession/);
  assert.match(background, /export-owner-tab-closed-recovered/);
  assert.match(guard, /resumeInterruptedExport/);
  assert.match(guard, /Interrupted ZIP export detected\. Resuming automatically\./);
  assert.match(guard, /start_resumable_export_job/);
  assert.match(guard, /resume: Boolean\(resume\)/);
});

test('the page warns before unload but still has a recovery path if unload proceeds', () => {
  assert.match(guard, /window\.addEventListener\('beforeunload', beforeUnload, true\)/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(guard, /event\.returnValue = ''/);
  assert.match(guard, /If it is refreshed or closed, Diagnostics will resume the export the next time Etsy is opened\./);
  assert.match(guard, /heartbeat_resumable_export_job/);
});

test('Exporting overlay blocks the page and mirrors exporter progress', () => {
  assert.match(guard, /textContent = 'Exporting…'/);
  assert.match(guard, /position:fixed!important;inset:0!important;z-index:2147483647!important/);
  assert.match(guard, /backdrop-filter:blur\(4px\)/);
  assert.match(guard, /data-role="detail"/);
  assert.match(guard, /status-v2/);
  assert.match(guard, /updateOverlayDetail/);
});

test('guard secures the job first, then replays exactly one bypassed click into the existing exporter', () => {
  const claim = guard.indexOf('async function claimAndReplay');
  const secure = guard.indexOf("action: 'start_resumable_export_job'", claim);
  const replay = guard.indexOf('replayExportClick(button)', claim);
  assert.ok(claim >= 0);
  assert.ok(secure > claim);
  assert.ok(replay > secure);
  assert.match(guard, /stopImmediatePropagation\(\)/);
  assert.match(guard, /data-ebsf-export-resume-bypass/);
  assert.match(exporter, /async function streamingExport/);
  assert.match(exporter, /prepare_stream_export/);
});

test('success clears durable job state only after the existing verified finalization succeeds', () => {
  const finalizeCase = background.indexOf("case 'finalize_stream_export'");
  const call = background.indexOf('await previousHandleMessage(message, sender)', finalizeCase);
  const clear = background.indexOf('await clearJob(id)', finalizeCase);
  assert.ok(finalizeCase >= 0);
  assert.ok(call > finalizeCase);
  assert.ok(clear > call);
  assert.match(exporter, /Export complete\. The exported recording and temporary export cache were cleared\./);
});

test('normal export failure becomes manual-retry state instead of an endless auto-resume loop', () => {
  assert.match(guard, /Export failed safely:/);
  assert.match(guard, /fail_resumable_export_job/);
  assert.match(background, /status: 'failed'/);
  assert.match(background, /autoResume: false, failed: true/);
  assert.match(background, /Number\(existing\?\.attempt \|\| 0\) \+ 1/);
});

test('build and syntax audit both ship every resumable-export source file', () => {
  for (const file of ['background-export-resume.js', 'export-resume-guard.js', 'diagnostics-resumable-export.test.mjs']) {
    assert.match(build + check, new RegExp(file.replaceAll('.', '\\.')));
  }
  assert.match(build, /diagnosticsBackgroundExportResume/);
  assert.match(build, /diagnosticsExportResumeGuard/);
});
