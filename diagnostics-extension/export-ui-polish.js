'use strict';

// v0.2.9 visible export-state ownership hardening.
//
// The resumable-export guard is the authoritative signal that a protected ZIP
// export owns the page. The older recorder controls keep their own in-memory
// recording state, so stopping from the guard can otherwise leave the panel
// looking live while the backend is already stopped. Mirror the guard overlay
// into a hard visual/interaction state without changing capture semantics.
//
// This layer must also be diagnostically quiet: observe only the export overlay,
// compare before writing, and remove only accessibility state that this layer
// itself introduced. Diagnostics must not create another page-wide mutation loop.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const OVERLAY_ID = '__ebsf_diagnostics_exporting_overlay__';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const STYLE_ID = `${PANEL_ID}-export-ui-v028-style`;
  const OWNED_ARIA_DISABLED = 'data-ebsf-export-aria-disabled-owned';
  const OWNED_ARIA_BUSY = 'data-ebsf-export-aria-busy-owned';
  let exporting = false;
  let lastFrozen = '';
  let rootObserver = null;
  let overlayObserver = null;

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
      if (node.dataset.ebsfExportFrozen !== frozen) node.dataset.ebsfExportFrozen = frozen;
    }
  }

  function lockPanel(root) {
    if (!root) return;
    installStyle();
    if (root.dataset.ebsfExporting !== '1') root.dataset.ebsfExporting = '1';
    if (root.getAttribute('aria-busy') !== 'true') {
      root.setAttribute('aria-busy', 'true');
      root.setAttribute(OWNED_ARIA_BUSY, '1');
    }
    freezeElapsed(root);
    for (const node of root.querySelectorAll('button,input,select,textarea')) {
      if (node.getAttribute('aria-disabled') === 'true') continue;
      node.setAttribute('aria-disabled', 'true');
      node.setAttribute(OWNED_ARIA_DISABLED, '1');
    }
  }

  function unlockPanel(root) {
    if (!root) return;
    if (root.dataset.ebsfExporting === '1') delete root.dataset.ebsfExporting;
    if (root.getAttribute(OWNED_ARIA_BUSY) === '1') {
      root.removeAttribute('aria-busy');
      root.removeAttribute(OWNED_ARIA_BUSY);
    }
    for (const node of root.querySelectorAll(`[${OWNED_ARIA_DISABLED}="1"]`)) {
      node.removeAttribute('aria-disabled');
      node.removeAttribute(OWNED_ARIA_DISABLED);
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

  function bindOverlayObserver() {
    const root = overlay();
    if (!root) return false;
    rootObserver?.disconnect();
    rootObserver = null;
    overlayObserver?.disconnect();
    overlayObserver = new MutationObserver(sync);
    overlayObserver.observe(root, { attributes:true, attributeFilter:['hidden'] });
    sync();
    return true;
  }

  function installObserver() {
    if (bindOverlayObserver()) return;

    // export-resume-guard appends the overlay directly to documentElement. Watch
    // only that direct child list until the overlay exists, then disconnect and
    // observe the overlay's single authoritative `hidden` state attribute.
    rootObserver = new MutationObserver(() => {
      if (overlay()) bindOverlayObserver();
    });
    rootObserver.observe(document.documentElement, { childList:true });
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
