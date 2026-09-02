'use strict';

const DB_NAME = 'etsy-bettersearch-diagnostics-v1';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const SESSIONS_STORE = 'sessions';
const ACTIVE_KEY_PREFIX = 'ebsf-diagnostics:active:';
const DEBUGGER_VERSION = '1.3';
const DEFAULT_BODY_LIMIT = 5 * 1024 * 1024;
const TEXT_MIME_RE = /^(?:text\/|application\/(?:json|ld\+json|javascript|x-javascript|xml|xhtml\+xml|graphql|problem\+json|manifest\+json|vnd\.api\+json))/i;

const runtimeByTab = new Map();
let dbPromise = null;

function nowStamp() {
  const epochMs = Date.now();
  return {
    epochMs,
    iso: new Date(epochMs).toISOString(),
    workerPerformanceMs: typeof performance !== 'undefined' ? performance.now() : null
  };
}

function sessionId() {
  return `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function activeKey(tabId) {
  return `${ACTIVE_KEY_PREFIX}${tabId}`;
}

async function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const events = db.createObjectStore(EVENTS_STORE, { keyPath: 'id', autoIncrement: true });
        events.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open diagnostics database.'));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

async function putSession(session) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not persist diagnostics session.'));
    tx.onabort = () => reject(tx.error || new Error('Diagnostics session transaction aborted.'));
  });
}

async function getSession(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const request = tx.objectStore(SESSIONS_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

async function addEvent(id, stream, type, data = {}) {
  if (!id) return;
  const db = await openDb();
  const stamp = nowStamp();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(EVENTS_STORE, 'readwrite');
    tx.objectStore(EVENTS_STORE).add({ sessionId: id, stream, type, observed: stamp, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not persist diagnostics event.'));
    tx.onabort = () => reject(tx.error || new Error('Diagnostics event transaction aborted.'));
  });
}

async function addEvents(id, events) {
  if (!id || !Array.isArray(events) || !events.length) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(EVENTS_STORE, 'readwrite');
    const store = tx.objectStore(EVENTS_STORE);
    for (const event of events) {
      store.add({
        sessionId: id,
        stream: String(event.stream || 'content'),
        type: String(event.type || 'event'),
        observed: event.observed || nowStamp(),
        data: event.data || {}
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not persist diagnostics event batch.'));
    tx.onabort = () => reject(tx.error || new Error('Diagnostics event batch aborted.'));
  });
}

async function readEvents(id) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(EVENTS_STORE, 'readonly');
    const index = tx.objectStore(EVENTS_STORE).index('sessionId');
    const request = index.getAll(IDBKeyRange.only(id));
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.id - b.id));
    request.onerror = () => resolve([]);
  });
}

async function deleteSessionData(id) {
  const db = await openDb();
  await new Promise((resolve) => {
    const tx = db.transaction([EVENTS_STORE, SESSIONS_STORE], 'readwrite');
    const events = tx.objectStore(EVENTS_STORE).index('sessionId');
    const cursor = events.openCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      item.delete();
      item.continue();
    };
    tx.objectStore(SESSIONS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function setActive(tabId, session) {
  await chrome.storage.session.set({ [activeKey(tabId)]: session });
}

async function getActive(tabId) {
  const stored = await chrome.storage.session.get(activeKey(tabId));
  return stored[activeKey(tabId)] || null;
}

async function clearActive(tabId) {
  await chrome.storage.session.remove(activeKey(tabId));
  runtimeByTab.delete(tabId);
}

function runtimeFor(tabId) {
  let value = runtimeByTab.get(tabId);
  if (!value) {
    value = { responses: new Map(), bodyBytes: 0, markerCooldown: new Map() };
    runtimeByTab.set(tabId, value);
  }
  return value;
}

function debuggerTarget(tabId) {
  return { tabId };
}

async function cdp(tabId, method, params = {}) {
  return chrome.debugger.sendCommand(debuggerTarget(tabId), method, params);
}

async function enableDomains(tabId) {
  await cdp(tabId, 'Network.enable', {
    maxTotalBufferSize: 100 * 1024 * 1024,
    maxResourceBufferSize: 10 * 1024 * 1024,
    maxPostDataSize: 5 * 1024 * 1024
  });
  await Promise.allSettled([
    cdp(tabId, 'Page.enable'),
    cdp(tabId, 'Runtime.enable'),
    cdp(tabId, 'Log.enable'),
    cdp(tabId, 'Page.setLifecycleEventsEnabled', { enabled: true })
  ]);
}

async function attach(tabId) {
  await chrome.debugger.attach(debuggerTarget(tabId), DEBUGGER_VERSION);
  await enableDomains(tabId);
}

async function detach(tabId) {
  try {
    await chrome.debugger.detach(debuggerTarget(tabId));
  } catch (_) {
    // The target may already have detached during navigation/closure.
  }
}

function normalizedOptions(options = {}) {
  return {
    captureNetwork: options.captureNetwork !== false,
    captureBodies: options.captureBodies !== false,
    captureStaticBodies: Boolean(options.captureStaticBodies),
    captureDom: options.captureDom !== false,
    captureDomSnapshots: options.captureDomSnapshots !== false,
    captureScreenshots: options.captureScreenshots !== false,
    captureInteractions: options.captureInteractions !== false,
    captureConsole: options.captureConsole !== false,
    autoMarkers: options.autoMarkers !== false,
    captureFrameTrace: Boolean(options.captureFrameTrace),
    captureBurstScreenshots: Boolean(options.captureBurstScreenshots),
    semanticMarkers: Boolean(options.semanticMarkers),
    bodyLimitBytes: Math.max(128 * 1024, Math.min(25 * 1024 * 1024, Number(options.bodyLimitBytes) || DEFAULT_BODY_LIMIT))
  };
}

async function startRecording(tabId, options = {}) {
  const existing = await getActive(tabId);
  if (existing?.recording) return { ok: true, session: existing, alreadyRecording: true };

  const session = {
    sessionId: sessionId(),
    tabId,
    recording: true,
    startedAt: Date.now(),
    startedIso: new Date().toISOString(),
    stoppedAt: null,
    stoppedIso: null,
    options: normalizedOptions(options),
    debuggerAttached: false,
    debuggerDetachReason: '',
    extensionVersion: chrome.runtime.getManifest().version,
    userAgent: ''
  };

  await putSession(session);
  await setActive(tabId, session);
  runtimeFor(tabId);

  try {
    await attach(tabId);
    session.debuggerAttached = true;
    await setActive(tabId, session);
    await putSession(session);
    await addEvent(session.sessionId, 'recorder', 'debugger-attached', { tabId, protocolVersion: DEBUGGER_VERSION });
    return { ok: true, session };
  } catch (error) {
    session.recording = false;
    session.debuggerAttached = false;
    session.debuggerDetachReason = error?.message || String(error);
    await putSession(session);
    await clearActive(tabId);
    await addEvent(session.sessionId, 'recorder', 'debugger-attach-failed', { message: session.debuggerDetachReason });
    return {
      ok: false,
      error: `Could not attach Chrome diagnostics debugger. Close DevTools for this Etsy tab and try again. ${session.debuggerDetachReason}`,
      session
    };
  }
}

async function maybeCaptureResponseBody(tabId, session, requestId, loadingFinished) {
  const options = session.options || {};
  if (!options.captureNetwork || !options.captureBodies) return;
  const runtime = runtimeFor(tabId);
  const meta = runtime.responses.get(requestId) || {};
  const encodedBytes = Number(loadingFinished?.encodedDataLength || meta.encodedDataLength || 0);
  const mimeType = String(meta.mimeType || '');
  const textLike = !mimeType || TEXT_MIME_RE.test(mimeType);
  if (!options.captureStaticBodies && !textLike) {
    await addEvent(session.sessionId, 'network-body', 'body-omitted', {
      requestId,
      reason: 'static-or-media-body-disabled',
      mimeType,
      encodedBytes
    });
    return;
  }
  if (encodedBytes > options.bodyLimitBytes) {
    await addEvent(session.sessionId, 'network-body', 'body-omitted', {
      requestId,
      reason: 'body-limit',
      mimeType,
      encodedBytes,
      bodyLimitBytes: options.bodyLimitBytes
    });
    return;
  }
  try {
    const result = await cdp(tabId, 'Network.getResponseBody', { requestId });
    await addEvent(session.sessionId, 'network-body', 'response-body', {
      requestId,
      mimeType,
      encodedBytes,
      base64Encoded: Boolean(result?.base64Encoded),
      body: String(result?.body || '')
    });
  } catch (error) {
    await addEvent(session.sessionId, 'network-body', 'body-unavailable', {
      requestId,
      mimeType,
      encodedBytes,
      message: error?.message || String(error)
    });
  }
}

async function maybeCaptureRequestPostData(tabId, session, params) {
  if (!session.options?.captureNetwork) return;
  const request = params?.request || {};
  if (!request.hasPostData || request.postData) return;
  try {
    const result = await cdp(tabId, 'Network.getRequestPostData', { requestId: params.requestId });
    await addEvent(session.sessionId, 'network-body', 'request-post-data', {
      requestId: params.requestId,
      postData: String(result?.postData || '')
    });
  } catch (_) {
    // Some requests intentionally make post data unavailable.
  }
}

async function captureMarker(tabId, session, marker) {
  const markerId = String(marker?.markerId || `marker-${Date.now()}`);
  const payload = {
    markerId,
    kind: marker?.kind === 'auto' ? 'auto' : 'user',
    label: String(marker?.label || ''),
    note: String(marker?.note || ''),
    pageState: marker?.pageState || null,
    requestedAt: marker?.requestedAt || nowStamp()
  };
  await addEvent(session.sessionId, 'marker', 'marker', payload);

  const captures = [];
  if (session.options?.captureScreenshots) {
    captures.push((async () => {
      try {
        const result = await cdp(tabId, 'Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        await addEvent(session.sessionId, 'marker-screenshot', 'screenshot', {
          markerId,
          format: 'png',
          data: String(result?.data || '')
        });
      } catch (error) {
        await addEvent(session.sessionId, 'marker-screenshot', 'screenshot-error', { markerId, message: error?.message || String(error) });
      }
    })());
  }

  if (session.options?.captureDomSnapshots) {
    captures.push((async () => {
      try {
        const snapshot = await cdp(tabId, 'DOMSnapshot.captureSnapshot', {
          computedStyles: ['display', 'visibility', 'opacity', 'position', 'width', 'height', 'overflow', 'pointer-events', 'z-index'],
          includePaintOrder: true,
          includeDOMRects: true,
          includeBlendedBackgroundColors: false,
          includeTextColorOpacities: false
        });
        await addEvent(session.sessionId, 'marker-dom', 'dom-snapshot', { markerId, snapshot });
      } catch (error) {
        await addEvent(session.sessionId, 'marker-dom', 'dom-snapshot-error', { markerId, message: error?.message || String(error) });
      }
    })());
  }

  await Promise.allSettled(captures);
  return { ok: true, markerId };
}

async function captureMarkerBurstScreenshots(tabId, session, markerId) {
  if (!session.options?.captureBurstScreenshots) return { ok:true, skipped:true };
  const delays = [0, 125, 250, 375, 500, 625, 750, 875, 1000, 1125];
  for (const delay of delays) {
    setTimeout(() => void (async () => {
      const active = await getActive(tabId);
      if (!active?.recording || active.sessionId !== session.sessionId) return;
      try {
        const result = await cdp(tabId, 'Page.captureScreenshot', { format:'jpeg', quality:70, fromSurface:true, captureBeyondViewport:false });
        await addEvent(session.sessionId, 'marker-burst-screenshot', 'screenshot', { markerId, offsetMs:delay, format:'jpeg', data:String(result?.data || '') });
      } catch (error) {
        await addEvent(session.sessionId, 'marker-burst-screenshot', 'screenshot-error', { markerId, offsetMs:delay, message:error?.message || String(error) });
      }
    })(), delay);
  }
  return { ok:true, count:delays.length };
}

async function backgroundAutoMarker(tabId, session, key, label, detail = {}) {
  if (!session.options?.autoMarkers) return;
  const runtime = runtimeFor(tabId);
  const previous = Number(runtime.markerCooldown.get(key) || 0);
  if (Date.now() - previous < 1200) return;
  runtime.markerCooldown.set(key, Date.now());
  await captureMarker(tabId, session, {
    markerId: `auto-${key}-${Date.now()}`,
    kind: 'auto',
    label,
    note: '',
    pageState: detail,
    requestedAt: nowStamp()
  });
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!Number.isInteger(tabId)) return;
  void (async () => {
    const session = await getActive(tabId);
    if (!session?.recording) return;
    const observed = nowStamp();
    const consoleEvent = method === 'Runtime.consoleAPICalled' || method === 'Log.entryAdded';

    if ((!method.startsWith('Network.') || session.options?.captureNetwork)
      && (!consoleEvent || session.options?.captureConsole)) {
      await addEvent(session.sessionId, 'cdp', method, { method, params, observed });
    }

    if (method === 'Network.responseReceived') {
      const response = params?.response || {};
      runtimeFor(tabId).responses.set(params.requestId, {
        mimeType: response.mimeType || '',
        status: response.status || 0,
        url: response.url || ''
      });
      if (Number(response.status || 0) >= 400) {
        void backgroundAutoMarker(tabId, session, `http-${response.status}`, `HTTP ${response.status} response`, {
          url: response.url || '',
          requestId: params.requestId,
          status: response.status
        });
      }
    }

    if (method === 'Network.requestWillBeSent') {
      const url = String(params?.request?.url || '');
      if (/\/users\/\/collections\//.test(url)) {
        void backgroundAutoMarker(tabId, session, 'ownerless-collection-request', 'Malformed ownerless collection request', {
          url,
          requestId: params.requestId
        });
      }
      void maybeCaptureRequestPostData(tabId, session, params);
    }

    if (method === 'Network.loadingFinished') {
      void maybeCaptureResponseBody(tabId, session, params.requestId, params);
    }

    if (method === 'Runtime.exceptionThrown') {
      void backgroundAutoMarker(tabId, session, 'runtime-exception', 'Uncaught JavaScript exception', {
        exceptionDetails: params?.exceptionDetails || null
      });
    }
  })().catch(() => {});
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (!Number.isInteger(tabId)) return;
  void (async () => {
    const session = await getActive(tabId);
    if (!session) return;
    session.debuggerAttached = false;
    session.debuggerDetachReason = String(reason || 'unknown');
    if (session.recording) session.recording = false;
    await putSession(session);
    await addEvent(session.sessionId, 'recorder', 'debugger-detached', { reason: session.debuggerDetachReason });
    await clearActive(tabId);
  })().catch(() => {});
});

function headerPairs(headers = {}) {
  return Object.entries(headers || {}).map(([name, value]) => ({ name, value: String(value ?? '') }));
}

function headerValue(headers = {}, wanted) {
  const target = String(wanted).toLowerCase();
  const entry = Object.entries(headers || {}).find(([name]) => String(name).toLowerCase() === target);
  return entry ? String(entry[1] ?? '') : '';
}

function queryPairs(url) {
  try {
    return Array.from(new URL(url).searchParams.entries(), ([name, value]) => ({ name, value }));
  } catch (_) {
    return [];
  }
}

function parseRequestCookies(headers = {}) {
  const raw = headerValue(headers, 'cookie');
  if (!raw) return [];
  return raw.split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0
      ? { name: part.trim(), value: '' }
      : { name: part.slice(0, index).trim(), value: part.slice(index + 1).trim() };
  }).filter((item) => item.name);
}

function parseResponseCookies(headers = {}) {
  const raw = headerValue(headers, 'set-cookie');
  if (!raw) return [];
  const first = raw.split(/\r?\n/).filter(Boolean);
  return first.map((line) => {
    const token = line.split(';', 1)[0];
    const index = token.indexOf('=');
    return index < 0 ? { name: token.trim(), value: '' } : { name: token.slice(0, index).trim(), value: token.slice(index + 1).trim() };
  }).filter((item) => item.name);
}

function harTimings(record) {
  const responseTiming = record.response?.timing || {};
  const duration = record.endTimestamp && record.startTimestamp
    ? Math.max(0, (record.endTimestamp - record.startTimestamp) * 1000)
    : 0;
  const responseAt = record.responseTimestamp && record.startTimestamp
    ? Math.max(0, (record.responseTimestamp - record.startTimestamp) * 1000)
    : 0;
  const receive = record.endTimestamp && record.responseTimestamp
    ? Math.max(0, (record.endTimestamp - record.responseTimestamp) * 1000)
    : Math.max(0, duration - responseAt);
  const span = (start, end) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start ? end - start : -1;
  const dns = span(responseTiming.dnsStart, responseTiming.dnsEnd);
  const connect = span(responseTiming.connectStart, responseTiming.connectEnd);
  const ssl = span(responseTiming.sslStart, responseTiming.sslEnd);
  const send = span(responseTiming.sendStart, responseTiming.sendEnd);
  const wait = Number.isFinite(responseTiming.receiveHeadersEnd) && Number.isFinite(responseTiming.sendEnd)
    && responseTiming.receiveHeadersEnd >= 0 && responseTiming.sendEnd >= 0
    ? Math.max(0, responseTiming.receiveHeadersEnd - responseTiming.sendEnd)
    : responseAt;
  return { blocked: 0, dns, connect, ssl, send, wait, receive, _total: duration };
}

function buildHar(session, events) {
  const records = new Map();
  const completed = [];
  const bodies = new Map();
  const postBodies = new Map();

  for (const event of events) {
    if (event.stream === 'network-body' && event.type === 'response-body') {
      bodies.set(String(event.data.requestId || ''), event.data);
      continue;
    }
    if (event.stream === 'network-body' && event.type === 'request-post-data') {
      postBodies.set(String(event.data.requestId || ''), event.data.postData || '');
      continue;
    }
    if (event.stream !== 'cdp') continue;
    const method = event.data?.method || event.type;
    const params = event.data?.params || {};
    const requestId = String(params.requestId || '');
    if (!requestId) continue;

    if (method === 'Network.requestWillBeSent') {
      const previous = records.get(requestId);
      if (previous && params.redirectResponse) {
        previous.response = params.redirectResponse;
        previous.responseTimestamp = Number(params.timestamp || previous.startTimestamp || 0);
        previous.endTimestamp = Number(params.timestamp || previous.responseTimestamp || previous.startTimestamp || 0);
        previous.redirected = true;
        completed.push(previous);
      }
      records.set(requestId, {
        requestId,
        startTimestamp: Number(params.timestamp || 0),
        wallTime: Number(params.wallTime || 0),
        request: params.request || {},
        initiator: params.initiator || null,
        resourceType: params.type || '',
        documentURL: params.documentURL || '',
        response: null,
        responseTimestamp: 0,
        endTimestamp: 0,
        encodedDataLength: 0,
        failed: null,
        servedFromCache: false
      });
      continue;
    }

    const current = records.get(requestId);
    if (!current) continue;
    if (method === 'Network.responseReceived') {
      current.response = params.response || {};
      current.responseTimestamp = Number(params.timestamp || 0);
    } else if (method === 'Network.requestServedFromCache') {
      current.servedFromCache = true;
    } else if (method === 'Network.loadingFinished') {
      current.endTimestamp = Number(params.timestamp || 0);
      current.encodedDataLength = Number(params.encodedDataLength || 0);
      completed.push(current);
      records.delete(requestId);
    } else if (method === 'Network.loadingFailed') {
      current.endTimestamp = Number(params.timestamp || 0);
      current.failed = params;
      completed.push(current);
      records.delete(requestId);
    }
  }
  for (const current of records.values()) completed.push(current);

  const entries = completed.map((record, index) => {
    const request = record.request || {};
    const response = record.response || {};
    const body = bodies.get(record.requestId);
    const timings = harTimings(record);
    const postDataText = request.postData || postBodies.get(record.requestId) || '';
    const requestHeaders = request.headers || {};
    const responseHeaders = response.headers || {};
    const startedEpochMs = record.wallTime > 0
      ? record.wallTime * 1000
      : session.startedAt + Math.max(0, (record.startTimestamp - (completed[0]?.startTimestamp || record.startTimestamp)) * 1000);
    const mimeType = String(response.mimeType || headerValue(responseHeaders, 'content-type') || '');
    const content = {
      size: body ? (body.base64Encoded ? Math.floor(String(body.body || '').length * 0.75) : new TextEncoder().encode(String(body.body || '')).length) : Math.max(0, Number(record.encodedDataLength || 0)),
      mimeType
    };
    if (body) {
      content.text = body.body || '';
      if (body.base64Encoded) content.encoding = 'base64';
    }
    const harEntry = {
      pageref: 'page_1',
      startedDateTime: new Date(startedEpochMs).toISOString(),
      time: timings._total,
      request: {
        method: String(request.method || 'GET'),
        url: String(request.url || ''),
        httpVersion: String(response.protocol || 'HTTP/1.1'),
        cookies: parseRequestCookies(requestHeaders),
        headers: headerPairs(requestHeaders),
        queryString: queryPairs(request.url || ''),
        headersSize: -1,
        bodySize: postDataText ? new TextEncoder().encode(postDataText).length : 0
      },
      response: {
        status: Number(response.status || 0),
        statusText: String(response.statusText || record.failed?.errorText || ''),
        httpVersion: String(response.protocol || 'HTTP/1.1'),
        cookies: parseResponseCookies(responseHeaders),
        headers: headerPairs(responseHeaders),
        content,
        redirectURL: String(headerValue(responseHeaders, 'location') || ''),
        headersSize: -1,
        bodySize: Math.max(0, Number(record.encodedDataLength || 0))
      },
      cache: {},
      timings: {
        blocked: timings.blocked,
        dns: timings.dns,
        connect: timings.connect,
        ssl: timings.ssl,
        send: timings.send,
        wait: timings.wait,
        receive: timings.receive
      },
      serverIPAddress: response.remoteIPAddress || undefined,
      connection: response.connectionId != null ? String(response.connectionId) : undefined,
      _requestId: record.requestId,
      _resourceType: record.resourceType,
      _initiator: record.initiator,
      _documentURL: record.documentURL,
      _servedFromCache: record.servedFromCache,
      _fromDiskCache: Boolean(response.fromDiskCache),
      _fromServiceWorker: Boolean(response.fromServiceWorker),
      _failed: record.failed || undefined,
      _sequence: index
    };
    if (postDataText) {
      harEntry.request.postData = {
        mimeType: headerValue(requestHeaders, 'content-type'),
        text: postDataText
      };
    }
    return harEntry;
  }).filter((entry) => entry.request.url);

  return {
    log: {
      version: '1.2',
      creator: {
        name: 'Etsy BetterSearch Diagnostics',
        version: session.extensionVersion || chrome.runtime.getManifest().version
      },
      pages: [{
        startedDateTime: new Date(session.startedAt).toISOString(),
        id: 'page_1',
        title: 'Etsy BetterSearch diagnostic recording',
        pageTimings: {}
      }],
      entries
    }
  };
}

function buildSummary(session, events, har) {
  const count = (stream, type = null) => events.filter((event) => event.stream === stream && (!type || event.type === type)).length;
  const statuses = har.log.entries.map((entry) => Number(entry.response.status || 0));
  return {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    startedIso: session.startedIso,
    stoppedAt: session.stoppedAt,
    stoppedIso: session.stoppedIso,
    durationMs: Math.max(0, Number(session.stoppedAt || Date.now()) - Number(session.startedAt || Date.now())),
    totalStoredEvents: events.length,
    networkRequests: har.log.entries.length,
    httpErrors: statuses.filter((status) => status >= 400).length,
    uncaughtExceptions: events.filter((event) => event.stream === 'cdp' && event.type === 'Runtime.exceptionThrown').length,
    consoleEvents: events.filter((event) => event.stream === 'cdp' && ['Runtime.consoleAPICalled', 'Log.entryAdded'].includes(event.type)).length,
    domMutations: count('dom-mutation'),
    importantStateSnapshots: count('important-state'),
    interactionEvents: count('interaction'),
    userMarkers: events.filter((event) => event.stream === 'marker' && event.data?.kind === 'user').length,
    automaticMarkers: events.filter((event) => event.stream === 'marker' && event.data?.kind === 'auto').length,
    screenshots: count('marker-screenshot', 'screenshot'),
    burstScreenshots: count('marker-burst-screenshot', 'screenshot'),
    frameTraceWindows: count('frame-trace', 'marker-window'),
    domSnapshots: count('marker-dom', 'dom-snapshot'),
    omittedBodies: count('network-body', 'body-omitted'),
    debuggerDetachReason: session.debuggerDetachReason || ''
  };
}

async function stopRecording(tabId) {
  const active = await getActive(tabId);
  if (!active) return { ok: false, error: 'No diagnostic recording is active in this tab.' };
  active.recording = false;
  active.stoppedAt = Date.now();
  active.stoppedIso = new Date(active.stoppedAt).toISOString();
  await addEvent(active.sessionId, 'recorder', 'stop-requested', { tabId });
  await detach(tabId);
  await putSession(active);
  await chrome.storage.session.remove(activeKey(tabId));
  runtimeByTab.delete(tabId);

  const events = await readEvents(active.sessionId);
  const har = buildHar(active, events);
  const summary = buildSummary(active, events, har);
  return { ok: true, session: active, summary, har, events };
}

async function markerNote(tabId, message) {
  const active = await getActive(tabId);
  const id = String(message.markerId || '');
  const session = active || await getSession(message.sessionId);
  if (!session || !id) return { ok: false };
  await addEvent(session.sessionId, 'marker', 'marker-note', { markerId: id, note: String(message.note || '') });
  return { ok: true };
}

async function handleMessage(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) return { ok: false, error: 'Diagnostics messages must come from an Etsy tab.' };

  switch (message?.action) {
    case 'get_state': {
      const active = await getActive(tabId);
      return { ok: true, session: active };
    }
    case 'start_recording':
      return startRecording(tabId, message.options || {});
    case 'append_events': {
      const active = await getActive(tabId);
      if (!active?.recording) return { ok: false, ignored: true };
      await addEvents(active.sessionId, message.events || []);
      return { ok: true };
    }
    case 'marker_begin': {
      const active = await getActive(tabId);
      if (!active?.recording) return { ok: false, error: 'No recording is active.' };
      return captureMarker(tabId, active, message.marker || {});
    }
    case 'marker_burst_screenshots': {
      const active = await getActive(tabId);
      if (!active?.recording) return { ok:false, error:'No recording is active.' };
      return captureMarkerBurstScreenshots(tabId, active, String(message.markerId || ''));
    }
    case 'marker_note':
      return markerNote(tabId, message);
    case 'stop_recording':
      return stopRecording(tabId);
    case 'finalize_export': {
      const id = String(message.sessionId || '');
      if (id) await deleteSessionData(id);
      return { ok: true };
    }
    case 'discard_recording': {
      const active = await getActive(tabId);
      if (active) {
        await detach(tabId);
        await clearActive(tabId);
        await deleteSessionData(active.sessionId);
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown diagnostics action: ${message?.action || ''}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
