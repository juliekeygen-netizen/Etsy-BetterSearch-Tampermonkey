'use strict';

// Final page-side hardening for diagnostics v0.2.2. This deliberately reuses
// the v0.2.1 Stop/Export controls instead of duplicating the proven chunked ZIP
// path. It also owns the final collapsed-launcher geometry and active drawer
// lock so earlier compatibility CSS cannot override the intended UX.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
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

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}[data-collapsed="1"]{
        box-sizing:border-box!important;
        width:44px!important;min-width:44px!important;
        height:44px!important;min-height:44px!important;
        border-radius:10px!important;
      }
      #${PANEL_ID}[data-collapsed="1"] header{
        box-sizing:border-box!important;
        width:42px!important;height:42px!important;
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

  async function waitForExportOutcome(root, activityStartLength, timeoutMs = 30000) {
    const started = Date.now();
    const activity = root?.querySelector('[data-role="activity"]');
    while (Date.now() - started < timeoutMs) {
      const newText = String(activity?.textContent || '').slice(activityStartLength);
      if (/ZIP download requested:/i.test(newText)) return 'success';
      if (/Export failed safely:/i.test(newText)) return 'failed';
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 'unknown';
  }

  async function autoExportStoppedSession(session, reason = 'unexpected-detach') {
    const id = String(session?.sessionId || '');
    if (!id || handledSessions.has(id)) return;
    handledSessions.add(id);

    // Stop the page-side event transport immediately. Chrome already detached
    // CDP, so no new network events can arrive; this prevents the DOM recorder
    // from continuing to enqueue data while the retained session is finalized.
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

    // Let the existing controls layer settle its get_state() result first. If
    // it still thinks it is recording, the same click performs Stop+Export; if
    // it already sees the recovered stopped session, it performs Export only.
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
      await send({ action: 'clear_auto_export', sessionId: id });
    } else if (outcome !== 'failed') {
      // Keep autoExportPending for a retry after refresh if Chrome interrupted
      // the page before the existing export controls could report an outcome.
      handledSessions.delete(id);
    }
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
    void autoExportStoppedSession(message.session, message.reason || 'unexpected-detach');
  });

  async function recoverPendingAutoExport() {
    await waitForPanel();
    await new Promise((resolve) => setTimeout(resolve, 650));
    const response = await send({ action: 'get_state' });
    const stopped = response?.stopped;
    if (stopped?.sessionId && stopped.autoExportPending) {
      void autoExportStoppedSession(stopped, stopped.autoExportReason || 'pending-after-navigation');
    }
  }

  installPanelGuard();
  void recoverPendingAutoExport();
})();
