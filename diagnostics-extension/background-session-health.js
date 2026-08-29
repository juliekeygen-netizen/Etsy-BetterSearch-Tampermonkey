'use strict';

// Final background safety valve: never tell content.js to resume a heavy DOM
// recorder unless Chrome still reports the debugger attached to that tab.
(() => {
  const previousHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';

  function lastSessionKey(tabId) {
    return `${LAST_SESSION_KEY_PREFIX}${tabId}`;
  }

  async function targetAttached(tabId) {
    try {
      const targets = await chrome.debugger.getTargets();
      return targets.some((target) => target.tabId === tabId && target.attached);
    } catch (_) {
      return null;
    }
  }

  async function recoverStopped(tabId, session, reason) {
    if (!session?.sessionId) return null;
    const stoppedAt = Number(session.stoppedAt || Date.now());
    session.recording = false;
    session.paused = false;
    session.debuggerAttached = false;
    session.debuggerDetachReason = String(reason || session.debuggerDetachReason || 'stale-session');
    session.stoppedAt = stoppedAt;
    session.stoppedIso = session.stoppedIso || new Date(stoppedAt).toISOString();
    session.recoverableAfterDetach = true;
    await putSession(session);
    await chrome.storage.session.set({
      [lastSessionKey(tabId)]: {
        sessionId: session.sessionId,
        tabId,
        startedAt: session.startedAt,
        startedIso: session.startedIso
      }
    });
    try { await chrome.storage.session.remove(activeKey(tabId)); } catch (_) {}
    try { runtimeByTab.delete(tabId); } catch (_) {}
    await addEvent(session.sessionId, 'recorder', 'stale-session-health-recovered', {
      tabId,
      reason: session.debuggerDetachReason,
      stoppedAt
    });
    return session;
  }

  handleMessage = async function handleMessageWithSessionHealth(message, sender) {
    const tabId = sender.tab?.id;
    if (message?.action !== 'get_state' || !Number.isInteger(tabId)) {
      return previousHandleMessage(message, sender);
    }

    const active = await getActive(tabId);
    if (!active || (!active.recording && !active.paused)) {
      return previousHandleMessage(message, sender);
    }

    const attached = await targetAttached(tabId);
    if (attached === false || active.debuggerAttached === false) {
      const stopped = await recoverStopped(tabId, active, 'stale-active-session-without-debugger');
      return { ok: true, session: null, stopped };
    }

    return previousHandleMessage(message, sender);
  };
})();
