'use strict';

// Runs before the heavy document-start recorder. A stale ARM_KEY used to make
// content.js resurrect an old MutationObserver on every Etsy navigation even
// after the Chrome debugger/session had already died. That could make Etsy look
// like it never finished loading merely because Diagnostics was enabled.
(() => {
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const MAX_ARM_AGE_MS = 45 * 1000;
  const nativeSetItem = Storage.prototype.setItem;

  function parse(value) {
    try { return JSON.parse(value || 'null'); }
    catch (_) { return null; }
  }

  function validArm(value) {
    if (!value?.sessionId) return false;
    const armedAt = Number(value.armedAt || 0);
    return armedAt > 0 && Date.now() - armedAt >= 0 && Date.now() - armedAt <= MAX_ARM_AGE_MS;
  }

  // controls.js and the legacy content recorder both write the same arm key.
  // Add a freshness timestamp at the storage boundary so every future write is
  // safe without having to duplicate recorder state logic in multiple files.
  Storage.prototype.setItem = function diagnosticsSafeSetItem(key, value) {
    if (this === sessionStorage && String(key) === ARM_KEY) {
      const parsed = parse(value);
      if (parsed?.sessionId) {
        value = JSON.stringify({ ...parsed, armedAt: Date.now(), armVersion: 2 });
      }
    }
    return nativeSetItem.call(this, key, value);
  };

  const current = parse(sessionStorage.getItem(ARM_KEY));
  if (!validArm(current)) {
    try { sessionStorage.removeItem(ARM_KEY); } catch (_) {}
    return;
  }

  // Let the immediately-following content.js consume a valid reload arm, then
  // remove it. A confirmed live background session will re-arm later if needed.
  // This makes the document-start arm one-shot instead of a permanent trap.
  globalThis.__EBSF_DIAG_FRESH_ARM__ = {
    sessionId: current.sessionId,
    armedAt: current.armedAt
  };
  setTimeout(() => {
    try {
      const latest = parse(sessionStorage.getItem(ARM_KEY));
      if (latest?.sessionId === current.sessionId && Number(latest?.armedAt || 0) === Number(current.armedAt || 0)) {
        sessionStorage.removeItem(ARM_KEY);
      }
    } catch (_) {}
  }, 0);
})();
