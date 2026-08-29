'use strict';

// Chrome owns the visible "started debugging this browser" banner. Chrome's
// debugger API reports the banner Cancel action as detach reason
// "canceled_by_user". Treat that specific browser action as an explicit
// Stop+Export request while keeping normal target-close recovery separate.
(() => {
  const previousHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';
  const DETACH_SETTLE_MS = 550;
  const notifyTimers = new Map();

  function lastSessionKey(tabId) {
    return `${LAST_SESSION_KEY_PREFIX}${tabId}`;
  }

  async function canceledSession(tabId, reason) {
    if (String(reason || '') !== 'canceled_by_user') return null;

    const stored = await chrome.storage.session.get(lastSessionKey(tabId));
    const remembered = stored[lastSessionKey(tabId)] || null;
    if (!remembered?.sessionId) return null;

    const session = await getSession(remembered.sessionId);
    if (!session?.sessionId) return null;

    // An intentional in-panel Stop persists stoppedAt before calling detach().
    // Never reinterpret that normal detach as Chrome-banner Cancel.
    if (session.stoppedAt && !session.recoverableAfterDetach) return null;

    const stoppedAt = Number(session.stoppedAt || Date.now());
    session.recording = false;
    session.paused = false;
    session.debuggerAttached = false;
    session.debuggerDetachReason = 'canceled_by_user';
    session.stoppedAt = stoppedAt;
    session.stoppedIso = session.stoppedIso || new Date(stoppedAt).toISOString();
    session.recoverableAfterDetach = true;

    if (!session.autoExportPending) {
      session.autoExportPending = true;
      session.autoExportRequestedAt = Date.now();
      session.autoExportRequestedIso = new Date(session.autoExportRequestedAt).toISOString();
      session.autoExportReason = 'canceled_by_user';
    }

    await putSession(session);
    try { await chrome.storage.session.remove(activeKey(tabId)); } catch (_) {}
    try { runtimeByTab.delete(tabId); } catch (_) {}
    await addEvent(session.sessionId, 'recorder', 'debugger-banner-cancel-stop-export-requested', {
      tabId,
      reason: 'canceled_by_user',
      stoppedAt,
      requestedAt: session.autoExportRequestedAt
    });
    return session;
  }

  async function notifyCanceledSession(tabId, reason) {
    const session = await canceledSession(tabId, reason);
    if (!session) return;

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'ebsf-diagnostics-unexpected-detach',
        reason: 'canceled_by_user',
        bannerCancel: true,
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
      // If the document disappears during the detach, the stopped data remains
      // retained for manual Export ZIP. v0.2.4 deliberately does not auto-retry
      // heavyweight ZIP construction on every future Etsy navigation.
    }
  }

  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (!Number.isInteger(tabId) || String(reason || '') !== 'canceled_by_user') return;
    clearTimeout(notifyTimers.get(tabId));
    notifyTimers.set(tabId, setTimeout(() => {
      notifyTimers.delete(tabId);
      void notifyCanceledSession(tabId, reason).catch(() => {});
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
      await addEvent(session.sessionId, 'recorder', 'debugger-banner-cancel-auto-export-completed', {
        completedAt: session.autoExportCompletedAt
      });
      return { ok: true, sessionId: id };
    }
    return previousHandleMessage(message, sender);
  };
})();
