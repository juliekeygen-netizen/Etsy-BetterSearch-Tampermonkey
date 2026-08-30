'use strict';

// v0.2.8 visible export-state ownership.
//
// The resumable-export guard is the authoritative signal that a protected ZIP
// export owns the page. The older recorder controls keep their own in-memory
// recording state, so stopping from the guard can otherwise leave the panel
// looking live while the backend is already stopped. Mirror the guard overlay
// into a hard visual/interaction state without changing capture semantics.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const OVERLAY_ID = '__ebsf_diagnostics_exporting_overlay__';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const STYLE_ID = `${PANEL_ID}-export-ui-v028-style`;
  let exporting = false;
  let lastFrozen = '';
  let observer = null;
  let pollTimer = 0;

  function panel() { return document.getElementById(PANEL_ID); }
  function overlay() { return document.getElementById(OVERLAY_ID); }

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function readStopped() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STOPPED_KEY) || 'null');
      return value?.sessionId ? value : null;
    } catch (_) {
      return null;
    }
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="status-v2"],
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="status"]{
        font-size:0!important;
      }
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="status-v2"]::after,
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="status"]::after{
        content:"Exporting…";
        font-size:13px!important;
        line-height:inherit!important;
      }
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="elapsed-v2"],
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="elapsed-core"],
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="elapsed"]{
        font-size:0!important;
      }
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="elapsed-v2"]::after,
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="elapsed-core"]::after,
      #${PANEL_ID}[data-ebsf-exporting="1"] [data-role="elapsed"]::after{
        content:attr(data-ebsf-export-frozen);
        font-size:13px!important;
        line-height:inherit!important;
      }
      #${PANEL_ID}[data-ebsf-exporting="1"] button,
      #${PANEL_ID}[data-ebsf-exporting="1"] input,
      #${PANEL_ID}[data-ebsf-exporting="1"] select,
      #${PANEL_ID}[data-ebsf-exporting="1"] textarea{
        opacity:.46!important;
        cursor:not-allowed!important;
        pointer-events:none!important;
        filter:saturate(.35)!important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function freezeElapsed(root) {
    const stopped = readStopped();
    let frozen = '';
    if (stopped?.startedAt && stopped?.stoppedAt) {
      frozen = formatDuration(Number(stopped.stoppedAt) - Number(stopped.startedAt));
    }
    if (!frozen) {
      frozen = root.querySelector('[data-role="elapsed-v2"], [data-role="elapsed-core"], [data-role="elapsed"]')?.textContent?.trim() || lastFrozen || '0:00';
    }
    lastFrozen = frozen;
    for (const node of root.querySelectorAll('[data-role="elapsed-v2"], [data-role="elapsed-core"], [data-role="elapsed"]')) {
      node.dataset.ebsfExportFrozen = frozen;
    }
  }

  function lockPanel(root) {
    if (!root) return;
    installStyle();
    root.dataset.ebsfExporting = '1';
    root.setAttribute('aria-busy', 'true');
    freezeElapsed(root);
    for (const node of root.querySelectorAll('button,input,select,textarea')) {
      node.setAttribute('aria-disabled', 'true');
    }
  }

  function unlockPanel(root) {
    if (!root) return;
    delete root.dataset.ebsfExporting;
    root.removeAttribute('aria-busy');
    for (const node of root.querySelectorAll('button,input,select,textarea')) {
      node.removeAttribute('aria-disabled');
    }
  }

  function exportOverlayVisible() {
    const root = overlay();
    return Boolean(root && !root.hidden);
  }

  function sync() {
    const root = panel();
    if (!root) return;
    const active = exportOverlayVisible();
    if (active) {
      if (!exporting) exporting = true;
      lockPanel(root);
      return;
    }
    if (!exporting) return;
    exporting = false;
    unlockPanel(root);

    // A failed/retryable export may leave the old controls closure believing it
    // is still recording. Reload once when stopped data remains so controls.js
    // reconstructs the correct frozen Stopped/Export ZIP state from storage.
    if (readStopped()?.sessionId) setTimeout(() => location.reload(), 180);
  }

  function installObserver() {
    if (observer) return;
    observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden']
    });
    pollTimer = setInterval(sync, 120);
    sync();
  }

  // Pointer-events cover mouse/touch. Capture keyboard/click activation too so
  // keyboard users cannot operate stale recorder controls while export owns it.
  document.addEventListener('click', (event) => {
    if (!exporting || event.isTrusted !== true) return;
    if (!event.target?.closest?.(`#${PANEL_ID} button, #${PANEL_ID} input, #${PANEL_ID} select, #${PANEL_ID} textarea`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!exporting || !['Enter', ' '].includes(event.key)) return;
    if (!event.target?.closest?.(`#${PANEL_ID} button, #${PANEL_ID} input, #${PANEL_ID} select, #${PANEL_ID} textarea`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  installObserver();
})();
