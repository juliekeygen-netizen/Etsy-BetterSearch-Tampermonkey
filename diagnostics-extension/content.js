'use strict';

(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const MAX_MUTATION_EVENTS = 20000;
  const FLUSH_INTERVAL_MS = 350;
  const SNAPSHOT_DEBOUNCE_MS = 45;
  const IMPORTANT = Object.freeze({
    sidebar: '[data-testid="sidebar"]',
    rail: '[data-ebsf-rail]',
    nativeGrid: '.phase3-listing-cards-section ul.implicit-comparison-listing-card-row:not([data-ebsf-local-grid]), .phase3-listing-cards-section ul[role="list"]:not([data-ebsf-local-grid])',
    localGrid: '[data-ebsf-local-grid]',
    nativePager: 'nav[aria-label="Favorite Items Page Results"]:not([data-ebsf-local-pagination])',
    localPager: '[data-ebsf-local-pagination]',
    toolbar: '[data-ebsf-toolbar-row]',
    collectionStrip: '[data-ebsf-collection-strip]',
    allHeader: '[data-ebsf-all-header]',
    listingSection: '.phase3-listing-cards-section',
    // Etsy's native empty-collection card is a valid no-grid state. Keep this
    // narrowly structural so a transient empty listing section remains useful
    // diagnostic evidence.
    nativeEmptyState: '.phase3-listing-cards-section > div.wt-display-flex-xs.wt-flex-direction-column-xs.wt-align-items-center'
  });

  const state = {
    session: null,
    recording: false,
    buffer: [],
    flushTimer: 0,
    mutationObserver: null,
    mutationCount: 0,
    droppedMutations: 0,
    snapshotTimer: 0,
    previousImportant: null,
    nodeIds: new WeakMap(),
    nodeCounter: 0,
    autoMarkerAt: new Map(),
    markerCounter: 0,
    panel: null,
    activity: [],
    elapsedTimer: 0,
    performanceObservers: [],
    listenersInstalled: false
  };

  function now() {
    const epochMs = Date.now();
    const navPerf = performance.now();
    return {
      epochMs,
      iso: new Date(epochMs).toISOString(),
      performanceMs: navPerf,
      sinceNavigationMs: navPerf,
      navigationTimeOriginMs: performance.timeOrigin,
      sinceRecordingMs: state.session?.startedAt ? Math.max(0, epochMs - state.session.startedAt) : null
    };
  }

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.activity.push(line);
    if (state.activity.length > 120) state.activity.shift();
    const pre = state.panel?.querySelector('[data-role="activity"]');
    if (pre) {
      pre.textContent = state.activity.slice(-30).join('\n');
      pre.scrollTop = pre.scrollHeight;
    }
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) return resolve({ ok: false, error: error.message });
          resolve(response || { ok: false, error: 'No response from diagnostics background.' });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function emit(stream, type, data = {}) {
    if (!state.recording) return;
    state.buffer.push({ stream, type, observed: now(), data });
    scheduleFlush();
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = window.setTimeout(() => {
      state.flushTimer = 0;
      void flush();
    }, FLUSH_INTERVAL_MS);
  }

  async function flush() {
    if (!state.buffer.length) return true;
    const batch = state.buffer.splice(0, state.buffer.length);
    const response = await send({ action: 'append_events', events: batch });
    if (!response?.ok && !response?.ignored) {
      state.buffer.unshift(...batch);
      log(`Could not flush ${batch.length} diagnostic events: ${response?.error || 'unknown error'}`);
      return false;
    }
    return true;
  }

  function nodeId(node) {
    if (!(node instanceof Node)) return '';
    let id = state.nodeIds.get(node);
    if (!id) {
      id = `n${++state.nodeCounter}`;
      state.nodeIds.set(node, id);
    }
    return id;
  }

  function compact(value, max = 180) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function nodeSummary(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return { nodeType: 3, text: compact(node.textContent, 100) };
    if (!(node instanceof Element)) return { nodeType: node.nodeType, name: node.nodeName };
    return {
      nodeId: nodeId(node),
      tag: node.tagName.toLowerCase(),
      id: node.id || '',
      className: compact(node.className, 220),
      role: node.getAttribute('role') || '',
      testId: node.getAttribute('data-testid') || node.getAttribute('data-test-id') || '',
      ebsf: Object.fromEntries(Array.from(node.attributes)
        .filter((attr) => attr.name.startsWith('data-ebsf'))
        .map((attr) => [attr.name, compact(attr.value, 160)])),
      text: compact(node.textContent, 120)
    };
  }

  function elementDescriptor(element) {
    if (!(element instanceof Element)) return null;
    const parts = [element.tagName.toLowerCase()];
    if (element.id) parts.push(`#${element.id}`);
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
    if (testId) parts.push(`[data-testid="${compact(testId, 80)}"]`);
    const ebsf = Array.from(element.attributes).find((attr) => attr.name.startsWith('data-ebsf'));
    if (ebsf) parts.push(`[${ebsf.name}${ebsf.value ? `="${compact(ebsf.value, 80)}"` : ''}]`);
    if (element.classList.length) parts.push(`.${Array.from(element.classList).slice(0, 3).join('.')}`);
    return { nodeId: nodeId(element), label: parts.join('') };
  }

  function isDiagnosticsNode(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest?.(`#${PANEL_ID}`));
  }

  function visibleElement(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementState(selector) {
    const element = document.querySelector(selector);
    if (!(element instanceof Element)) return { exists: false, selector };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      exists: true,
      selector,
      node: elementDescriptor(element),
      parent: elementDescriptor(element.parentElement),
      connected: element.isConnected,
      hidden: Boolean(element.hidden),
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: Boolean(element.inert),
      visible: visibleElement(element),
      childElementCount: element.childElementCount,
      rect: {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        top: Math.round(rect.top * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        bottom: Math.round(rect.bottom * 100) / 100,
        left: Math.round(rect.left * 100) / 100
      },
      computed: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        overflow: style.overflow,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex
      },
      className: compact(element.className, 350),
      attributes: Object.fromEntries(Array.from(element.attributes)
        .filter((attr) => /^(?:data-ebsf|aria-|hidden$|inert$)/.test(attr.name))
        .map((attr) => [attr.name, compact(attr.value, 180)]))
    };
  }

  function pageState(trigger = 'snapshot') {
    const elements = Object.fromEntries(Object.entries(IMPORTANT).map(([key, selector]) => [key, elementState(selector)]));
    const body = document.body;
    return {
      trigger,
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
        scrollX,
        scrollY
      },
      bodyClass: compact(body?.className, 500),
      bodyEbsfAttributes: body
        ? Object.fromEntries(Array.from(body.attributes).filter((attr) => attr.name.startsWith('data-ebsf')).map((attr) => [attr.name, compact(attr.value, 180)]))
        : {},
      elements
    };
  }

  function sameNode(previous, current) {
    return previous?.node?.nodeId && current?.node?.nodeId && previous.node.nodeId === current.node.nodeId;
  }

  function scheduleImportantSnapshot(trigger) {
    if (!state.recording || state.snapshotTimer) return;
    state.snapshotTimer = window.setTimeout(() => {
      state.snapshotTimer = 0;
      captureImportantSnapshot(trigger);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  function autoMarker(key, label, snapshot) {
    if (!state.session?.options?.autoMarkers) return;
    const previous = Number(state.autoMarkerAt.get(key) || 0);
    if (Date.now() - previous < 1200) return;
    state.autoMarkerAt.set(key, Date.now());
    const marker = {
      markerId: `auto-${key}-${Date.now()}`,
      kind: 'auto',
      label,
      note: '',
      requestedAt: now(),
      pageState: snapshot || pageState(`auto:${key}`)
    };
    emit('marker-local', 'auto-marker', marker);
    void send({ action: 'marker_begin', marker });
    log(`AUTO marker: ${label}`);
  }

  function shouldMarkNoGridVisible(current, readyState = document.readyState) {
    return Boolean(
      current.listingSection?.exists
      && readyState !== 'loading'
      && !current.nativeGrid?.visible
      && !current.localGrid?.visible
      && !current.nativeEmptyState?.visible
    );
  }

  function captureImportantSnapshot(trigger) {
    if (!state.recording) return null;
    const snapshot = pageState(trigger);
    emit('important-state', 'snapshot', snapshot);

    const previous = state.previousImportant;
    const current = snapshot.elements;
    if (previous) {
      if (previous.sidebar?.exists && current.sidebar?.exists && !sameNode(previous.sidebar, current.sidebar)) {
        autoMarker('sidebar-host-replaced', 'Etsy sidebar host was replaced', snapshot);
      }
      if (previous.rail?.exists && !current.rail?.exists) {
        autoMarker('rail-disconnected', 'BetterSearch filter rail disappeared', snapshot);
      }
    }
    if (current.nativeGrid?.visible && current.localGrid?.visible) {
      autoMarker('both-grids-visible', 'Native and BetterSearch grids are both visible', snapshot);
    }
    if (shouldMarkNoGridVisible(current)) {
      autoMarker('no-grid-visible', 'Neither Favorites result grid is visible', snapshot);
    }
    if (current.nativePager?.visible && current.localPager?.visible) {
      autoMarker('both-pagers-visible', 'Native and BetterSearch pagers are both visible', snapshot);
    }
    state.previousImportant = current;
    return snapshot;
  }

  function mutationRelevantAttribute(name) {
    return /^(?:class|style|hidden|inert|aria-(?:hidden|current|disabled|expanded|selected)|data-ebsf.*|data-testid|data-test-id)$/i.test(String(name || ''));
  }

  function startMutationObserver() {
    if (!state.session?.options?.captureDom || state.mutationObserver) return;
    const root = document.documentElement;
    if (!root) return;
    state.mutationObserver = new MutationObserver((records) => {
      let relevant = false;
      for (const record of records) {
        if (isDiagnosticsNode(record.target)) continue;
        if (record.type === 'attributes' && !mutationRelevantAttribute(record.attributeName)) continue;
        if (state.mutationCount >= MAX_MUTATION_EVENTS) {
          state.droppedMutations++;
          continue;
        }
        const added = record.type === 'childList'
          ? Array.from(record.addedNodes).filter((node) => !isDiagnosticsNode(node)).slice(0, 30).map(nodeSummary)
          : [];
        const removed = record.type === 'childList'
          ? Array.from(record.removedNodes).filter((node) => !isDiagnosticsNode(node)).slice(0, 30).map(nodeSummary)
          : [];
        if (record.type === 'childList' && !added.length && !removed.length) continue;
        state.mutationCount++;
        relevant = true;
        emit('dom-mutation', record.type, {
          mutationIndex: state.mutationCount,
          target: elementDescriptor(record.target instanceof Element ? record.target : record.target?.parentElement),
          attributeName: record.attributeName || '',
          oldValue: record.oldValue == null ? null : compact(record.oldValue, 500),
          newValue: record.type === 'attributes' && record.target instanceof Element
            ? compact(record.target.getAttribute(record.attributeName), 500)
            : null,
          added,
          removed,
          addedOverflow: record.type === 'childList' ? Math.max(0, record.addedNodes.length - added.length) : 0,
          removedOverflow: record.type === 'childList' ? Math.max(0, record.removedNodes.length - removed.length) : 0
        });
      }
      if (relevant) scheduleImportantSnapshot('mutation');
    });
    state.mutationObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true
    });
  }

  function stopMutationObserver() {
    state.mutationObserver?.disconnect();
    state.mutationObserver = null;
  }

  function interactionTarget(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    if (!element || isDiagnosticsNode(element)) return null;
    const clickable = element.closest('button,a,input,select,summary,[role="button"],[role="option"],[data-ebsf-rail],[data-ebsf-toolbar-row]') || element;
    return {
      node: elementDescriptor(clickable),
      tag: clickable.tagName?.toLowerCase?.() || '',
      text: compact(clickable.textContent, 140),
      ariaLabel: clickable.getAttribute?.('aria-label') || '',
      type: clickable.getAttribute?.('type') || '',
      checked: 'checked' in clickable ? Boolean(clickable.checked) : undefined,
      valueLength: typeof clickable.value === 'string' ? clickable.value.length : undefined
    };
  }

  function recordInteraction(type, event) {
    if (!state.recording || !state.session?.options?.captureInteractions) return;
    const target = interactionTarget(event.target);
    if (!target) return;
    emit('interaction', type, {
      target,
      clientX: Number.isFinite(event.clientX) ? event.clientX : undefined,
      clientY: Number.isFinite(event.clientY) ? event.clientY : undefined,
      key: type === 'keydown' ? event.key : undefined,
      trusted: Boolean(event.isTrusted)
    });
    scheduleImportantSnapshot(`interaction:${type}`);
  }

  function installGlobalListeners() {
    if (state.listenersInstalled) return;
    state.listenersInstalled = true;

    document.addEventListener('click', (event) => recordInteraction('click', event), true);
    document.addEventListener('change', (event) => recordInteraction('change', event), true);
    document.addEventListener('input', (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element?.closest?.('[data-ebsf-toolbar-row],[data-ebsf-rail]')) return;
      recordInteraction('input', event);
    }, true);
    document.addEventListener('keydown', (event) => {
      if (!['Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      recordInteraction('keydown', event);
    }, true);

    window.addEventListener('error', (event) => {
      emit('error', 'window-error', {
        message: event.message || '',
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        stack: event.error?.stack || ''
      });
    }, true);
    window.addEventListener('unhandledrejection', (event) => {
      emit('error', 'unhandled-rejection', {
        reason: compact(event.reason?.message || event.reason, 1000),
        stack: event.reason?.stack || ''
      });
    });

    for (const [name, target] of [
      ['DOMContentLoaded', document],
      ['readystatechange', document],
      ['load', window],
      ['pageshow', window],
      ['pagehide', window],
      ['popstate', window],
      ['hashchange', window],
      ['visibilitychange', document]
    ]) {
      target.addEventListener(name, (event) => {
        emit('lifecycle', name, {
          url: location.href,
          readyState: document.readyState,
          visibilityState: document.visibilityState,
          persisted: typeof event.persisted === 'boolean' ? event.persisted : undefined
        });
        scheduleImportantSnapshot(`lifecycle:${name}`);
      }, true);
    }
  }

  function startPerformanceObservers() {
    if (!state.recording || state.performanceObservers.length) return;
    const observeType = (type) => {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            emit('performance', type, {
              name: entry.name,
              entryType: entry.entryType,
              startTime: entry.startTime,
              duration: entry.duration,
              initiatorType: entry.initiatorType,
              transferSize: entry.transferSize,
              encodedBodySize: entry.encodedBodySize,
              decodedBodySize: entry.decodedBodySize,
              responseStart: entry.responseStart,
              responseEnd: entry.responseEnd,
              domInteractive: entry.domInteractive,
              domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
              loadEventEnd: entry.loadEventEnd
            });
          }
        });
        observer.observe({ type, buffered: true });
        state.performanceObservers.push(observer);
      } catch (_) {
        // Unsupported entry types are optional diagnostics.
      }
    };
    ['navigation', 'resource', 'paint', 'longtask'].forEach(observeType);
  }

  function stopPerformanceObservers() {
    for (const observer of state.performanceObservers) observer.disconnect();
    state.performanceObservers = [];
  }

  function armSession(session) {
    try {
      sessionStorage.setItem(ARM_KEY, JSON.stringify({
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        startedIso: session.startedIso,
        options: session.options || {}
      }));
    } catch (_) {}
  }

  function disarmSession() {
    try { sessionStorage.removeItem(ARM_KEY); } catch (_) {}
  }

  function readArmedSession() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(ARM_KEY) || 'null');
      return parsed?.sessionId ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function startLocalRecorder(session, reason = 'start') {
    if (!session?.sessionId) return;
    state.session = session;
    state.recording = true;
    state.mutationCount = 0;
    state.droppedMutations = 0;
    state.previousImportant = null;
    installGlobalListeners();
    startMutationObserver();
    startPerformanceObservers();
    emit('lifecycle', 'content-recorder-start', {
      reason,
      url: location.href,
      readyState: document.readyState,
      timeOrigin: performance.timeOrigin,
      navigationStartIso: new Date(performance.timeOrigin).toISOString(),
      userAgent: navigator.userAgent
    });
    captureImportantSnapshot(`recorder:${reason}`);
    updateUi();
    log(`Recording ${session.sessionId}.`);
  }

  function stopLocalRecorder() {
    if (!state.recording) return;
    if (state.droppedMutations) {
      emit('recorder', 'mutation-cap-reached', { droppedMutations: state.droppedMutations, cap: MAX_MUTATION_EVENTS });
    }
    emit('lifecycle', 'content-recorder-stop', { url: location.href, readyState: document.readyState });
    stopMutationObserver();
    stopPerformanceObservers();
    state.recording = false;
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = 0;
    updateUi();
  }

  function optionValues() {
    const panel = state.panel;
    const checked = (role, fallback = true) => panel?.querySelector(`[data-role="${role}"]`)?.checked ?? fallback;
    return {
      captureNetwork: checked('network'),
      captureBodies: checked('bodies'),
      captureStaticBodies: checked('static-bodies', false),
      captureDom: checked('dom'),
      captureDomSnapshots: checked('dom-snapshots'),
      captureScreenshots: checked('screenshots'),
      captureInteractions: checked('interactions'),
      captureConsole: checked('console'),
      autoMarkers: checked('auto-markers'),
      bodyLimitBytes: 5 * 1024 * 1024
    };
  }

  async function beginRecording({ reload = false } = {}) {
    if (state.recording) return;
    setStatus('Attaching Chrome debugger…');
    const response = await send({ action: 'start_recording', options: optionValues() });
    if (!response?.ok) {
      setStatus('Could not start');
      log(response?.error || 'Could not start recording.');
      return;
    }
    armSession(response.session);
    startLocalRecorder(response.session, reload ? 'record-and-reload' : 'manual-start');
    await flush();
    if (reload) {
      setStatus('Recording · reloading…');
      window.setTimeout(() => location.reload(), 80);
    }
  }

  async function createUserMarker() {
    if (!state.recording) return;
    const markerId = `user-${Date.now()}-${++state.markerCounter}`;
    const marker = {
      markerId,
      kind: 'user',
      label: 'User observed a problem',
      note: '',
      requestedAt: now(),
      pageState: pageState('user-marker')
    };
    emit('marker-local', 'user-marker', marker);
    const response = await send({ action: 'marker_begin', marker });
    if (!response?.ok) log(`Marker capture warning: ${response?.error || 'unknown error'}`);
    openMarkerEditor(markerId);
    log(`Marker ${markerId} captured. Add a note if useful.`);
  }

  function openMarkerEditor(markerId) {
    const modal = state.panel?.querySelector('[data-role="marker-modal"]');
    if (!modal) return;
    modal.dataset.markerId = markerId;
    modal.hidden = false;
    const textarea = modal.querySelector('textarea');
    textarea.value = '';
    textarea.focus();
  }

  function closeMarkerEditor() {
    const modal = state.panel?.querySelector('[data-role="marker-modal"]');
    if (!modal) return;
    modal.hidden = true;
    modal.dataset.markerId = '';
  }

  async function saveMarkerNote() {
    const modal = state.panel?.querySelector('[data-role="marker-modal"]');
    if (!modal) return;
    const markerId = modal.dataset.markerId || '';
    const note = modal.querySelector('textarea')?.value || '';
    if (markerId && note.trim()) {
      emit('marker-local', 'marker-note', { markerId, note });
      await send({ action: 'marker_note', markerId, sessionId: state.session?.sessionId, note });
      log(`Saved note for ${markerId}.`);
    }
    closeMarkerEditor();
  }

  function setStatus(text) {
    const node = state.panel?.querySelector('[data-role="status"]');
    if (node) node.textContent = text;
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function updateUi() {
    if (!state.panel) return;
    const recording = Boolean(state.recording);
    state.panel.dataset.recording = recording ? '1' : '0';
    for (const button of state.panel.querySelectorAll('[data-start]')) button.disabled = recording;
    state.panel.querySelector('[data-role="stop"]').disabled = !recording;
    state.panel.querySelector('[data-role="marker"]').disabled = !recording;
    for (const input of state.panel.querySelectorAll('[data-option]')) input.disabled = recording;
    setStatus(recording ? '● Recording' : 'Ready');
    if (recording && !state.elapsedTimer) {
      state.elapsedTimer = window.setInterval(() => {
        const elapsed = state.panel?.querySelector('[data-role="elapsed"]');
        if (elapsed && state.session?.startedAt) elapsed.textContent = formatDuration(Date.now() - state.session.startedAt);
      }, 250);
    }
    if (!recording) {
      const elapsed = state.panel.querySelector('[data-role="elapsed"]');
      if (elapsed) elapsed.textContent = '0:00';
    }
  }

  function crcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }

  const CRC_TABLE = crcTable();
  const encoder = new TextEncoder();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function u32(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  }

  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function dosTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  class ZipBuilder {
    constructor() {
      this.files = [];
      this.paths = new Set();
    }
    addBytes(path, bytes) {
      const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
      if (!normalized || this.paths.has(normalized)) return;
      this.paths.add(normalized);
      this.files.push({ path: normalized, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), date: new Date() });
    }
    addText(path, text) { this.addBytes(path, encoder.encode(String(text))); }
    addJson(path, value) { this.addText(path, `${JSON.stringify(value, null, 2)}\n`); }
    toBlob() {
      const localParts = [];
      const centralParts = [];
      let offset = 0;
      for (const file of this.files) {
        const name = encoder.encode(file.path);
        const crc = crc32(file.bytes);
        const time = dosTime(file.date);
        const flags = 0x0800;
        const local = concatBytes([
          u32(0x04034b50), u16(20), u16(flags), u16(0), u16(time.time), u16(time.date),
          u32(crc), u32(file.bytes.length), u32(file.bytes.length), u16(name.length), u16(0), name
        ]);
        localParts.push(local, file.bytes);
        const central = concatBytes([
          u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(time.time), u16(time.date),
          u32(crc), u32(file.bytes.length), u32(file.bytes.length), u16(name.length), u16(0), u16(0),
          u16(0), u16(0), u32(0), u32(offset), name
        ]);
        centralParts.push(central);
        offset += local.length + file.bytes.length;
      }
      const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
      const end = concatBytes([
        u32(0x06054b50), u16(0), u16(0), u16(this.files.length), u16(this.files.length),
        u32(centralSize), u32(offset), u16(0)
      ]);
      return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
    }
  }

  function ndjson(events) {
    return events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '');
  }

  function base64Bytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function safeFilePart(value) {
    return String(value || 'item').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item';
  }

  function buildDiagnosticZip(exportData) {
    const zip = new ZipBuilder();
    const events = Array.isArray(exportData.events) ? exportData.events : [];
    const byStream = (stream) => events.filter((event) => event.stream === stream);
    const cdp = byStream('cdp');
    const bodies = byStream('network-body');
    const mutations = byStream('dom-mutation');
    const important = byStream('important-state');
    const interactions = byStream('interaction');
    const errors = byStream('error');
    const performanceEvents = byStream('performance');
    const lifecycle = byStream('lifecycle');
    const markerEvents = byStream('marker');
    const localMarkers = byStream('marker-local');
    const screenshots = byStream('marker-screenshot');
    const domSnapshots = byStream('marker-dom');
    const recorder = byStream('recorder');

    zip.addJson('manifest.json', {
      format: 'etsy-bettersearch-diagnostics',
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      session: exportData.session,
      files: {
        har: 'network/network.har',
        cdp: 'network/cdp-events.ndjson',
        mutations: 'dom/mutations.ndjson',
        importantStates: 'dom/important-elements.ndjson',
        markers: 'markers/markers.json'
      }
    });
    zip.addJson('summary.json', exportData.summary || {});
    zip.addJson('network/network.har', exportData.har || { log: { version: '1.2', creator: {}, entries: [] } });
    zip.addText('network/cdp-events.ndjson', ndjson(cdp));
    zip.addText('network/body-events.ndjson', ndjson(bodies.map((event) => ({
      ...event,
      data: event.type === 'response-body' ? { ...event.data, body: undefined, bodyStoredSeparately: true } : event.data
    }))));

    for (const event of bodies) {
      if (event.type !== 'response-body' || !event.data?.body) continue;
      const id = safeFilePart(event.data.requestId);
      if (event.data.base64Encoded) zip.addText(`network/response-bodies/${id}.base64.txt`, `${event.data.body}\n`);
      else zip.addText(`network/response-bodies/${id}.txt`, event.data.body);
    }

    zip.addText('timeline/lifecycle.ndjson', ndjson(lifecycle));
    zip.addText('timeline/interactions.ndjson', ndjson(interactions));
    zip.addText('timeline/errors.ndjson', ndjson(errors));
    zip.addText('timeline/performance.ndjson', ndjson(performanceEvents));
    zip.addText('timeline/recorder.ndjson', ndjson(recorder));
    zip.addText('dom/mutations.ndjson', ndjson(mutations));
    zip.addText('dom/important-elements.ndjson', ndjson(important));
    zip.addJson('markers/markers.json', [...markerEvents, ...localMarkers]);

    for (const event of screenshots) {
      if (event.type !== 'screenshot' || !event.data?.data) continue;
      zip.addBytes(`markers/${safeFilePart(event.data.markerId)}/screenshot.png`, base64Bytes(event.data.data));
    }
    for (const event of domSnapshots) {
      if (event.type !== 'dom-snapshot' || !event.data?.snapshot) continue;
      zip.addJson(`markers/${safeFilePart(event.data.markerId)}/dom-snapshot.json`, event.data.snapshot);
    }

    return zip.toBlob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function stopAndExport() {
    if (!state.recording) return;
    setStatus('Stopping · collecting data…');
    emit('important-state', 'final-snapshot', pageState('stop'));
    emit('lifecycle', 'stop-clicked', { url: location.href });
    await flush();
    stopMutationObserver();
    stopPerformanceObservers();
    const response = await send({ action: 'stop_recording' });
    if (!response?.ok) {
      setStatus('Stop failed');
      log(response?.error || 'Could not stop recording.');
      return;
    }
    state.recording = false;
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = 0;
    disarmSession();
    updateUi();
    setStatus('Packing diagnostic ZIP…');
    try {
      const blob = buildDiagnosticZip(response);
      const started = response.session?.startedIso || new Date().toISOString();
      const filename = `etsy-bettersearch-diagnostic-${started.replace(/[:.]/g, '-').replace(/Z$/, 'Z')}.zip`;
      downloadBlob(blob, filename);
      log(`Exported ${filename} (${Math.round(blob.size / 1024)} KiB).`);
      await send({ action: 'finalize_export', sessionId: response.session?.sessionId });
      setStatus('Export complete');
    } catch (error) {
      setStatus('Export failed');
      log(`Could not build diagnostic ZIP: ${error?.message || error}`);
    } finally {
      state.session = null;
      setTimeout(updateUi, 1200);
    }
  }

  function injectStyles() {
    if (document.getElementById(`${PANEL_ID}-style`)) return;
    const style = document.createElement('style');
    style.id = `${PANEL_ID}-style`;
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:min(410px,calc(100vw - 36px));font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7f7f7;background:#151617;border:1px solid #424447;border-radius:10px;box-shadow:0 14px 44px #0008;overflow:hidden;text-align:left}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} button,#${PANEL_ID} input,#${PANEL_ID} textarea{font:inherit}
      #${PANEL_ID} button{cursor:pointer}
      #${PANEL_ID} button:disabled{cursor:default;opacity:.45}
      #${PANEL_ID} header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:#202224;font-weight:800}
      #${PANEL_ID} header button{width:28px;height:26px;border:0;border-radius:5px;background:transparent;color:#fff;font-size:18px;line-height:1;padding:0}
      #${PANEL_ID} header button:hover{background:#303235}
      #${PANEL_ID} .ebd-body{padding:12px;display:grid;gap:11px}
      #${PANEL_ID}[data-collapsed="1"] .ebd-body{display:none}
      #${PANEL_ID} .ebd-tabs{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;background:#0e0f10;border-radius:7px}
      #${PANEL_ID} .ebd-tabs button{border:0;border-radius:5px;background:transparent;color:#b9bdc1;padding:7px 8px;font-weight:750}
      #${PANEL_ID} .ebd-tabs button[aria-selected="true"]{background:#292b2e;color:#fff}
      #${PANEL_ID} .ebd-view{display:grid;gap:10px}
      #${PANEL_ID} .ebd-view[hidden]{display:none}
      #${PANEL_ID} .ebd-status{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 9px;background:#101112;border:1px solid #343638;border-radius:7px}
      #${PANEL_ID}[data-recording="1"] [data-role="status"]{color:#ff9d8f;font-weight:800}
      #${PANEL_ID} .ebd-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      #${PANEL_ID} .ebd-actions .wide{grid-column:1/-1}
      #${PANEL_ID} .ebd-primary,#${PANEL_ID} .ebd-secondary,#${PANEL_ID} .ebd-danger{border-radius:6px;padding:8px 10px;font-weight:800}
      #${PANEL_ID} .ebd-primary{border:1px solid #ff9d8f;background:#ff9d8f;color:#111}
      #${PANEL_ID} .ebd-secondary{border:1px solid #5a5e62;background:#26282b;color:#fff}
      #${PANEL_ID} .ebd-danger{border:1px solid #8c5752;background:#3a2422;color:#ffd8d3}
      #${PANEL_ID} .ebd-options{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;padding:9px;background:#101112;border:1px solid #343638;border-radius:7px}
      #${PANEL_ID} .ebd-check{display:flex;gap:7px;align-items:flex-start;color:#d5d7d9;font-size:12px}
      #${PANEL_ID} .ebd-check input{margin-top:2px}
      #${PANEL_ID} small{color:#aeb2b6}
      #${PANEL_ID} details{border-top:1px solid #2f3133;padding-top:7px}
      #${PANEL_ID} summary{cursor:pointer;font-weight:700;color:#c9ccd0;user-select:none}
      #${PANEL_ID} pre{margin:7px 0 0;max-height:210px;overflow:auto;white-space:pre-wrap;background:#0d0e0f;border-radius:6px;padding:8px;color:#cfd2d4;font:11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace}
      #${PANEL_ID} .ebd-modal{position:absolute;inset:0;background:#111d;display:grid;place-items:center;padding:14px}
      #${PANEL_ID} .ebd-modal[hidden]{display:none}
      #${PANEL_ID} .ebd-dialog{width:100%;background:#202224;border:1px solid #55595d;border-radius:9px;padding:11px;display:grid;gap:9px;box-shadow:0 14px 40px #000b}
      #${PANEL_ID} textarea{width:100%;min-height:100px;resize:vertical;border:1px solid #55595d;border-radius:6px;background:#0e0f10;color:#fff;padding:8px}
      #${PANEL_ID} textarea:focus{outline:2px solid #69dce8;outline-offset:1px}
      #${PANEL_ID} .ebd-note-actions{display:flex;justify-content:flex-end;gap:7px}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function buildPanel() {
    if (state.panel || !document.documentElement) return;
    injectStyles();
    const panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.dataset.collapsed = '1';
    panel.dataset.view = 'recorder';
    panel.dataset.recording = '0';
    panel.innerHTML = `
      <header><span>Etsy BetterSearch Diagnostics</span><button type="button" data-role="collapse" aria-label="Expand">+</button></header>
      <div class="ebd-body">
        <div class="ebd-tabs">
          <button type="button" data-tab="recorder" aria-selected="true">Recorder</button>
          <button type="button" data-tab="activity" aria-selected="false">Activity</button>
        </div>
        <section class="ebd-view" data-view="recorder">
          <div class="ebd-status"><span data-role="status">Ready</span><span data-role="elapsed">0:00</span></div>
          <div class="ebd-actions">
            <button type="button" class="ebd-primary wide" data-start="reload">Record &amp; Reload</button>
            <button type="button" class="ebd-secondary" data-start="start">Start</button>
            <button type="button" class="ebd-secondary" data-role="marker" disabled>Mark problem</button>
            <button type="button" class="ebd-danger wide" data-role="stop" disabled>Stop &amp; Export ZIP</button>
          </div>
          <div class="ebd-options">
            <label class="ebd-check"><input data-option data-role="network" type="checkbox" checked><span>Full network / HAR</span></label>
            <label class="ebd-check"><input data-option data-role="bodies" type="checkbox" checked><span>Response bodies</span></label>
            <label class="ebd-check"><input data-option data-role="static-bodies" type="checkbox"><span>Static/media bodies</span></label>
            <label class="ebd-check"><input data-option data-role="dom" type="checkbox" checked><span>DOM lifecycle</span></label>
            <label class="ebd-check"><input data-option data-role="dom-snapshots" type="checkbox" checked><span>Marker DOM snapshots</span></label>
            <label class="ebd-check"><input data-option data-role="screenshots" type="checkbox" checked><span>Marker screenshots</span></label>
            <label class="ebd-check"><input data-option data-role="interactions" type="checkbox" checked><span>User interactions</span></label>
            <label class="ebd-check"><input data-option data-role="console" type="checkbox" checked><span>Console / errors</span></label>
            <label class="ebd-check"><input data-option data-role="auto-markers" type="checkbox" checked><span>Automatic problem markers</span></label>
          </div>
          <small>All events include wall-clock + monotonic timing so DOM, network and UI changes can be correlated precisely. Keep DevTools closed while recording.</small>
        </section>
        <section class="ebd-view" data-view="activity" hidden>
          <pre data-role="activity"></pre>
        </section>
        <details><summary>How to use</summary><small>Record &amp; Reload → reproduce the issue → press Mark problem when you see something wrong → optionally describe it → Stop &amp; Export ZIP.</small></details>
      </div>
      <div class="ebd-modal" data-role="marker-modal" hidden>
        <div class="ebd-dialog" role="dialog" aria-modal="true" aria-label="Describe observed problem">
          <b>What did you notice?</b>
          <small>The marker, screenshot and DOM snapshot were already captured. The description is optional.</small>
          <textarea placeholder="Example: filter sidebar disappeared for about a second, then came back"></textarea>
          <div class="ebd-note-actions"><button type="button" class="ebd-secondary" data-role="marker-skip">Keep without note</button><button type="button" class="ebd-primary" data-role="marker-save">Save note</button></div>
        </div>
      </div>`;
    document.documentElement.appendChild(panel);
    state.panel = panel;

    panel.querySelector('[data-role="collapse"]').addEventListener('click', () => {
      const collapsed = panel.dataset.collapsed === '1';
      panel.dataset.collapsed = collapsed ? '0' : '1';
      const button = panel.querySelector('[data-role="collapse"]');
      button.textContent = collapsed ? '—' : '+';
      button.setAttribute('aria-label', collapsed ? 'Collapse' : 'Expand');
    });
    for (const tab of panel.querySelectorAll('[data-tab]')) {
      tab.addEventListener('click', () => {
        panel.dataset.view = tab.dataset.tab;
        for (const button of panel.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', button === tab ? 'true' : 'false');
        for (const view of panel.querySelectorAll('[data-view]')) view.hidden = view.dataset.view !== tab.dataset.tab;
      });
    }
    panel.querySelector('[data-start="reload"]').addEventListener('click', () => void beginRecording({ reload: true }));
    panel.querySelector('[data-start="start"]').addEventListener('click', () => void beginRecording({ reload: false }));
    panel.querySelector('[data-role="marker"]').addEventListener('click', () => void createUserMarker());
    panel.querySelector('[data-role="stop"]').addEventListener('click', () => void stopAndExport());
    panel.querySelector('[data-role="marker-save"]').addEventListener('click', () => void saveMarkerNote());
    panel.querySelector('[data-role="marker-skip"]').addEventListener('click', closeMarkerEditor);
    updateUi();
  }

  function ensurePanelSoon() {
    if (state.panel) return;
    if (document.documentElement) buildPanel();
    if (!state.panel) requestAnimationFrame(ensurePanelSoon);
  }

  async function synchronizeBackgroundState() {
    const response = await send({ action: 'get_state' });
    const active = response?.session;
    if (active?.recording) {
      armSession(active);
      if (!state.recording) startLocalRecorder(active, 'background-resume');
      else state.session = active;
      return;
    }
    if (state.recording) {
      emit('recorder', 'background-session-missing', { url: location.href });
      await flush();
      stopLocalRecorder();
      disarmSession();
      state.session = null;
    }
  }

  const armed = readArmedSession();
  if (armed) startLocalRecorder(armed, 'armed-document-start');
  ensurePanelSoon();
  void synchronizeBackgroundState();
})();
