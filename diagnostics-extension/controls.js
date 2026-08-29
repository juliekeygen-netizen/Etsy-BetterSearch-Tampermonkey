'use strict';

(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const CONTROL_STYLE_ID = `${PANEL_ID}-controls-style`;
  const encoder = new TextEncoder();

  const ui = {
    mode: 'idle',
    session: null,
    stopped: null,
    stoppedExportData: null,
    panel: null,
    syncQueued: false
  };

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

  function readStopped() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STOPPED_KEY) || 'null');
      return value?.sessionId ? value : null;
    } catch (_) {
      return null;
    }
  }

  function writeStopped(session) {
    const value = session?.sessionId ? {
      sessionId: session.sessionId,
      startedIso: session.startedIso || '',
      stoppedIso: session.stoppedIso || new Date().toISOString()
    } : null;
    try {
      if (value) sessionStorage.setItem(STOPPED_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(STOPPED_KEY);
    } catch (_) {}
    ui.stopped = value;
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

  function readOptions(panel) {
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

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setDisabled(node, value) {
    if (node && node.disabled !== Boolean(value)) node.disabled = Boolean(value);
  }

  function appendActivity(message) {
    const pre = ui.panel?.querySelector('[data-role="activity"]');
    if (!pre) return;
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    const existing = pre.textContent ? `${pre.textContent.trimEnd()}\n` : '';
    pre.textContent = `${existing}${line}`.split('\n').slice(-60).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  function forceOpenWhileActive() {
    const panel = ui.panel;
    if (!panel) return;
    const active = ui.mode === 'recording' || ui.mode === 'paused';
    const collapse = panel.querySelector('[data-role="collapse"]');
    if (active) {
      if (panel.dataset.collapsed !== '0') panel.dataset.collapsed = '0';
      setText(collapse, '—');
      collapse?.setAttribute('aria-label', 'Drawer stays open while recording');
      collapse?.setAttribute('title', 'Drawer stays open while recording');
      setDisabled(collapse, true);
    } else {
      collapse?.removeAttribute('title');
      setDisabled(collapse, false);
    }
  }

  function syncUi() {
    ui.syncQueued = false;
    const panel = ui.panel;
    if (!panel) return;

    const reload = panel.querySelector('[data-start="reload"]');
    const pause = panel.querySelector('[data-start="start"]');
    const marker = panel.querySelector('[data-role="marker"]');
    const stopExport = panel.querySelector('[data-role="stop"]');
    const status = panel.querySelector('[data-role="status"]');

    if (ui.mode === 'recording') {
      setText(reload, 'Stop recording');
      setDisabled(reload, false);
      setText(pause, 'Pause');
      setDisabled(pause, false);
      setDisabled(marker, false);
      setText(stopExport, 'Stop & Export ZIP');
      setDisabled(stopExport, false);
      setText(status, '● Recording');
    } else if (ui.mode === 'paused') {
      setText(reload, 'Stop recording');
      setDisabled(reload, false);
      setText(pause, 'Resume');
      setDisabled(pause, false);
      setDisabled(marker, true);
      setText(stopExport, 'Stop & Export ZIP');
      setDisabled(stopExport, false);
      setText(status, 'Paused');
    } else if (ui.mode === 'stopped') {
      setText(reload, 'Record & Reload');
      setDisabled(reload, false);
      setText(pause, 'Pause');
      setDisabled(pause, true);
      setDisabled(marker, true);
      setText(stopExport, 'Export ZIP');
      setDisabled(stopExport, false);
      setText(status, 'Stopped · ready to export');
    } else {
      setText(reload, 'Record & Reload');
      setDisabled(reload, false);
      setText(pause, 'Pause');
      setDisabled(pause, true);
      setDisabled(marker, true);
      setText(stopExport, 'Stop & Export ZIP');
      setDisabled(stopExport, true);
      setText(status, 'Ready');
    }

    forceOpenWhileActive();
  }

  function queueSync() {
    if (ui.syncQueued) return;
    ui.syncQueued = true;
    queueMicrotask(syncUi);
  }

  async function refreshMode() {
    const response = await send({ action: 'get_state' });
    const active = response?.session || null;
    ui.session = active;
    ui.stopped = readStopped();
    if (active?.paused) ui.mode = 'paused';
    else if (active?.recording) ui.mode = 'recording';
    else if (ui.stopped?.sessionId) ui.mode = 'stopped';
    else ui.mode = 'idle';
    syncUi();
  }

  async function discardStoppedIfNeeded() {
    if (!ui.stopped?.sessionId) return true;
    const okay = confirm('A stopped diagnostics recording has not been exported yet. Start a new recording and discard it?');
    if (!okay) return false;
    await send({ action: 'finalize_export', sessionId: ui.stopped.sessionId });
    writeStopped(null);
    ui.stoppedExportData = null;
    return true;
  }

  async function startAndReload() {
    if (!(await discardStoppedIfNeeded())) return;
    const panel = ui.panel;
    setText(panel?.querySelector('[data-role="status"]'), 'Attaching Chrome debugger…');
    const response = await send({ action: 'start_recording', options: readOptions(panel) });
    if (!response?.ok) {
      ui.mode = 'idle';
      syncUi();
      appendActivity(response?.error || 'Could not start recording.');
      return;
    }
    ui.session = response.session;
    ui.mode = 'recording';
    armSession(response.session);
    writeStopped(null);
    syncUi();
    appendActivity(`Recording ${response.session.sessionId}; reloading page.`);
    window.setTimeout(() => location.reload(), 80);
  }

  async function pauseRecording() {
    const response = await send({ action: 'pause_recording' });
    if (!response?.ok) {
      appendActivity(response?.error || 'Could not pause recording.');
      return;
    }
    ui.session = response.session;
    ui.mode = 'paused';
    syncUi();
    appendActivity('Recording paused. Chrome debugger remains attached so Resume is instant.');
  }

  async function resumeRecording() {
    const localRecorderRunning = ui.panel?.dataset.recording === '1';
    const response = await send({ action: 'resume_recording' });
    if (!response?.ok) {
      appendActivity(response?.error || 'Could not resume recording.');
      return;
    }
    ui.session = response.session;
    ui.mode = 'recording';
    armSession(response.session);
    syncUi();
    appendActivity('Recording resumed.');
    if (!localRecorderRunning) {
      appendActivity('Reloading to restore document-start DOM instrumentation after a paused-page reload.');
      window.setTimeout(() => location.reload(), 100);
    }
  }

  async function stopRecordingOnly() {
    if (ui.mode !== 'recording' && ui.mode !== 'paused') return null;
    setText(ui.panel?.querySelector('[data-role="status"]'), 'Stopping recording…');
    // Give the existing content recorder one flush interval to persist its final
    // DOM/timing batch before the background session is detached.
    await new Promise((resolve) => setTimeout(resolve, 420));
    const response = await send({ action: 'stop_recording' });
    if (!response?.ok) {
      appendActivity(response?.error || 'Could not stop recording.');
      await refreshMode();
      return null;
    }
    ui.stoppedExportData = response;
    ui.session = null;
    ui.mode = 'stopped';
    disarmSession();
    writeStopped(response.session);
    syncUi();
    appendActivity('Recording stopped. Chrome debugger detached; captured data is kept until export or a new recording.');
    return response;
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

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
  function u32(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }

  function concatBytes(parts) {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
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
    constructor() { this.files = []; this.paths = new Set(); }
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
        centralParts.push(concatBytes([
          u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(time.time), u16(time.date),
          u32(crc), u32(file.bytes.length), u32(file.bytes.length), u16(name.length), u16(0), u16(0),
          u16(0), u16(0), u32(0), u32(offset), name
        ]));
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

  function buildZip(exportData) {
    const zip = new ZipBuilder();
    const events = Array.isArray(exportData.events) ? exportData.events : [];
    const byStream = (stream) => events.filter((event) => event.stream === stream);
    const bodies = byStream('network-body');
    const screenshots = byStream('marker-screenshot');
    const domSnapshots = byStream('marker-dom');

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
    zip.addText('network/cdp-events.ndjson', ndjson(byStream('cdp')));
    zip.addText('network/body-events.ndjson', ndjson(bodies.map((event) => ({
      ...event,
      data: event.type === 'response-body' ? { ...event.data, body: undefined, bodyStoredSeparately: true } : event.data
    }))));
    zip.addText('timeline/lifecycle.ndjson', ndjson(byStream('lifecycle')));
    zip.addText('timeline/interactions.ndjson', ndjson(byStream('interaction')));
    zip.addText('timeline/errors.ndjson', ndjson(byStream('error')));
    zip.addText('timeline/performance.ndjson', ndjson(byStream('performance')));
    zip.addText('timeline/recorder.ndjson', ndjson(byStream('recorder')));
    zip.addText('dom/mutations.ndjson', ndjson(byStream('dom-mutation')));
    zip.addText('dom/important-elements.ndjson', ndjson(byStream('important-state')));
    zip.addJson('markers/markers.json', [...byStream('marker'), ...byStream('marker-local')]);

    for (const event of bodies) {
      if (event.type !== 'response-body' || !event.data?.body) continue;
      const id = safeFilePart(event.data.requestId);
      if (event.data.base64Encoded) zip.addText(`network/response-bodies/${id}.base64.txt`, `${event.data.body}\n`);
      else zip.addText(`network/response-bodies/${id}.txt`, event.data.body);
    }
    for (const event of screenshots) {
      if (event.type === 'screenshot' && event.data?.data) {
        zip.addBytes(`markers/${safeFilePart(event.data.markerId)}/screenshot.png`, base64Bytes(event.data.data));
      }
    }
    for (const event of domSnapshots) {
      if (event.type === 'dom-snapshot' && event.data?.snapshot) {
        zip.addJson(`markers/${safeFilePart(event.data.markerId)}/dom-snapshot.json`, event.data.snapshot);
      }
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

  async function exportStopped() {
    let data = ui.stoppedExportData;
    const sessionId = data?.session?.sessionId || ui.stopped?.sessionId;
    if (!sessionId) return;
    setText(ui.panel?.querySelector('[data-role="status"]'), 'Packing diagnostic ZIP…');
    if (!data) data = await send({ action: 'export_stopped', sessionId });
    if (!data?.ok) {
      appendActivity(data?.error || 'Could not retrieve stopped recording.');
      syncUi();
      return;
    }
    try {
      const blob = buildZip(data);
      const started = data.session?.startedIso || new Date().toISOString();
      const filename = `etsy-bettersearch-diagnostic-${started.replace(/[:.]/g, '-').replace(/Z$/, 'Z')}.zip`;
      downloadBlob(blob, filename);
      await send({ action: 'finalize_export', sessionId });
      appendActivity(`Exported ${filename} (${Math.round(blob.size / 1024)} KiB).`);
      ui.stoppedExportData = null;
      writeStopped(null);
      ui.mode = 'idle';
      syncUi();
    } catch (error) {
      appendActivity(`Could not build diagnostic ZIP: ${error?.message || error}`);
      ui.mode = 'stopped';
      syncUi();
    }
  }

  async function stopAndExport() {
    if (ui.mode === 'recording' || ui.mode === 'paused') {
      const stopped = await stopRecordingOnly();
      if (!stopped) return;
    }
    await exportStopped();
  }

  async function cancelMarker() {
    const modal = ui.panel?.querySelector('[data-role="marker-modal"]');
    const markerId = modal?.dataset.markerId || '';
    if (!markerId) return;
    const sessionId = ui.session?.sessionId || ui.stopped?.sessionId || '';
    modal.hidden = true;
    modal.dataset.markerId = '';
    const request = { action: 'cancel_marker', markerId, sessionId };
    const first = await send(request);
    // Run a second cleanup after the content recorder's normal batching window in
    // case its local marker event was still queued when Cancel was pressed.
    setTimeout(() => void send(request), 650);
    appendActivity(first?.ok ? `Cancelled marker ${markerId}.` : `Marker cancel warning: ${first?.error || 'unknown error'}`);
  }

  function injectControlStyle() {
    if (document.getElementById(CONTROL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = CONTROL_STYLE_ID;
    style.textContent = `
      #${PANEL_ID}[data-collapsed="1"]{width:42px!important;min-width:42px!important;border-radius:10px!important}
      #${PANEL_ID}[data-collapsed="1"] header{width:42px!important;height:42px!important;padding:0!important;display:block!important;background:#202224!important}
      #${PANEL_ID}[data-collapsed="1"] header>span{display:none!important}
      #${PANEL_ID}[data-collapsed="1"] header>button{width:42px!important;height:42px!important;border-radius:0!important;display:grid!important;place-items:center!important}
      #${PANEL_ID}[data-collapsed="1"] .ebd-body{display:none!important}
      #${PANEL_ID} [data-role="marker-cancel"]{margin-right:auto}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureCancelButton(panel) {
    const actions = panel.querySelector('.ebd-note-actions');
    if (!actions || actions.querySelector('[data-role="marker-cancel"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ebd-secondary';
    button.dataset.role = 'marker-cancel';
    button.textContent = 'Cancel';
    actions.prepend(button);
  }

  function handlePanelClick(event) {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target || !ui.panel?.contains(target)) return;

    if (target.matches('[data-start="reload"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (ui.mode === 'recording' || ui.mode === 'paused') void stopRecordingOnly();
      else void startAndReload();
      return;
    }

    if (target.matches('[data-start="start"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (ui.mode === 'recording') void pauseRecording();
      else if (ui.mode === 'paused') void resumeRecording();
      return;
    }

    if (target.matches('[data-role="stop"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void stopAndExport();
      return;
    }

    if (target.matches('[data-role="marker-cancel"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void cancelMarker();
      return;
    }

    if (target.matches('[data-role="collapse"]') && (ui.mode === 'recording' || ui.mode === 'paused')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      forceOpenWhileActive();
    }
  }

  function install(panel) {
    if (ui.panel) return;
    ui.panel = panel;
    injectControlStyle();
    ensureCancelButton(panel);
    panel.addEventListener('click', handlePanelClick, true);
    new MutationObserver(() => {
      ensureCancelButton(panel);
      queueSync();
    }).observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'data-recording', 'data-collapsed', 'hidden'] });
    ui.stopped = readStopped();
    void refreshMode();
  }

  function waitForPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) install(panel);
    else requestAnimationFrame(waitForPanel);
  }

  waitForPanel();
})();
