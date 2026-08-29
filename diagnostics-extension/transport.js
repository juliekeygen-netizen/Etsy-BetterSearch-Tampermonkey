'use strict';

// Installed before content.js. Chrome extension messaging serializes payloads;
// a single huge or non-JSON-safe mutation batch must never poison the recorder.
(() => {
  const runtime = chrome?.runtime;
  if (!runtime?.sendMessage) return;

  const originalSendMessage = runtime.sendMessage.bind(runtime);
  const encoder = new TextEncoder();
  const MAX_CHUNK_BYTES = 192 * 1024;
  const MAX_CHUNK_EVENTS = 60;
  const MAX_EVENT_BYTES = 512 * 1024;
  const MAX_NOTE_CHARS = 12000;
  let captureGate = true;

  function safeJson(value) {
    const seen = new WeakSet();
    const json = JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (typeof item === 'function' || typeof item === 'symbol') return undefined;
      if (typeof item === 'number' && !Number.isFinite(item)) return null;
      if (item instanceof Error) {
        return { name: item.name || 'Error', message: item.message || String(item), stack: item.stack || '' };
      }
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
    return json == null ? null : JSON.parse(json);
  }

  function bytes(value) {
    try { return encoder.encode(JSON.stringify(value)).length; }
    catch (_) { return Number.POSITIVE_INFINITY; }
  }

  function omittedEvent(event, reason, originalBytes = null) {
    return {
      stream: 'recorder',
      type: 'transport-event-omitted',
      observed: safeJson(event?.observed) || { epochMs: Date.now(), iso: new Date().toISOString() },
      data: {
        reason,
        originalStream: String(event?.stream || ''),
        originalType: String(event?.type || ''),
        originalBytes
      }
    };
  }

  function normalizeEvent(event) {
    try {
      const safe = safeJson(event);
      if (!safe) return omittedEvent(event, 'not-json-serializable');
      const size = bytes(safe);
      if (size > MAX_EVENT_BYTES) return omittedEvent(event, 'event-too-large', size);
      return safe;
    } catch (error) {
      return omittedEvent(event, `serialization-error:${error?.message || error}`);
    }
  }

  function makeChunks(events) {
    const chunks = [];
    let current = [];
    let currentBytes = 32;
    for (const raw of events || []) {
      const event = normalizeEvent(raw);
      const eventBytes = bytes(event) + 1;
      if (current.length && (current.length >= MAX_CHUNK_EVENTS || currentBytes + eventBytes > MAX_CHUNK_BYTES)) {
        chunks.push(current);
        current = [];
        currentBytes = 32;
      }
      current.push(event);
      currentBytes += eventBytes;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  function sendOriginal(message) {
    return new Promise((resolve) => {
      try {
        originalSendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) resolve({ ok: false, error: error.message });
          else resolve(response || { ok: false, error: 'No response from diagnostics background.' });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  async function sendEventsResilient(events) {
    if (!captureGate) return { ok: false, ignored: true, transportPaused: true };
    const chunks = makeChunks(events);
    let sent = 0;
    let omitted = 0;
    const warnings = [];

    for (const chunk of chunks) {
      let response = await sendOriginal({ action: 'append_events', events: chunk });
      if (response?.ok || response?.ignored) {
        sent += chunk.length;
        continue;
      }

      // If a bounded chunk still fails serialization, isolate it to one event at
      // a time so one pathological mutation cannot block every later event.
      if (/serializ|message length|too large/i.test(String(response?.error || '')) && chunk.length > 1) {
        for (const event of chunk) {
          response = await sendOriginal({ action: 'append_events', events: [event] });
          if (response?.ok || response?.ignored) sent++;
          else {
            omitted++;
            warnings.push(String(response?.error || 'single-event transport failure'));
          }
        }
        continue;
      }

      return { ...response, sent, omitted, warnings };
    }

    return { ok: true, sent, omitted, warnings };
  }

  function invokeCallback(callback, response) {
    if (typeof callback !== 'function') return;
    try { callback(response); } catch (_) {}
  }

  function wrappedSendMessage(...args) {
    const message = args[0];
    const callback = typeof args.at(-1) === 'function' ? args.at(-1) : null;

    if (message?.action === 'append_events' && Array.isArray(message.events) && callback) {
      void sendEventsResilient(message.events).then((response) => invokeCallback(callback, response));
      return undefined;
    }

    if (message?.action === 'marker_note' && typeof message.note === 'string' && message.note.length > MAX_NOTE_CHARS) {
      args[0] = { ...message, note: message.note.slice(0, MAX_NOTE_CHARS) };
    }

    if (['pause_recording', 'stop_recording'].includes(message?.action)) captureGate = false;
    if (['resume_recording', 'start_recording'].includes(message?.action)) captureGate = true;

    return originalSendMessage(...args);
  }

  try {
    runtime.sendMessage = wrappedSendMessage;
  } catch (_) {
    try {
      Object.defineProperty(runtime, 'sendMessage', { configurable: true, writable: true, value: wrappedSendMessage });
    } catch (_) {
      // If Chrome ever makes the API method immutable, normal recorder behavior
      // remains available; the regression test/build still catches syntax issues.
    }
  }

  // Exposed only within this extension's isolated world so the control layer can
  // reopen the event gate after Resume and check installation during debugging.
  globalThis.__EBSF_DIAG_TRANSPORT__ = {
    setCaptureEnabled(value) { captureGate = Boolean(value); },
    get captureEnabled() { return captureGate; },
    limits: { MAX_CHUNK_BYTES, MAX_CHUNK_EVENTS, MAX_EVENT_BYTES, MAX_NOTE_CHARS }
  };
})();
