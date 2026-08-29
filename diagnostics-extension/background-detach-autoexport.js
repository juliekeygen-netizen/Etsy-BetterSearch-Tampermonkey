'use strict';

// Chrome owns the visible "started debugging this browser" banner. If the user
// presses its Cancel button, chrome.debugger detaches before the page controls
// can perform a normal Stop. The v0.2.1 recovery layer already preserves that
// session; this final layer marks it for auto-export and notifies the page.
(() => {
  const previousHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';
  const DETACH_SETTLE_MS = 550;
  const notifyTimers = new Map();

  function lastSessionKey(tabId) {
    return `${LAST_SESSION_KEY_PREFIX}${tabId}`;
  }

  async function notifyRecoverableDetach(tabId, reason) {
    const stored = await chrome.storage.session.get(lastSessionKey(tabId));
    const remembered = stored[lastSessionKey(tabId)] || null;
    if (!remembered?.sessionId) return;

    const session = await getSession(remembered.sessionId);
    // Intentional Stop detaches only after stoppedAt is already persisted and
    // never sets recoverableAfterDetach. Only unexpected Chrome/debugger detach
    // reaches this path.
    if (!session?.stoppedAt || !session.recoverableAfterDetach) return;

    if (!session.autoExportPending) {
      session.autoExportPending = true;
      session.autoExportRequestedAt = Date.now();
      session.autoExportRequestedIso = new Date(session.autoExportRequestedAt).toISOString();
      session.autoExportReason = String(reason || session.debuggerDetachReason || 'unexpected-detach');
      await putSession(session);
      await addEvent(session.sessionId, 'recorder', 'unexpected-detach-auto-export-requested', {
        tabId,
        reason: session.autoExportReason,
        requestedAt: session.autoExportRequestedAt
      });
    }

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'ebsf-diagnostics-unexpected-detach',
        reason: session.autoExportReason,
        session: {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          startedIso: session.startedIso,
          stoppedAt: session.stoppedAt,
          stoppedIso: session.stoppedIso,
          autoExportPending: true
        }
      });
    } catch (_) {
      // Navigations can temporarily remove the content script. The pending flag
      // stays persisted so the next document can auto-export it on startup.
    }
  }

  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (!Number.isInteger(tabId)) return;
    clearTimeout(notifyTimers.get(tabId));
    notifyTimers.set(tabId, setTimeout(() => {
      notifyTimers.delete(tabId);
      void notifyRecoverableDetach(tabId, reason).catch(() => {});
    }, DETACH_SETTLE_MS));
  });

  handleMessage = async function handleMessageWithDetachAutoExport(message, sender) {
    if (message?.action === 'clear_auto_export') {
      const id = String(message.sessionId || '');
      const session = id ? await getSession(id) : null;
      if (!session) return { ok: false, error: 'Stopped diagnostic session was not found.' };
      session.autoExportPending = false;
      session.autoExportCompletedAt = Date.now();
      session.autoExportCompletedIso = new Date(session.autoExportCompletedAt).toISOString();
      await putSession(session);
      await addEvent(session.sessionId, 'recorder', 'unexpected-detach-auto-export-completed', {
        completedAt: session.autoExportCompletedAt
      });
      return { ok: true, sessionId: id };
    }
    return previousHandleMessage(message, sender);
  };
})();
