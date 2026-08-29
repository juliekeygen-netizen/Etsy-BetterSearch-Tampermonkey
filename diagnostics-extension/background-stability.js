'use strict';

// Loads after background-controls.js. It hardens stale-session recovery and
// bridges Chrome's own debugger Cancel action back into the in-page recorder UI.
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
      // If Chrome cannot answer, do not destructively downgrade a valid session.
      return null;
    }
  }

  async function rememberStopped(tabId, session) {
    if (!session?.sessionId) return;
    await chrome.storage.session.set({
      [lastSessionKey(tabId)]: {
        sessionId: session.sessionId,
        tabId,
        startedAt: session.startedAt,
        startedIso: session.startedIso
      }
    });
  }

  async function recoverAsStopped(tabId, session, reason) {
    if (!session?.sessionId) return null;
    const stoppedAt = Number(session.stoppedAt || Date.now());
    session.recording = false;
    session.paused = false;
    session.debuggerAttached = false;
    session.debuggerDetachReason = String(reason || session.debuggerDetachReason || 'debugger-not-attached');
    session.stoppedAt = stoppedAt;
    session.stoppedIso = session.stoppedIso || new Date(stoppedAt).toISOString();
    session.recoverableAfterDetach = true;
    await putSession(session);
    await rememberStopped(tabId, session);
    try { await chrome.storage.session.remove(activeKey(tabId)); } catch (_) {}
    try { runtimeByTab.delete(tabId); } catch (_) {}
    await addEvent(session.sessionId, 'recorder', 'stale-or-detached-session-recovered', {
      tabId,
      reason: session.debuggerDetachReason,
      stoppedAt
    });
    return session;
  }

  async function healthyState(tabId) {
    const active = await getActive(tabId);
    if (!active) return { active: null, stopped: null };
    if (!active.recording && !active.paused) return { active: null, stopped: active.stoppedAt ? active : null };

    const attached = await targetAttached(tabId);
    if (attached === false || active.debuggerAttached === false) {
      const stopped = await recoverAsStopped(tabId, active, 'stale-active-session-without-debugger');
      return { active: null, stopped };
    }
    return { active, stopped: null };
  }

  // Verify the debugger relationship before content.js is told to resume a
  // heavy DOM recorder. This is the safety valve that keeps an old session from
  // freezing Etsy after an extension reload/crash.
  handleMessage = async function handleMessageWithDiagnosticsStability(message, sender) {
    const tabId = sender.tab?.id;
    if (message?.action === 'get_state' && Number.isInteger(tabId)) {
      const health = await healthyState(tabId);
      if (health.active) return { ok: true, session: health.active, stopped: null };
      if (health.stopped) return { ok: true, session: null, stopped: health.stopped };
      return previousHandleMessage(message, sender);
    }
    return previousHandleMessage(message, sender);
  };

  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (!Number.isInteger(tabId)) return;

    // background.js/background-controls.js also receive onDetach. Give them a
    // moment to persist their normal state first, then guarantee recovery and
    // notify the content UI. Chrome documents `canceled_by_user` for the user
    // pressing the debugger infobar's Cancel control.
    setTimeout(() => {
      void (async () => {
        const key = lastSessionKey(tabId);
        const remembered = (await chrome.storage.session.get(key))[key] || null;
        const active = await getActive(tabId);
        let session = active || (remembered?.sessionId ? await getSession(remembered.sessionId) : null);
        if (!session) return;
        if (!session.stoppedAt) session = await recoverAsStopped(tabId, session, reason);
        if (!session) return;

        if (String(reason) === 'canceled_by_user') {
          await addEvent(session.sessionId, 'recorder', 'debugger-cancel-auto-export-requested', {
            tabId,
            reason: 'canceled_by_user'
          });
          try {
            await chrome.tabs.sendMessage(tabId, {
              action: 'ebsf_diag_debugger_cancelled',
              session: {
                sessionId: session.sessionId,
                startedAt: session.startedAt,
                startedIso: session.startedIso,
                stoppedAt: session.stoppedAt,
                stoppedIso: session.stoppedIso,
                debuggerDetachReason: session.debuggerDetachReason || 'canceled_by_user'
              }
            });
          } catch (_) {
            // The tab may be navigating. The stopped session remains persisted
            // and exportable on the next Etsy document instead of being lost.
          }
        }
      })().catch(() => {});
    }, 450);
  });
})();
