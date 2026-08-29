'use strict';

// Small UI/runtime safety layer loaded after controls.js. It intentionally uses
// only DOM/storage/message boundaries so the recorder core stays independently
// testable and the hotfix can be removed once folded into a later cleanup.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const STYLE_ID = `${PANEL_ID}-stability-style`;
  let cancelExportInFlight = false;

  function panel() {
    return document.getElementById(PANEL_ID);
  }

  function writeStopped(session) {
    if (!session?.sessionId) return;
    try {
      sessionStorage.setItem(STOPPED_KEY, JSON.stringify({
        sessionId: session.sessionId,
        startedAt: Number(session.startedAt || 0),
        startedIso: session.startedIso || '',
        stoppedAt: Number(session.stoppedAt || Date.now()),
        stoppedIso: session.stoppedIso || new Date().toISOString()
      }));
      sessionStorage.removeItem(ARM_KEY);
    } catch (_) {}
  }

  function forceOpenWhileActive(target = panel()) {
    if (!target || target.dataset.recording !== '1') return;
    if (target.dataset.collapsed !== '0') target.dataset.collapsed = '0';
    const collapse = target.querySelector('[data-role="collapse"]');
    if (collapse) {
      collapse.textContent = '—';
      collapse.setAttribute('aria-label', 'Collapse');
    }
  }

  function appendActivity(message) {
    const pre = panel()?.querySelector('[data-role="activity"]');
    if (!pre) return;
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    pre.textContent = `${pre.textContent ? `${pre.textContent.trimEnd()}\n` : ''}${line}`.split('\n').slice(-80).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Keep the existing + button's right/bottom position, but make the
         collapsed shell exactly match its 42x42 footprint so the + is centered. */
      #${PANEL_ID}[data-collapsed="1"]{width:42px!important;min-width:42px!important;max-width:42px!important;height:42px!important;min-height:42px!important;max-height:42px!important;padding:0!important;overflow:hidden!important;border-radius:10px!important}
      #${PANEL_ID}[data-collapsed="1"] header{width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;padding:0!important;margin:0!important;display:block!important;position:relative!important}
      #${PANEL_ID}[data-collapsed="1"] header>span{display:none!important}
      #${PANEL_ID}[data-collapsed="1"] header>button{position:absolute!important;inset:0!important;width:42px!important;height:42px!important;margin:0!important;padding:0!important;display:grid!important;place-items:center!important}
      #${PANEL_ID}[data-collapsed="1"] .ebd-body{display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  async function triggerCancelExport(session) {
    if (cancelExportInFlight || !session?.sessionId) return;
    cancelExportInFlight = true;
    writeStopped(session);

    const tryExport = (attempt = 0) => {
      const host = panel();
      if (host) {
        host.dataset.collapsed = '0';
        const collapse = host.querySelector('[data-role="collapse"]');
        if (collapse) {
          collapse.textContent = '—';
          collapse.setAttribute('aria-label', 'Collapse');
        }
        const stop = host.querySelector('[data-role="stop"]');
        if (stop && !stop.disabled) {
          appendActivity('Chrome debugger Cancel pressed. Recording stopped; exporting the recovered session automatically.');
          stop.click();
          setTimeout(() => { cancelExportInFlight = false; }, 1500);
          return;
        }
      }
      if (attempt < 16) {
        setTimeout(() => tryExport(attempt + 1), 150);
      } else {
        appendActivity('Chrome debugger Cancel stopped the recording, but automatic export could not start. The captured session is retained and can be exported after refresh.');
        cancelExportInFlight = false;
      }
    };

    // background-controls needs a fraction of a second to expose the recovered
    // stopped session to its UI state machine after Chrome terminates CDP.
    setTimeout(() => tryExport(0), 180);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action !== 'ebsf_diag_debugger_cancelled') return;
    void triggerCancelExport(message.session || null);
  });

  // Block collapsing while the recorder is active. We listen on document in the
  // capture phase so this runs before controls.js's panel-level capture handler.
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest(`#${PANEL_ID} [data-role="collapse"]`) : null;
    if (!button) return;
    const host = panel();
    if (host?.dataset.recording !== '1') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    forceOpenWhileActive(host);
  }, true);

  function watchPanel() {
    const host = panel();
    if (!host) {
      requestAnimationFrame(watchPanel);
      return;
    }
    injectStyles();
    forceOpenWhileActive(host);
    new MutationObserver(() => forceOpenWhileActive(host)).observe(host, {
      attributes: true,
      attributeFilter: ['data-recording', 'data-collapsed']
    });
  }

  watchPanel();
})();
