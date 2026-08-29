'use strict';

// Final destructive-Cancel safety layer.
//
// chrome.debugger.onDetach listeners run independently of the message handler.
// If a live session were deleted first and a detach-recovery listener finished
// afterward, that listener could persist the cancelled session again. For the
// explicit in-panel destructive Cancel only, remove every recovery pointer before
// detaching. The existing finalize path then clears both legacy and streaming
// export caches plus the raw IndexedDB capture.
(() => {
  const previousHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';

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

    // These two pointers are exactly what the core + recovery detach listeners
    // consult. Remove them before chrome.debugger.detach() can emit onDetach.
    await clearActive(tabId);
    await chrome.storage.session.remove(lastSessionKey(tabId));
    if (active?.debuggerAttached !== false) await detach(tabId);

    // Use finalize_export intentionally: unlike the old discard handler, it takes
    // an explicit sessionId and therefore still clears the raw session and legacy
    // export chunks after we have removed the tab recovery pointers above. The
    // streaming wrapper around it also clears the bounded export cache.
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

  handleMessage = async function handleMessageWithDiscardHardening(message, sender) {
    if (message?.action === 'discard_stream_recording') {
      return discardWithoutDetachRecovery(message, sender);
    }
    return previousHandleMessage(message, sender);
  };
})();
