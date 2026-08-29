'use strict';

// v0.2.6 export backend. The older exporter chunked only *after* constructing
// one enormous JSON string containing the HAR, every event, response bodies and
// marker snapshots. V8 can reject that with "Invalid string length" before the
// first chunk is ever written. This layer prepares the final ZIP files as
// independently bounded text/base64 chunks instead, so no whole-recording string
// is ever required.
(() => {
  const previousHandleMessage = handleMessage;
  const STREAM_DB_NAME = 'etsy-bettersearch-diagnostics-stream-export-v1';
  const STREAM_DB_VERSION = 1;
  const STREAM_STORE = 'chunks';
  const CHUNK_CHARS = 256 * 1024; // divisible by four for base64 chunk decoding
  let streamDbPromise = null;

  function safeFilePart(value) {
    return String(value || 'item')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'item';
  }

  function chunkKey(sessionId, path, index) {
    return `${sessionId}\u0000${path}\u0000${index}`;
  }

  async function openStreamDb() {
    if (streamDbPromise) return streamDbPromise;
    streamDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(STREAM_DB_NAME, STREAM_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STREAM_STORE)) {
          db.createObjectStore(STREAM_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open streaming export cache.'));
    }).catch((error) => {
      streamDbPromise = null;
      throw error;
    });
    return streamDbPromise;
  }

  async function clearPreparedSession(sessionId) {
    if (!sessionId) return;
    const db = await openStreamDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STREAM_STORE, 'readwrite');
      const cursor = tx.objectStore(STREAM_STORE).openCursor();
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

  function* boundedPieces(pieces) {
    let buffer = '';
    for (const raw of pieces) {
      let piece = String(raw ?? '');
      while (piece.length) {
        const room = CHUNK_CHARS - buffer.length;
        if (piece.length <= room) {
          buffer += piece;
          piece = '';
        } else {
          buffer += piece.slice(0, room);
          piece = piece.slice(room);
          yield buffer;
          buffer = '';
        }
      }
    }
    if (buffer.length) yield buffer;
  }

  async function persistFile(sessionId, path, encoding, pieces) {
    const db = await openStreamDb();
    let chunkCount = 0;
    let charCount = 0;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STREAM_STORE, 'readwrite');
      const store = tx.objectStore(STREAM_STORE);
      try {
        for (const text of boundedPieces(pieces)) {
          const index = chunkCount++;
          charCount += text.length;
          store.put({
            key: chunkKey(sessionId, path, index),
            sessionId,
            path,
            index,
            encoding,
            text
          });
        }
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Could not persist ${path}.`));
      tx.onabort = () => reject(tx.error || new Error(`Streaming export transaction aborted for ${path}.`));
    });
    return { path, encoding, chunkCount, charCount };
  }

  async function readPreparedChunk(sessionId, path, index) {
    const db = await openStreamDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STREAM_STORE, 'readonly');
      const request = tx.objectStore(STREAM_STORE).get(chunkKey(sessionId, path, index));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  function* ndjsonPieces(events, stream, transform = null) {
    for (const event of events) {
      if (event.stream !== stream) continue;
      const value = transform ? transform(event) : event;
      yield `${JSON.stringify(value)}\n`;
    }
  }

  function* jsonArrayPieces(values) {
    yield '[';
    let first = true;
    for (const value of values) {
      if (!first) yield ',';
      first = false;
      yield JSON.stringify(value);
    }
    yield ']\n';
  }

  function* harPieces(har) {
    const log = har?.log || { version: '1.2', creator: {}, pages: [], entries: [] };
    const entries = Array.isArray(log.entries) ? log.entries : [];
    const { entries: _entries, ...head } = log;
    const headJson = JSON.stringify(head);
    yield `{"log":${headJson.slice(0, -1)},"entries":[`;
    for (let index = 0; index < entries.length; index++) {
      if (index) yield ',';
      yield JSON.stringify(entries[index]);
    }
    yield ']}}\n';
  }

  async function prepareStreamingExport(message) {
    const id = String(message.sessionId || '');
    const session = await getSession(id);
    if (!session) return { ok: false, error: 'The stopped diagnostic session could not be found.' };
    if (!session.stoppedAt) return { ok: false, error: 'Stop the recording before exporting it.' };

    await clearPreparedSession(id);

    // Objects are kept as objects; importantly, they are never wrapped in one
    // JSON.stringify({ har, events, ... }) call.
    const events = await readEvents(id);
    const har = buildHar(session, events);
    const summary = buildSummary(session, events, har);
    const files = [];
    const add = async (path, encoding, pieces) => {
      files.push(await persistFile(id, path, encoding, pieces));
    };

    const fileMap = {
      har: 'network/network.har',
      cdp: 'network/cdp-events.ndjson',
      mutations: 'dom/mutations.ndjson',
      importantStates: 'dom/important-elements.ndjson',
      markers: 'markers/markers.json'
    };
    const manifest = {
      format: 'etsy-bettersearch-diagnostics',
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      session,
      files: fileMap,
      exporter: { mode: 'bounded-file-stream', chunkChars: CHUNK_CHARS }
    };

    await add('manifest.json', 'utf8', [`${JSON.stringify(manifest, null, 2)}\n`]);
    await add('summary.json', 'utf8', [`${JSON.stringify(summary, null, 2)}\n`]);
    await add('network/network.har', 'utf8', harPieces(har));
    await add('network/cdp-events.ndjson', 'utf8', ndjsonPieces(events, 'cdp'));
    await add('network/body-events.ndjson', 'utf8', ndjsonPieces(events, 'network-body', (event) => ({
      ...event,
      data: event.type === 'response-body'
        ? { ...event.data, body: undefined, bodyStoredSeparately: true }
        : event.data
    })));
    await add('timeline/lifecycle.ndjson', 'utf8', ndjsonPieces(events, 'lifecycle'));
    await add('timeline/interactions.ndjson', 'utf8', ndjsonPieces(events, 'interaction'));
    await add('timeline/errors.ndjson', 'utf8', ndjsonPieces(events, 'error'));
    await add('timeline/performance.ndjson', 'utf8', ndjsonPieces(events, 'performance'));
    await add('timeline/recorder.ndjson', 'utf8', ndjsonPieces(events, 'recorder'));
    await add('dom/mutations.ndjson', 'utf8', ndjsonPieces(events, 'dom-mutation'));
    await add('dom/important-elements.ndjson', 'utf8', ndjsonPieces(events, 'important-state'));
    await add('markers/markers.json', 'utf8', jsonArrayPieces(events.filter((event) => event.stream === 'marker' || event.stream === 'marker-local')));

    const usedPaths = new Set(files.map((file) => file.path));
    for (const event of events) {
      if (event.stream === 'network-body' && event.type === 'response-body' && event.data?.body) {
        const requestId = safeFilePart(event.data.requestId);
        const path = `network/response-bodies/${requestId}.${event.data.base64Encoded ? 'base64.txt' : 'txt'}`;
        if (!usedPaths.has(path)) {
          usedPaths.add(path);
          await add(path, 'utf8', [event.data.base64Encoded ? `${event.data.body}\n` : event.data.body]);
        }
      }
      if (event.stream === 'marker-screenshot' && event.type === 'screenshot' && event.data?.data) {
        const path = `markers/${safeFilePart(event.data.markerId)}/screenshot.png`;
        if (!usedPaths.has(path)) {
          usedPaths.add(path);
          // CHUNK_CHARS is divisible by four, so every non-final base64 chunk can
          // be decoded independently by the page without concatenating it first.
          await add(path, 'base64', [event.data.data]);
        }
      }
      if (event.stream === 'marker-dom' && event.type === 'dom-snapshot' && event.data?.snapshot) {
        const path = `markers/${safeFilePart(event.data.markerId)}/dom-snapshot.json`;
        if (!usedPaths.has(path)) {
          usedPaths.add(path);
          await add(path, 'utf8', [`${JSON.stringify(event.data.snapshot, null, 2)}\n`]);
        }
      }
    }

    return {
      ok: true,
      sessionId: id,
      startedIso: session.startedIso || '',
      fileCount: files.length,
      files,
      summary
    };
  }

  async function streamingChunk(message) {
    const id = String(message.sessionId || '');
    const path = String(message.path || '');
    const index = Math.max(0, Number(message.index) || 0);
    const record = await readPreparedChunk(id, path, index);
    if (!record) return { ok: false, error: `Prepared export chunk was not found: ${path} #${index}.` };
    return {
      ok: true,
      sessionId: id,
      path,
      index,
      encoding: record.encoding || 'utf8',
      text: record.text || ''
    };
  }

  handleMessage = async function handleMessageWithStreamingExport(message, sender) {
    switch (message?.action) {
      case 'prepare_stream_export':
        return prepareStreamingExport(message);
      case 'stream_export_chunk':
        return streamingChunk(message);
      case 'clear_stream_export_cache': {
        await clearPreparedSession(String(message.sessionId || ''));
        return { ok: true };
      }
      case 'finalize_export':
      case 'discard_recording': {
        const id = String(message.sessionId || '');
        const result = await previousHandleMessage(message, sender);
        if (id) await clearPreparedSession(id);
        return result;
      }
      default:
        return previousHandleMessage(message, sender);
    }
  };
})();
