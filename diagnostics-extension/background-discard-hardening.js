'use strict';

// Final recorder-cleanup safety layer.
//
// chrome.debugger.onDetach listeners run independently of message handlers. A
// destructive Cancel therefore removes every recovery pointer before detaching,
// while successful Stop & Export waits longer than all detach-recovery timers
// before deleting the stopped capture. Both rules prevent a late detach listener
// from writing a session back after the UI has already reported it cleared.
(() => {
  const previousHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';
  const FINALIZE_DETACH_SETTLE_MS = 750;

  function lastSessionKey(tabId) {
    return `${LAST_SESSION_KEY_PREFIX}${tabId}`;
  }

  async function discardWithoutDetachRecovery(message, sender) {
    const tabId = sender.tab?.id;
    const id = String(message.sessionId || '');
    if (!Number.isInteger(tabId) || !id) {
      return { ok: false, error: 'Active diagnostics tab/session is missing.' };
    }

    const active = await getActive(tabId);
    if (active?.sessionId && active.sessionId !== id) {
      return { ok: false, error: 'The active diagnostic session changed before Cancel could finish.' };
    }

    // These two pointers are exactly what core/recovery detach listeners consult.
    // Remove them before chrome.debugger.detach() can emit onDetach.
    await clearActive(tabId);
    await chrome.storage.session.remove(lastSessionKey(tabId));
    if (active?.debuggerAttached !== false) await detach(tabId);

    // Use finalize_export intentionally: unlike the old discard handler, it takes
    // an explicit sessionId and therefore clears raw session data and legacy
    // export chunks even after the tab recovery pointers were removed. The
    // streaming wrapper around it clears the bounded export cache too.
    const result = await previousHandleMessage({ action: 'finalize_export', sessionId: id }, sender);
    if (!result?.ok) return result;

    let remaining = await getSession(id);
    if (remaining) {
      await deleteSessionData(id);
      remaining = await getSession(id);
    }
    if (remaining) {
      return { ok: false, error: 'Could not completely discard the cancelled diagnostic recording.' };
    }
    return { ok: true, sessionId: id };
  }

  async function finalizeAfterDetachSettles(message, sender) {
    // background-controls recovery waits 250 ms and the Chrome-banner recovery
    // layer waits 550 ms. 750 ms also covers the core listener's asynchronous DB
    // write, so a tiny recording cannot finish export and delete itself while a
    // prior onDetach callback still owns an old in-memory session object.
    await new Promise((resolve) => setTimeout(resolve, FINALIZE_DETACH_SETTLE_MS));
    return previousHandleMessage(message, sender);
  }

  handleMessage = async function handleMessageWithRecorderCleanupHardening(message, sender) {
    if (message?.action === 'discard_stream_recording') {
      return discardWithoutDetachRecovery(message, sender);
    }
    if (message?.action === 'finalize_stream_export') {
      return finalizeAfterDetachSettles(message, sender);
    }
    return previousHandleMessage(message, sender);
  };
})();
