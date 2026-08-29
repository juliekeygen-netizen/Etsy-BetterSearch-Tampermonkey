'use strict';

// Chrome owns the visible debugger banner. Its Cancel action is still interpreted
// as Stop + Export. v0.2.7 waits for the exporter's verified "Export complete"
// outcome instead of treating the initial download click as completion, avoiding
// a race that could write a finalized session back into storage.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const STYLE_ID = `${PANEL_ID}-detach-autoexport-style`;
  const handledSessions = new Set();

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          resolve(error ? { ok: false, error: error.message } : (response || { ok: false, error: 'No response.' }));
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function panel() {
    return document.getElementById(PANEL_ID);
  }

  function forcePanelOpen() {
    const root = panel();
    if (!root) return false;
    root.dataset.collapsed = '0';
    const button = root.querySelector('[data-role="collapse"]');
    if (button) {
      button.textContent = '—';
      button.setAttribute('aria-label', 'Collapse');
    }
    return true;
  }

  function clearReloadArm() {
    try { sessionStorage.removeItem(ARM_KEY); } catch (_) {}
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}[data-collapsed="1"]{
        box-sizing:border-box!important;
        width:42px!important;min-width:42px!important;max-width:42px!important;
        height:42px!important;min-height:42px!important;max-height:42px!important;
        padding:0!important;margin:0!important;overflow:hidden!important;
        border-radius:10px!important;
      }
      #${PANEL_ID}[data-collapsed="1"] header{
        box-sizing:border-box!important;
        width:42px!important;height:42px!important;
        min-width:42px!important;min-height:42px!important;
        padding:0!important;margin:0!important;
        display:grid!important;place-items:center!important;
      }
      #${PANEL_ID}[data-collapsed="1"] header>button{
        position:static!important;inset:auto!important;
        width:42px!important;height:42px!important;
        margin:0!important;padding:0!important;
        border-radius:9px!important;
        display:grid!important;place-items:center!important;
      }
      #${PANEL_ID}[data-collapsed="1"] header>span{display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function blockActiveCollapse(event) {
    const root = panel();
    if (!root || root.dataset.recording !== '1') return;
    const button = event.target instanceof Element
      ? event.target.closest(`#${PANEL_ID} [data-role="collapse"]`)
      : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    forcePanelOpen();
  }

  async function waitForPanel(timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const root = panel();
      if (root) return root;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return null;
  }

  async function waitForExportOutcome(root, activityStartLength, timeoutMs = 120000) {
    const started = Date.now();
    const activity = root?.querySelector('[data-role="activity"]');
    while (Date.now() - started < timeoutMs) {
      const newText = String(activity?.textContent || '').slice(activityStartLength);
      if (/Export complete\./i.test(newText)) return 'success';
      if (/Export failed safely:/i.test(newText)) return 'failed';
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 'unknown';
  }

  async function autoExportStoppedSession(session, reason = 'canceled_by_user') {
    const id = String(session?.sessionId || '');
    if (!id || reason !== 'canceled_by_user' || handledSessions.has(id)) return;
    handledSessions.add(id);

    clearReloadArm();
    globalThis.__EBSF_DIAG_TRANSPORT__?.setCaptureEnabled(false);

    const root = await waitForPanel();
    if (!root) {
      handledSessions.delete(id);
      return;
    }
    forcePanelOpen();

    const activity = root.querySelector('[data-role="activity"]');
    const activityStartLength = String(activity?.textContent || '').length;
    const stop = root.querySelector('[data-role="stop"]');
    if (!(stop instanceof HTMLButtonElement)) {
      handledSessions.delete(id);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 180));
    if (stop.disabled) {
      const deadline = Date.now() + 5000;
      while (stop.disabled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
    if (stop.disabled) {
      handledSessions.delete(id);
      return;
    }

    stop.click();
    const outcome = await waitForExportOutcome(root, activityStartLength);
    if (outcome === 'success') {
      // v0.2.7's exporter finalizes and deletes the session itself. Do not call
      // clear_auto_export here: a late putSession() could race the deletion and
      // resurrect the already-exported capture.
      return;
    }
    if (outcome === 'unknown') {
      handledSessions.delete(id);
    }
    // A failed export remains retained. It is intentionally not auto-retried on
    // later Etsy navigations; the explicit Export ZIP button is the retry path.
  }

  function installPanelGuard() {
    installStyle();
    document.addEventListener('click', blockActiveCollapse, true);

    const observe = async () => {
      const root = await waitForPanel();
      if (!root) return;
      if (root.dataset.recording === '1') forcePanelOpen();
      new MutationObserver(() => {
        if (root.dataset.recording === '1' && root.dataset.collapsed === '1') forcePanelOpen();
      }).observe(root, { attributes: true, attributeFilter: ['data-recording', 'data-collapsed'] });
    };
    void observe();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'ebsf-diagnostics-unexpected-detach') return;
    clearReloadArm();
    if (message.bannerCancel !== true && message.reason !== 'canceled_by_user') return;
    void autoExportStoppedSession(message.session, 'canceled_by_user');
  });

  async function surfacePendingAutoExport() {
    const root = await waitForPanel();
    if (!root) return;
    await new Promise((resolve) => setTimeout(resolve, 650));
    const response = await send({ action: 'get_state' });
    const stopped = response?.stopped;
    if (!stopped?.sessionId || !stopped.autoExportPending) return;

    clearReloadArm();
    globalThis.__EBSF_DIAG_TRANSPORT__?.setCaptureEnabled(false);
    const activity = root.querySelector('[data-role="activity"]');
    if (activity && !/Chrome debugger Cancel recording is retained/i.test(activity.textContent || '')) {
      const prefix = activity.textContent ? `${activity.textContent.trimEnd()}\n` : '';
      activity.textContent = `${prefix}[${new Date().toLocaleTimeString()}] Chrome debugger Cancel recording is retained. Use Export ZIP to retry; it will not auto-export on page load.`;
    }
  }

  installPanelGuard();
  void surfacePendingAutoExport();
})();
