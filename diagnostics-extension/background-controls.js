'use strict';

// Recorder control-state and resilient export layer. This file loads after the
// core background recorder so it can extend the message router without
// duplicating the CDP/network implementation.
(() => {
  const coreHandleMessage = handleMessage;
  const LAST_SESSION_KEY_PREFIX = 'ebsf-diagnostics:last-session:';
  const EXPORT_DB_NAME = 'etsy-bettersearch-diagnostics-export-v1';
  const EXPORT_DB_VERSION = 1;
  const EXPORT_STORE = 'chunks';
  const EXPORT_CHUNK_CHARS = 256 * 1024;
  let exportDbPromise = null;

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

  async function openExportDb() {
    if (exportDbPromise) return exportDbPromise;
    exportDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(EXPORT_DB_NAME, EXPORT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(EXPORT_STORE)) {
          db.createObjectStore(EXPORT_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open diagnostics export cache.'));
    }).catch((error) => {
      exportDbPromise = null;
      throw error;
    });
    return exportDbPromise;
  }

  async function clearExportChunks(sessionId) {
    if (!sessionId) return;
    const db = await openExportDb();
    await new Promise((resolve) => {
      const tx = db.transaction(EXPORT_STORE, 'readwrite');
      const store = tx.objectStore(EXPORT_STORE);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (String(item.value?.sessionId || '') === sessionId) item.delete();
        item.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  async function persistExportChunks(sessionId, json) {
    await clearExportChunks(sessionId);
    const db = await openExportDb();
    const chunks = [];
    for (let start = 0; start < json.length; start += EXPORT_CHUNK_CHARS) {
      chunks.push(json.slice(start, start + EXPORT_CHUNK_CHARS));
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(EXPORT_STORE, 'readwrite');
      const store = tx.objectStore(EXPORT_STORE);
      chunks.forEach((text, index) => store.put({
        key: `${sessionId}:${index}`,
        sessionId,
        index,
        text
      }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not persist diagnostics export chunks.'));
      tx.onabort = () => reject(tx.error || new Error('Diagnostics export chunk transaction aborted.'));
    });
    return chunks.length;
  }

  async function readExportChunk(sessionId, index) {
    const db = await openExportDb();
    return new Promise((resolve) => {
      const tx = db.transaction(EXPORT_STORE, 'readonly');
      const request = tx.objectStore(EXPORT_STORE).get(`${sessionId}:${index}`);
      request.onsuccess = () => resolve(request.result?.text ?? null);
      request.onerror = () => resolve(null);
    });
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

  async function stopRecordingCompact(tabId) {
    const active = await getActive(tabId);
    if (!active) {
      const remembered = await rememberedSession(tabId);
      const persisted = remembered?.sessionId ? await getSession(remembered.sessionId) : null;
      if (persisted?.stoppedAt) return { ok: true, session: persisted, alreadyStopped: true };
      return { ok: false, error: 'No diagnostic recording is active in this tab.' };
    }

    const stoppedAt = Date.now();
    active.recording = false;
    active.paused = false;
    active.stoppedAt = stoppedAt;
    active.stoppedIso = new Date(stoppedAt).toISOString();
    active.debuggerAttached = false;
    active.debuggerDetachReason = active.debuggerDetachReason || 'stopped-by-user';

    // Persist stopped state before detaching so Chrome's onDetach callback cannot
    // turn an intentional stop into an unrecoverable session race.
    await addEvent(active.sessionId, 'recorder', 'stop-requested', { tabId, stoppedAt });
    await setActive(tabId, active);
    await putSession(active);
    await rememberSession(tabId, active);
    await detach(tabId);
    await putSession(active);
    await chrome.storage.session.remove(activeKey(tabId));
    runtimeByTab.delete(tabId);
    return { ok: true, session: active };
  }

  async function prepareExport(message) {
    const id = String(message.sessionId || '');
    const session = await getSession(id);
    if (!session) return { ok: false, error: 'The stopped diagnostic session could not be found.' };
    if (!session.stoppedAt) return { ok: false, error: 'Stop the recording before exporting it.' };

    const events = await readEvents(id);
    const har = buildHar(session, events);
    const summary = buildSummary(session, events, har);
    const payload = JSON.stringify({ ok: true, session, summary, har, events });
    const chunkCount = await persistExportChunks(id, payload);
    return {
      ok: true,
      sessionId: id,
      chunkCount,
      totalChars: payload.length,
      summary
    };
  }

  async function exportChunk(message) {
    const id = String(message.sessionId || '');
    const index = Math.max(0, Number(message.index) || 0);
    const text = await readExportChunk(id, index);
    if (text == null) return { ok: false, error: `Export chunk ${index} was not found.` };
    return { ok: true, sessionId: id, index, text };
  }

  async function cancelMarker(tabId, message) {
    const markerId = String(message.markerId || '');
    const active = await getActive(tabId);
    const session = active || await getSession(String(message.sessionId || ''));
    if (!session || !markerId) return { ok: false, error: 'Marker/session not found.' };
    const deleted = await deleteMarkerEvents(session.sessionId, markerId);
    return { ok: true, markerId, deleted };
  }

  async function stoppedSessionForTab(tabId) {
    const remembered = await rememberedSession(tabId);
    if (!remembered?.sessionId) return null;
    const persisted = await getSession(remembered.sessionId);
    return persisted?.stoppedAt ? persisted : null;
  }

  // The core onDetach handler clears the active tab key. Keep a pointer to the
  // persisted session so an unexpected detach remains exportable after refresh.
  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (!Number.isInteger(tabId)) return;
    setTimeout(() => {
      void (async () => {
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
      case 'get_state': {
        const active = await getActive(tabId);
        const stopped = active ? null : await stoppedSessionForTab(tabId);
        return { ok: true, session: active, stopped };
      }
      case 'pause_recording':
        return pauseRecording(tabId);
      case 'resume_recording':
        return resumeRecording(tabId);
      case 'stop_recording':
        return stopRecordingCompact(tabId);
      case 'prepare_export':
        return prepareExport(message);
      case 'export_chunk':
        return exportChunk(message);
      case 'cancel_marker':
        return cancelMarker(tabId, message);
      case 'start_recording': {
        const stopped = await stoppedSessionForTab(tabId);
        if (stopped) return { ok: false, error: 'A stopped recording is waiting to be exported or discarded first.', stopped };
        const result = await coreHandleMessage(message, sender);
        if (result?.ok && result.session) await rememberSession(tabId, result.session);
        return result;
      }
      case 'finalize_export': {
        const id = String(message.sessionId || '');
        const result = await coreHandleMessage(message, sender);
        await clearExportChunks(id);
        if (result?.ok) await forgetSession(tabId);
        return result;
      }
      case 'discard_recording': {
        const remembered = await rememberedSession(tabId);
        const active = await getActive(tabId);
        const id = active?.sessionId || remembered?.sessionId || '';
        if (active) await detach(tabId);
        if (id) {
          await clearActive(tabId);
          await deleteSessionData(id);
          await clearExportChunks(id);
        }
        await forgetSession(tabId);
        return { ok: true };
      }
      default:
        return coreHandleMessage(message, sender);
    }
  };
})();
