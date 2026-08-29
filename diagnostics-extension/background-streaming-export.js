'use strict';

// v0.2.7 bounded export backend.
//
// The capture is serialized file-by-file and token-by-token. No export path is
// allowed to create one whole-recording JavaScript string. JSON strings are also
// emitted incrementally, so very long notes/URLs/text values and unusual Unicode
// cannot trip V8's maximum-string-length limit or be corrupted at chunk edges.
(() => {
  const previousHandleMessage = handleMessage;
  const STREAM_DB_NAME = 'etsy-bettersearch-diagnostics-stream-export-v1';
  const STREAM_DB_VERSION = 1;
  const STREAM_STORE = 'chunks';
  const CHUNK_CHARS = 256 * 1024; // divisible by 4 for independently decodable base64 chunks
  const JSON_STRING_BUFFER = 16 * 1024;
  let streamDbPromise = null;

  function safeFilePart(value) {
    const raw = String(value ?? 'item').normalize?.('NFC') || String(value ?? 'item');
    return raw
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'item';
  }

  function uniquePath(used, requested) {
    const clean = String(requested || 'item').replace(/^\/+/, '').replace(/\\/g, '/');
    if (!used.has(clean)) {
      used.add(clean);
      return clean;
    }
    const slash = clean.lastIndexOf('/');
    const dir = slash >= 0 ? clean.slice(0, slash + 1) : '';
    const leaf = slash >= 0 ? clean.slice(slash + 1) : clean;
    const dot = leaf.lastIndexOf('.');
    const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
    const ext = dot > 0 ? leaf.slice(dot) : '';
    let index = 2;
    while (used.has(`${dir}${stem}-${index}${ext}`)) index++;
    const result = `${dir}${stem}-${index}${ext}`;
    used.add(result);
    return result;
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

  // Split by UTF-16 code units without ever cutting a valid surrogate pair in
  // half. TextEncoder is then free to encode every returned chunk independently
  // without replacing half of an emoji/non-BMP character with U+FFFD.
  function safeCutIndex(text, wanted) {
    let cut = Math.min(Math.max(1, wanted), text.length);
    if (cut < text.length) {
      const left = text.charCodeAt(cut - 1);
      const right = text.charCodeAt(cut);
      if (left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff) cut--;
    }
    return Math.max(1, cut);
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
          continue;
        }

        if (buffer.length) {
          const take = safeCutIndex(piece, room);
          buffer += piece.slice(0, take);
          piece = piece.slice(take);
          yield buffer;
          buffer = '';
        } else {
          const take = safeCutIndex(piece, CHUNK_CHARS);
          yield piece.slice(0, take);
          piece = piece.slice(take);
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

  function hex4(value) {
    return value.toString(16).padStart(4, '0');
  }

  // Incremental JSON string writer. It never runs JSON.stringify() on the entire
  // string, and it makes lone surrogates explicit escapes while preserving valid
  // surrogate pairs. This keeps arbitrary user notes/URLs valid JSON.
  function* jsonStringPieces(value) {
    const text = String(value ?? '');
    yield '"';
    let buffer = '';
    const flush = function* () {
      if (buffer) {
        yield buffer;
        buffer = '';
      }
    };
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      let out = '';
      if (code === 0x22) out = '\\"';
      else if (code === 0x5c) out = '\\\\';
      else if (code === 0x08) out = '\\b';
      else if (code === 0x09) out = '\\t';
      else if (code === 0x0a) out = '\\n';
      else if (code === 0x0c) out = '\\f';
      else if (code === 0x0d) out = '\\r';
      else if (code < 0x20 || code === 0x2028 || code === 0x2029) out = `\\u${hex4(code)}`;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = index + 1 < text.length ? text.charCodeAt(index + 1) : -1;
        if (next >= 0xdc00 && next <= 0xdfff) {
          out = text[index] + text[index + 1];
          index++;
        } else out = `\\u${hex4(code)}`;
      } else if (code >= 0xdc00 && code <= 0xdfff) out = `\\u${hex4(code)}`;
      else out = text[index];

      buffer += out;
      if (buffer.length >= JSON_STRING_BUFFER) yield* flush();
    }
    yield* flush();
    yield '"';
  }

  function jsonObjectEntries(value) {
    try { return Object.entries(value); }
    catch (_) { return []; }
  }

  function* jsonValuePieces(value, ancestors = new WeakSet(), inArray = false) {
    if (value === null) { yield 'null'; return; }
    const type = typeof value;
    if (type === 'string') { yield* jsonStringPieces(value); return; }
    if (type === 'number') { yield Number.isFinite(value) ? String(value) : 'null'; return; }
    if (type === 'boolean') { yield value ? 'true' : 'false'; return; }
    if (type === 'bigint') { yield* jsonStringPieces(`${value}n`); return; }
    if (type === 'undefined' || type === 'function' || type === 'symbol') {
      if (inArray) yield 'null';
      return;
    }

    if (value instanceof Date) { yield* jsonStringPieces(value.toISOString()); return; }
    if (value instanceof RegExp) { yield* jsonStringPieces(String(value)); return; }
    if (value instanceof Error) {
      value = { name: value.name, message: value.message, stack: value.stack || '' };
    } else if (value instanceof Map) {
      value = Object.fromEntries(value);
    } else if (value instanceof Set) {
      value = Array.from(value);
    } else if (ArrayBuffer.isView(value)) {
      value = Array.from(value);
    } else if (value instanceof ArrayBuffer) {
      value = Array.from(new Uint8Array(value));
    }

    if (ancestors.has(value)) {
      yield* jsonStringPieces('[Circular]');
      return;
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        yield '[';
        for (let index = 0; index < value.length; index++) {
          if (index) yield ',';
          yield* jsonValuePieces(value[index], ancestors, true);
        }
        yield ']';
        return;
      }

      yield '{';
      let first = true;
      for (const [key, item] of jsonObjectEntries(value)) {
        const itemType = typeof item;
        if (itemType === 'undefined' || itemType === 'function' || itemType === 'symbol') continue;
        if (!first) yield ',';
        first = false;
        yield* jsonStringPieces(key);
        yield ':';
        yield* jsonValuePieces(item, ancestors, false);
      }
      yield '}';
    } finally {
      ancestors.delete(value);
    }
  }

  function* jsonDocumentPieces(value) {
    yield* jsonValuePieces(value);
    yield '\n';
  }

  function* ndjsonPieces(events, stream, transform = null) {
    for (const event of events) {
      if (event.stream !== stream) continue;
      const value = transform ? transform(event) : event;
      yield* jsonValuePieces(value);
      yield '\n';
    }
  }

  function* jsonArrayPieces(values) {
    yield '[';
    let first = true;
    for (const value of values) {
      if (!first) yield ',';
      first = false;
      yield* jsonValuePieces(value);
    }
    yield ']\n';
  }

  function* harPieces(har) {
    const log = har?.log || { version: '1.2', creator: {}, pages: [], entries: [] };
    const entries = Array.isArray(log.entries) ? log.entries : [];
    const { entries: _entries, ...head } = log;
    yield '{"log":';
    yield '{';
    let first = true;
    for (const [key, value] of Object.entries(head)) {
      if (!first) yield ',';
      first = false;
      yield* jsonStringPieces(key);
      yield ':';
      yield* jsonValuePieces(value);
    }
    if (!first) yield ',';
    yield '"entries":[';
    for (let index = 0; index < entries.length; index++) {
      if (index) yield ',';
      yield* jsonValuePieces(entries[index]);
    }
    yield ']}}\n';
  }

  async function prepareStreamingExport(message) {
    const id = String(message.sessionId || '');
    const session = await getSession(id);
    if (!session) return { ok: false, error: 'The stopped diagnostic session could not be found.' };
    if (!session.stoppedAt) return { ok: false, error: 'Stop the recording before exporting it.' };

    await clearPreparedSession(id);

    // readEvents still returns structured objects, but every serialization step
    // below is bounded. There is no aggregate JSON string and no per-record
    // JSON.stringify requirement.
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
      exporter: {
        mode: 'bounded-token-stream',
        chunkChars: CHUNK_CHARS,
        unicodeSafeChunking: true,
        circularValueRecovery: true
      }
    };

    await add('manifest.json', 'utf8', jsonDocumentPieces(manifest));
    await add('summary.json', 'utf8', jsonDocumentPieces(summary));
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
        const requested = `network/response-bodies/${requestId}.${event.data.base64Encoded ? 'base64.txt' : 'txt'}`;
        const path = uniquePath(usedPaths, requested);
        await add(path, 'utf8', event.data.base64Encoded ? [event.data.body, '\n'] : [event.data.body]);
      }
      if (event.stream === 'marker-screenshot' && event.type === 'screenshot' && event.data?.data) {
        const requested = `markers/${safeFilePart(event.data.markerId)}/screenshot.png`;
        const path = uniquePath(usedPaths, requested);
        // CHUNK_CHARS is divisible by four, so every non-final base64 chunk can
        // be decoded independently by the page without concatenating it first.
        await add(path, 'base64', [event.data.data]);
      }
      if (event.stream === 'marker-dom' && event.type === 'dom-snapshot' && event.data?.snapshot) {
        const requested = `markers/${safeFilePart(event.data.markerId)}/dom-snapshot.json`;
        const path = uniquePath(usedPaths, requested);
        await add(path, 'utf8', jsonDocumentPieces(event.data.snapshot));
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

  async function finalizeAndVerify(message, sender) {
    const id = String(message.sessionId || '');
    if (!id) return { ok: false, error: 'Session ID is missing.' };
    const result = await previousHandleMessage({ action: 'finalize_export', sessionId: id }, sender);
    await clearPreparedSession(id);
    if (!result?.ok) return result;

    let remaining = await getSession(id);
    if (remaining) {
      // One retry makes cleanup resilient to a transient IndexedDB transaction
      // abort; never claim the UI is reset while the raw capture still exists.
      await deleteSessionData(id);
      remaining = await getSession(id);
    }
    if (remaining) return { ok: false, error: 'The ZIP was created, but the exported recording could not be cleared from diagnostics storage.' };
    return { ok: true, sessionId: id };
  }

  async function discardAndVerify(message, sender) {
    const id = String(message.sessionId || '');
    const result = await previousHandleMessage({ action: 'discard_recording', sessionId: id }, sender);
    await clearPreparedSession(id);
    if (!result?.ok) return result;
    if (id) {
      let remaining = await getSession(id);
      if (remaining) {
        await deleteSessionData(id);
        remaining = await getSession(id);
      }
      if (remaining) return { ok: false, error: 'Could not completely discard the cancelled diagnostic recording.' };
    }
    return { ok: true, sessionId: id };
  }

  globalThis.__EBSF_DIAG_STREAM_TEST__ = Object.freeze({
    chunkChars: CHUNK_CHARS,
    boundedPiecesForTest: (pieces) => Array.from(boundedPieces(pieces)),
    jsonForTest: (value) => Array.from(jsonValuePieces(value)).join(''),
    safeFilePart
  });

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
      case 'finalize_stream_export':
        return finalizeAndVerify(message, sender);
      case 'discard_stream_recording':
        return discardAndVerify(message, sender);
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
