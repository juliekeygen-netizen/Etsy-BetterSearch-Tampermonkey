'use strict';

// v0.2.8 page-side resumable-export guard.
//
// This script intentionally loads before export-streaming.js. It intercepts the
// first Stop & Export click, persists/stops the export job in the background, and
// then replays one bypassed click into the existing bounded ZIP exporter. While
// the page owns that job it shows an Exporting… overlay and installs a native
// beforeunload confirmation. If the document still disappears, the background
// job remains and a later Etsy document automatically replays the export.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const OVERLAY_ID = '__ebsf_diagnostics_exporting_overlay__';
  const STYLE_ID = `${OVERLAY_ID}-style`;
  const BYPASS_ATTR = 'data-ebsf-export-resume-bypass';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const HEARTBEAT_MS = 3500;
  const RESUME_RETRY_MS = 2500;
  let launching = false;
  let protectedSessionId = '';
  let heartbeatTimer = 0;
  let statusTimer = 0;
  let resumeRetryTimer = 0;
  let lastDetail = '';
  let baselineSuccessCount = 0;
  let baselineFailureCount = 0;
  let activityObserver = null;

  function panel() { return document.getElementById(PANEL_ID); }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          resolve(error ? { ok: false, error: error.message } : (response || { ok: false, error: 'No response from diagnostics background.' }));
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function appendActivity(message) {
    const pre = panel()?.querySelector('[data-role="activity"]');
    if (!pre) return;
    const existing = pre.textContent ? `${pre.textContent.trimEnd()}\n` : '';
    pre.textContent = `${existing}[${new Date().toLocaleTimeString()}] ${message}`.split('\n').slice(-80).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  function setStatus(text) {
    const node = panel()?.querySelector('[data-role="status-v2"], [data-role="status"]');
    if (node) node.textContent = text;
  }

  function seedStoppedHint(session) {
    if (!session?.sessionId || !session.stoppedAt) return;
    const value = {
      sessionId: String(session.sessionId),
      startedAt: Number(session.startedAt || 0),
      startedIso: String(session.startedIso || ''),
      stoppedAt: Number(session.stoppedAt || Date.now()),
      stoppedIso: String(session.stoppedIso || new Date(Number(session.stoppedAt || Date.now())).toISOString())
    };
    try { sessionStorage.setItem(STOPPED_KEY, JSON.stringify(value)); } catch (_) {}
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{
        position:fixed!important;inset:0!important;z-index:2147483647!important;
        display:grid!important;place-items:center!important;
        background:rgba(16,16,18,.34)!important;
        backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important;
        font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
      }
      #${OVERLAY_ID}[hidden]{display:none!important}
      #${OVERLAY_ID} .ebsf-exporting-card{
        width:min(420px,calc(100vw - 36px))!important;box-sizing:border-box!important;
        padding:24px 26px!important;border-radius:18px!important;
        background:#fff!important;color:#222!important;
        box-shadow:0 18px 70px rgba(0,0,0,.26)!important;
        border:1px solid rgba(0,0,0,.08)!important;text-align:left!important;
      }
      #${OVERLAY_ID} .ebsf-exporting-row{display:flex!important;align-items:center!important;gap:14px!important}
      #${OVERLAY_ID} .ebsf-exporting-spinner{
        width:20px!important;height:20px!important;box-sizing:border-box!important;flex:0 0 20px!important;
        border:2px solid rgba(34,34,34,.18)!important;border-top-color:#222!important;border-radius:50%!important;
        animation:ebsf-export-spin .75s linear infinite!important;
      }
      #${OVERLAY_ID} .ebsf-exporting-title{font-size:18px!important;font-weight:650!important;line-height:1.25!important}
      #${OVERLAY_ID} .ebsf-exporting-detail{margin-top:11px!important;font-size:13px!important;line-height:1.45!important;color:#555!important}
      #${OVERLAY_ID} .ebsf-exporting-safe{margin-top:8px!important;font-size:12px!important;line-height:1.4!important;color:#777!important}
      @keyframes ebsf-export-spin{to{transform:rotate(360deg)}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureOverlay() {
    installStyle();
    let root = document.getElementById(OVERLAY_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.hidden = true;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-busy', 'true');

    const card = document.createElement('div');
    card.className = 'ebsf-exporting-card';
    const row = document.createElement('div');
    row.className = 'ebsf-exporting-row';
    const spinner = document.createElement('div');
    spinner.className = 'ebsf-exporting-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const title = document.createElement('div');
    title.className = 'ebsf-exporting-title';
    title.textContent = 'Exporting…';
    row.append(spinner, title);

    const detail = document.createElement('div');
    detail.className = 'ebsf-exporting-detail';
    detail.dataset.role = 'detail';
    detail.textContent = 'Preparing diagnostic ZIP…';
    const safe = document.createElement('div');
    safe.className = 'ebsf-exporting-safe';
    safe.textContent = 'Keep this tab open if possible. If it is refreshed or closed, Diagnostics will resume the export the next time Etsy is opened.';
    card.append(row, detail, safe);
    root.append(card);
    document.documentElement.appendChild(root);
    return root;
  }

  function showOverlay(detail = 'Preparing diagnostic ZIP…') {
    const root = ensureOverlay();
    root.hidden = false;
    updateOverlayDetail(detail);
  }

  function hideOverlay() {
    const root = document.getElementById(OVERLAY_ID);
    if (root) root.hidden = true;
  }

  function updateOverlayDetail(detail) {
    const text = String(detail || '').trim() || 'Preparing diagnostic ZIP…';
    if (text === lastDetail) return;
    lastDetail = text;
    const node = ensureOverlay().querySelector('[data-role="detail"]');
    if (node) node.textContent = text;
  }

  function countNeedle(text, needle) {
    let count = 0;
    let index = 0;
    while ((index = text.indexOf(needle, index)) >= 0) {
      count++;
      index += needle.length;
    }
    return count;
  }

  function beforeUnload(event) {
    if (!protectedSessionId && !launching) return;
    event.preventDefault();
    event.returnValue = '';
    return '';
  }

  function clearResumeRetry() {
    if (resumeRetryTimer) clearTimeout(resumeRetryTimer);
    resumeRetryTimer = 0;
  }

  function stopTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (statusTimer) clearInterval(statusTimer);
    heartbeatTimer = 0;
    statusTimer = 0;
  }

  function stopProtection() {
    protectedSessionId = '';
    stopTimers();
    clearResumeRetry();
    activityObserver?.disconnect();
    window.removeEventListener('beforeunload', beforeUnload, true);
    hideOverlay();
  }

  function watchActivityOutcome() {
    activityObserver?.disconnect();
    const activity = panel()?.querySelector('[data-role="activity"]');
    if (!activity) return;
    const initial = String(activity.textContent || '');
    baselineSuccessCount = countNeedle(initial, 'Export complete.');
    baselineFailureCount = countNeedle(initial, 'Export failed safely:');
    activityObserver = new MutationObserver(() => {
      if (!protectedSessionId && !launching) return;
      const text = String(activity.textContent || '');
      const successCount = countNeedle(text, 'Export complete.');
      const failureCount = countNeedle(text, 'Export failed safely:');
      if (successCount > baselineSuccessCount) {
        stopProtection();
        return;
      }
      if (failureCount > baselineFailureCount) {
        const id = protectedSessionId;
        const lastLine = text.trim().split('\n').slice(-1)[0] || 'Export failed; recording retained.';
        if (id) void send({ action: 'fail_resumable_export_job', sessionId: id, error: lastLine });
        stopProtection();
      }
    });
    activityObserver.observe(activity, { childList: true, characterData: true, subtree: true });
  }

  function startProtection(sessionId, detail) {
    protectedSessionId = String(sessionId || protectedSessionId || '');
    showOverlay(detail || 'Preparing diagnostic ZIP…');
    window.addEventListener('beforeunload', beforeUnload, true);
    watchActivityOutcome();
    stopTimers();
    clearResumeRetry();

    const heartbeat = () => {
      if (!protectedSessionId) return;
      const status = panel()?.querySelector('[data-role="status-v2"], [data-role="status"]')?.textContent?.trim() || lastDetail;
      if (status) updateOverlayDetail(status);
      void send({
        action: 'heartbeat_resumable_export_job',
        sessionId: protectedSessionId,
        detail: status || 'Exporting diagnostic ZIP…'
      });
    };
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
    heartbeat();

    statusTimer = setInterval(() => {
      const status = panel()?.querySelector('[data-role="status-v2"], [data-role="status"]')?.textContent?.trim();
      if (status) updateOverlayDetail(status);
    }, 250);
  }

  function replayExportClick(button) {
    button.setAttribute(BYPASS_ATTR, '1');
    try {
      button.click();
    } finally {
      button.removeAttribute(BYPASS_ATTR);
    }
  }

  async function claimAndReplay(button, sessionId = '', resume = false) {
    if (launching) return;
    launching = true;
    clearResumeRetry();
    showOverlay(resume ? 'Resuming interrupted ZIP export…' : 'Securing export job…');
    window.addEventListener('beforeunload', beforeUnload, true);
    try {
      const response = await send({
        action: 'start_resumable_export_job',
        sessionId: String(sessionId || ''),
        resume: Boolean(resume)
      });
      if (!response?.ok || !response.session?.sessionId) {
        throw new Error(response?.error || 'Could not secure the export job.');
      }

      // The existing v0.2.7 exporter resolves a stopped session from this page's
      // sessionStorage when get_state belongs to a different tab. Seed that hint
      // from the background-owned session before replaying the exporter click.
      // Without this cross-tab handoff a correctly recovered job could still say
      // "No stopped recording is available" after the original tab was closed.
      seedStoppedHint(response.session);

      startProtection(
        response.session.sessionId,
        response.resumed || resume ? 'Resuming interrupted ZIP export…' : 'Preparing diagnostic ZIP…'
      );
      appendActivity(response.resumed || resume
        ? 'Resuming protected ZIP export from retained diagnostic data.'
        : 'ZIP export is protected against accidental refresh/tab close and can resume after interruption.');
      replayExportClick(button);
    } catch (error) {
      const message = error?.message || String(error);
      stopProtection();
      setStatus('Export could not start');
      appendActivity(`Protected export could not start: ${message}`);
    } finally {
      launching = false;
    }
  }

  function interceptExportClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest(`#${PANEL_ID} [data-role="stop"]`)
      : null;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.getAttribute(BYPASS_ATTR) === '1') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (launching) return;
    void claimAndReplay(button, '', false);
  }

  async function waitForPanelAndStop(timeoutMs = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const root = panel();
      const stop = root?.querySelector('[data-role="stop"]');
      if (root && stop instanceof HTMLButtonElement) return { root, stop };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  function scheduleResumeRetry() {
    if (resumeRetryTimer || launching || protectedSessionId) return;
    resumeRetryTimer = setTimeout(() => {
      resumeRetryTimer = 0;
      void resumeInterruptedExport();
    }, RESUME_RETRY_MS);
  }

  async function resumeInterruptedExport() {
    const found = await waitForPanelAndStop();
    if (!found || launching || protectedSessionId) return;
    const pending = await send({ action: 'get_resumable_export_job' });
    if (!pending?.ok || !pending.job?.sessionId) return;
    if (!pending.autoResume) {
      // A freshly closed/navigated-away owner may still have a valid heartbeat
      // for a few seconds. Keep polling this already-open Etsy page so the job is
      // claimed automatically as soon as that lease expires; do not require a
      // second manual refresh just because the user came back quickly.
      if (pending.job.status === 'active' && !pending.failed) scheduleResumeRetry();
      return;
    }
    appendActivity('Interrupted ZIP export detected. Resuming automatically.');
    await claimAndReplay(found.stop, pending.job.sessionId, true);
  }

  document.addEventListener('click', interceptExportClick, true);
  void resumeInterruptedExport();
})();
