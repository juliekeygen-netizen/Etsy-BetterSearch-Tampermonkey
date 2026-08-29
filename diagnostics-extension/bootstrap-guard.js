'use strict';

// Runs before the heavy document-start recorder. The old reload-arm contract
// allowed content.js to start its page-wide DOM recorder before the background
// had proved that Chrome still had a live debugger session. A stale or repeatedly
// refreshed arm could therefore make merely enabling Diagnostics stall Etsy.
//
// v0.2.4 makes the background session the only authority. Any arm is consumed
// synchronously before content.js runs. content.js must then use get_state, whose
// session-health layer verifies chrome.debugger.getTargets(), before it can start
// the heavy recorder. The arm remains only as a control-layer reload hint within
// the document that created it; it is never permission to record a new document.
(() => {
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';

  function parse(value) {
    try { return JSON.parse(value || 'null'); }
    catch (_) { return null; }
  }

  const current = parse(sessionStorage.getItem(ARM_KEY));
  if (current?.sessionId) {
    globalThis.__EBSF_DIAG_CONSUMED_ARM__ = {
      sessionId: String(current.sessionId),
      startedAt: Number(current.startedAt || 0)
    };
  }

  // Critical safety invariant: content.js follows immediately after this file
  // and still contains a legacy readArmedSession() fast path. Removing the key
  // synchronously makes that path inert, so no MutationObserver can start until
  // the background has confirmed the debugger/session through get_state.
  try { sessionStorage.removeItem(ARM_KEY); } catch (_) {}
  globalThis.__EBSF_DIAG_BACKGROUND_CONFIRMATION_REQUIRED__ = true;
})();
