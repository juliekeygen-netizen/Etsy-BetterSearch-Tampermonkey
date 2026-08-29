'use strict';

// Diagnostics control-state extensions. This file loads after background.js and
// har-extra-info.js so it can wrap the existing message router without
// duplicating the core recorder implementation.
(() => {
  const coreHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';

  function lastSessionKey(tabId) {
    return `${LAST_SESSION_KEY_PREFIX}${tabId}`;
  }

  async function rememberSession(tabId, session) {
    if (!session?.sessionId) return;
    await chrome.storage.session.set({ [lastSessionKey(tabId)]: {
      sessionId: session.sessionId,
      tabId,
      startedAt: session.startedAt,
      startedIso: session.startedIso
    } });
  }

  async function forgetSession(tabId) {
    await chrome.storage.session.remove(lastSessionKey(tabId));
  }

  async function rememberedSession(tabId) {
    const value = await chrome.storage.session.get(lastSessionKey(tabId));
    return value[lastSessionKey(tabId)] || null;
  }

  async function deleteMarkerEvents(sessionId, markerId) {
    if (!sessionId || !markerId) return 0;
    const db = await openDb();
    return new Promise((resolve) => {
      let deleted = 0;
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const index = tx.objectStore(EVENTS_STORE).index('sessionId');
      const cursor = index.openCursor(IDBKeyRange.only(sessionId));
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (String(item.value?.data?.markerId || '') === markerId) {
          item.delete();
          deleted++;
        }
        item.continue();
      };
      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => resolve(deleted);
      tx.onabort = () => resolve(deleted);
    });
  }

  async function pauseRecording(tabId) {
    const active = await getActive(tabId);
    if (!active) return { ok: false, error: 'No diagnostic recording is active in this tab.' };
    if (active.paused) return { ok: true, session: active, alreadyPaused: true };
    if (!active.debuggerAttached) return { ok: false, error: 'The Chrome debugger is no longer attached.' };

    active.recording = false;
    active.paused = true;
    active.pausedAt = Date.now();
    active.pausedIso = new Date(active.pausedAt).toISOString();
    await addEvent(active.sessionId, 'recorder', 'pause-requested', { tabId, pausedAt: active.pausedAt });
    await setActive(tabId, active);
    await putSession(active);
    return { ok: true, session: active };
  }

  async function resumeRecording(tabId) {
    const active = await getActive(tabId);
    if (!active) return { ok: false, error: 'No paused diagnostic recording is available in this tab.' };
    if (!active.debuggerAttached) return { ok: false, error: 'The Chrome debugger detached while the recording was paused.' };

    active.paused = false;
    active.recording = true;
    active.resumedAt = Date.now();
    active.resumedIso = new Date(active.resumedAt).toISOString();
    await setActive(tabId, active);
    await putSession(active);
    await addEvent(active.sessionId, 'recorder', 'resume-requested', { tabId, resumedAt: active.resumedAt });
    return { ok: true, session: active };
  }

  async function exportStopped(message) {
    const id = String(message.sessionId || '');
    const session = await getSession(id);
    if (!session) return { ok: false, error: 'The stopped diagnostic session could not be found.' };
    const events = await readEvents(id);
    const har = buildHar(session, events);
    const summary = buildSummary(session, events, har);
    return { ok: true, session, summary, har, events };
  }

  async function cancelMarker(tabId, message) {
    const markerId = String(message.markerId || '');
    const active = await getActive(tabId);
    const session = active || await getSession(String(message.sessionId || ''));
    if (!session || !markerId) return { ok: false, error: 'Marker/session not found.' };
    const deleted = await deleteMarkerEvents(session.sessionId, markerId);
    return { ok: true, markerId, deleted };
  }

  // The core onDetach handler marks the DB session stopped and clears the active
  // tab key. Recover accidental detachments after that cleanup so captured data
  // remains exportable. Explicit Stop/Discard writes stoppedAt or deletes the
  // session before this delayed recovery runs, so those paths are left alone.
  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (!Number.isInteger(tabId)) return;
    setTimeout(() => {
      void (async () => {
        if (await getActive(tabId)) return;
        const remembered = await rememberedSession(tabId);
        if (!remembered?.sessionId) return;
        const persisted = await getSession(remembered.sessionId);
        if (!persisted || persisted.stoppedAt) return;

        const stoppedAt = Date.now();
        persisted.recording = false;
        persisted.paused = false;
        persisted.debuggerAttached = false;
        persisted.debuggerDetachReason = String(reason || persisted.debuggerDetachReason || 'unexpected-detach');
        persisted.stoppedAt = stoppedAt;
        persisted.stoppedIso = new Date(stoppedAt).toISOString();
        persisted.recoverableAfterDetach = true;
        await putSession(persisted);
        await setActive(tabId, persisted);
        await addEvent(persisted.sessionId, 'recorder', 'unexpected-detach-recovered', {
          tabId,
          reason: persisted.debuggerDetachReason,
          stoppedAt
        });
      })().catch(() => {});
    }, 250);
  });

  handleMessage = async function handleMessageWithRecorderControls(message, sender) {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) return coreHandleMessage(message, sender);

    switch (message?.action) {
      case 'pause_recording':
        return pauseRecording(tabId);
      case 'resume_recording':
        return resumeRecording(tabId);
      case 'export_stopped':
        return exportStopped(message);
      case 'cancel_marker':
        return cancelMarker(tabId, message);
      case 'start_recording': {
        const result = await coreHandleMessage(message, sender);
        if (result?.ok && result.session) await rememberSession(tabId, result.session);
        return result;
      }
      case 'finalize_export': {
        const result = await coreHandleMessage(message, sender);
        if (result?.ok) await forgetSession(tabId);
        return result;
      }
      case 'discard_recording': {
        const result = await coreHandleMessage(message, sender);
        if (result?.ok) await forgetSession(tabId);
        return result;
      }
      default:
        return coreHandleMessage(message, sender);
    }
  };
})();
