'use strict';

(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const PANEL_OPEN_KEY = 'ebsf-diagnostics:panel-open:v1';
  const CONTROL_STYLE_ID = `${PANEL_ID}-controls-style`;
  const encoder = new TextEncoder();

  const ui = {
    mode: 'idle', session: null, stopped: null, panel: null,
    syncQueued: false, busy: false, elapsedTimer: 0
  };

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          resolve(error ? { ok: false, error: error.message } : (response || { ok: false, error: 'No response from diagnostics background.' }));
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
    } catch (_) { return null; }
  }

  function writeStopped(session) {
    const value = session?.sessionId ? {
      sessionId: session.sessionId,
      startedAt: Number(session.startedAt || 0),
      startedIso: session.startedIso || '',
      stoppedAt: Number(session.stoppedAt || Date.now()),
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

  function hasArmedSession() {
    try { return Boolean(JSON.parse(sessionStorage.getItem(ARM_KEY) || 'null')?.sessionId); }
    catch (_) { return false; }
  }

  function readPanelOpen() {
    try { return sessionStorage.getItem(PANEL_OPEN_KEY) === '1'; }
    catch (_) { return false; }
  }

  function writePanelOpen(open) {
    try { sessionStorage.setItem(PANEL_OPEN_KEY, open ? '1' : '0'); } catch (_) {}
  }

  function readOptions(panel) {
    const checked = (role, fallback = true) => panel?.querySelector(`[data-role="${role}"]`)?.checked ?? fallback;
    return {
      captureNetwork: checked('network'), captureBodies: checked('bodies'),
      captureStaticBodies: checked('static-bodies', false), captureDom: checked('dom'),
      captureDomSnapshots: checked('dom-snapshots'), captureScreenshots: checked('screenshots'),
      captureInteractions: checked('interactions'), captureConsole: checked('console'),
      autoMarkers: checked('auto-markers'), captureFrameTrace: checked('frame-trace', false),
      captureBurstScreenshots: checked('burst-screenshots', false), semanticMarkers: checked('semantic-markers', false),
      bodyLimitBytes: 5 * 1024 * 1024
    };
  }

  // `controls.js` is the final recorder-panel owner.  Its replacement panel is
  // created with unchecked opt-in fields after a Record & Reload navigation, so
  // reflect the already-authoritative background session before the controls
  // are locked.  Otherwise the panel can claim that the rapid capture modes
  // are off even while a session has them enabled.
  function restoreActiveSessionOptions(options) {
    if (!ui.panel || !options || typeof options !== 'object') return;
    const optionRoles = {
      captureNetwork: 'network', captureBodies: 'bodies', captureStaticBodies: 'static-bodies',
      captureDom: 'dom', captureDomSnapshots: 'dom-snapshots', captureScreenshots: 'screenshots',
      captureInteractions: 'interactions', captureConsole: 'console', autoMarkers: 'auto-markers',
      captureFrameTrace: 'frame-trace', captureBurstScreenshots: 'burst-screenshots', semanticMarkers: 'semantic-markers'
    };
    for (const [option, role] of Object.entries(optionRoles)) {
      if (typeof options[option] !== 'boolean') continue;
      const input = ui.panel.querySelector(`[data-role="${role}"]`);
      if (input && input.checked !== options[option]) input.checked = options[option];
    }
  }

  function setText(node, value) { if (node && node.textContent !== value) node.textContent = value; }
  function setDisabled(node, value) { if (node && node.disabled !== Boolean(value)) node.disabled = Boolean(value); }

  function appendActivity(message) {
    const pre = ui.panel?.querySelector('[data-role="activity"]');
    if (!pre) return;
    const existing = pre.textContent ? `${pre.textContent.trimEnd()}\n` : '';
    pre.textContent = `${existing}[${new Date().toLocaleTimeString()}] ${message}`.split('\n').slice(-80).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  function applyPanelOpen(open, remember = true) {
    if (!ui.panel) return;
    ui.panel.dataset.collapsed = open ? '0' : '1';
    const collapse = ui.panel.querySelector('[data-role="collapse"]');
    setText(collapse, open ? '—' : '+');
    collapse?.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
    if (remember) writePanelOpen(open);
  }

  function setStatus(text) { setText(ui.panel?.querySelector('[data-role="status-v2"]'), text); }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function currentElapsedMs() {
    const session = ui.session || ui.stopped;
    const startedAt = Number(session?.startedAt || 0);
    if (!startedAt) return 0;
    if (ui.mode === 'paused') return Math.max(0, Number(ui.session?.pausedAt || Date.now()) - startedAt);
    if (ui.mode === 'stopped') return Math.max(0, Number(ui.stopped?.stoppedAt || Date.now()) - startedAt);
    return Math.max(0, Date.now() - startedAt);
  }

  function updateElapsed() { setText(ui.panel?.querySelector('[data-role="elapsed-v2"]'), formatDuration(currentElapsedMs())); }
  function ensureElapsedTimer() { if (!ui.elapsedTimer) ui.elapsedTimer = setInterval(updateElapsed, 200); }

  function syncUi() {
    ui.syncQueued = false;
    const panel = ui.panel;
    if (!panel) return;
    restoreActiveSessionOptions(ui.session?.options);
    const reload = panel.querySelector('[data-start="reload"]');
    const pause = panel.querySelector('[data-start="start"]');
    const marker = panel.querySelector('[data-role="marker"]');
    const stopExport = panel.querySelector('[data-role="stop"]');
    const active = ui.mode === 'recording' || ui.mode === 'paused';

    panel.dataset.recording = active ? '1' : '0';
    for (const input of panel.querySelectorAll('[data-option]')) input.disabled = active || ui.busy;
    if (ui.busy) {
      [reload, pause, marker, stopExport].forEach((node) => setDisabled(node, true));
      updateElapsed();
      return;
    }

    if (ui.mode === 'recording') {
      setText(reload, 'Stop recording'); setDisabled(reload, false);
      setText(pause, 'Pause'); setDisabled(pause, false); setDisabled(marker, false);
      setText(stopExport, 'Stop & Export ZIP'); setDisabled(stopExport, false); setStatus('● Recording');
    } else if (ui.mode === 'paused') {
      setText(reload, 'Stop recording'); setDisabled(reload, false);
      setText(pause, 'Resume'); setDisabled(pause, false); setDisabled(marker, true);
      setText(stopExport, 'Stop & Export ZIP'); setDisabled(stopExport, false); setStatus('Paused');
    } else if (ui.mode === 'stopped') {
      setText(reload, 'Record & Reload'); setDisabled(reload, false);
      setText(pause, 'Pause'); setDisabled(pause, true); setDisabled(marker, true);
      setText(stopExport, 'Export ZIP'); setDisabled(stopExport, false); setStatus('Stopped · ready to export');
    } else {
      setText(reload, 'Record & Reload'); setDisabled(reload, false);
      setText(pause, 'Pause'); setDisabled(pause, true); setDisabled(marker, true);
      setText(stopExport, 'Stop & Export ZIP'); setDisabled(stopExport, true); setStatus('Ready');
    }
    updateElapsed();
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
    if (response?.stopped?.sessionId) writeStopped(response.stopped);
    if (active?.paused) ui.mode = 'paused';
    else if (active?.recording) ui.mode = 'recording';
    else if (ui.stopped?.sessionId) ui.mode = 'stopped';
    else ui.mode = 'idle';

    // Idle reloads remember exactly what the user chose. Active reloads open the
    // panel once so recording state is visible, but do not overwrite preference.
    applyPanelOpen(active?.recording || active?.paused ? true : readPanelOpen(), false);
    syncUi();
  }

  async function discardStoppedIfNeeded() {
    if (!ui.stopped?.sessionId) return true;
    if (!confirm('A stopped diagnostics recording is still saved. Start a new recording and discard it?')) return false;
    const response = await send({ action: 'finalize_export', sessionId: ui.stopped.sessionId });
    if (!response?.ok) { appendActivity(response?.error || 'Could not discard the previous stopped recording.'); return false; }
    writeStopped(null);
    return true;
  }

  async function startAndReload() {
    if (ui.busy || !(await discardStoppedIfNeeded())) return;
    ui.busy = true; setStatus('Attaching Chrome debugger…'); syncUi();
    const response = await send({ action: 'start_recording', options: readOptions(ui.panel) });
    ui.busy = false;
    if (!response?.ok) { ui.mode = 'idle'; syncUi(); appendActivity(response?.error || 'Could not start recording.'); return; }
    ui.session = response.session; ui.mode = 'recording'; armSession(response.session); writeStopped(null); syncUi();
    appendActivity(`Recording ${response.session.sessionId}; reloading page.`);
    setTimeout(() => location.reload(), 80);
  }

  async function pauseRecording() {
    if (ui.busy) return;
    const response = await send({ action: 'pause_recording' });
    if (!response?.ok) { appendActivity(response?.error || 'Could not pause recording.'); return; }
    ui.session = response.session; ui.mode = 'paused'; syncUi(); appendActivity('Recording paused.');
  }

  async function resumeRecording() {
    if (ui.busy) return;
    const needsDocumentReload = !hasArmedSession();
    const response = await send({ action: 'resume_recording' });
    if (!response?.ok) { appendActivity(response?.error || 'Could not resume recording.'); return; }
    ui.session = response.session; ui.mode = 'recording'; armSession(response.session); syncUi(); appendActivity('Recording resumed.');
    if (needsDocumentReload) {
      appendActivity('Reloading once to restore document-start DOM capture after the page was refreshed while paused.');
      setTimeout(() => location.reload(), 100);
    }
  }

  async function stopRecordingOnly() {
    if (ui.busy || (ui.mode !== 'recording' && ui.mode !== 'paused')) return null;
    ui.busy = true; setStatus('Stopping recording…'); syncUi();
    await new Promise((resolve) => setTimeout(resolve, 420));
    const response = await send({ action: 'stop_recording' });
    ui.busy = false;
    if (!response?.ok) { appendActivity(response?.error || 'Could not stop recording.'); await refreshMode(); return null; }
    ui.session = null; ui.mode = 'stopped'; disarmSession(); writeStopped(response.session); syncUi();
    appendActivity('Recording stopped. Captured data is retained until you explicitly start a new recording.');
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
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function u16(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
  function u32(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]); }
  function concatBytes(parts) { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
  function dosTime(date = new Date()) { const y = Math.max(1980, date.getFullYear()); return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }

  class ZipBuilder {
    constructor() { this.files = []; this.paths = new Set(); }
    addBytes(path, bytes) { const n = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/'); if (!n || this.paths.has(n)) return; this.paths.add(n); this.files.push({ path: n, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), date: new Date() }); }
    addText(path, text) { this.addBytes(path, encoder.encode(String(text))); }
    addJson(path, value) { this.addText(path, `${JSON.stringify(value, null, 2)}\n`); }
    toBlob() {
      const localParts = [], centralParts = []; let offset = 0;
      for (const file of this.files) {
        const name = encoder.encode(file.path), crc = crc32(file.bytes), t = dosTime(file.date), flags = 0x0800;
        const local = concatBytes([u32(0x04034b50), u16(20), u16(flags), u16(0), u16(t.time), u16(t.date), u32(crc), u32(file.bytes.length), u32(file.bytes.length), u16(name.length), u16(0), name]);
        localParts.push(local, file.bytes);
        centralParts.push(concatBytes([u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(t.time), u16(t.date), u32(crc), u32(file.bytes.length), u32(file.bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
        offset += local.length + file.bytes.length;
      }
      const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
      return new Blob([...localParts, ...centralParts, concatBytes([u32(0x06054b50), u16(0), u16(0), u16(this.files.length), u16(this.files.length), u32(centralSize), u32(offset), u16(0)])], { type: 'application/zip' });
    }
  }

  function ndjson(events) { return events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''); }
  function base64Bytes(value) { const b = atob(String(value || '')), out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }
  function safeFilePart(value) { return String(value || 'item').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item'; }

  function buildZip(data) {
    const zip = new ZipBuilder(), events = Array.isArray(data.events) ? data.events : [], by = (s) => events.filter((e) => e.stream === s);
    const bodies = by('network-body'), screenshots = by('marker-screenshot'), domSnapshots = by('marker-dom');
    zip.addJson('manifest.json', { format: 'etsy-bettersearch-diagnostics', formatVersion: 1, generatedAt: new Date().toISOString(), session: data.session, files: { har: 'network/network.har', cdp: 'network/cdp-events.ndjson', mutations: 'dom/mutations.ndjson', importantStates: 'dom/important-elements.ndjson', markers: 'markers/markers.json' } });
    zip.addJson('summary.json', data.summary || {}); zip.addJson('network/network.har', data.har || { log: { version: '1.2', creator: {}, entries: [] } });
    zip.addText('network/cdp-events.ndjson', ndjson(by('cdp'))); zip.addText('network/body-events.ndjson', ndjson(bodies.map((e) => ({ ...e, data: e.type === 'response-body' ? { ...e.data, body: undefined, bodyStoredSeparately: true } : e.data }))));
    zip.addText('timeline/lifecycle.ndjson', ndjson(by('lifecycle'))); zip.addText('timeline/interactions.ndjson', ndjson(by('interaction'))); zip.addText('timeline/errors.ndjson', ndjson(by('error'))); zip.addText('timeline/performance.ndjson', ndjson(by('performance'))); zip.addText('timeline/recorder.ndjson', ndjson(by('recorder'))); zip.addText('dom/mutations.ndjson', ndjson(by('dom-mutation'))); zip.addText('dom/important-elements.ndjson', ndjson(by('important-state'))); zip.addJson('markers/markers.json', [...by('marker'), ...by('marker-local')]);
    for (const e of bodies) if (e.type === 'response-body' && e.data?.body) { const id = safeFilePart(e.data.requestId); zip.addText(`network/response-bodies/${id}.${e.data.base64Encoded ? 'base64.txt' : 'txt'}`, e.data.base64Encoded ? `${e.data.body}\n` : e.data.body); }
    for (const e of screenshots) if (e.type === 'screenshot' && e.data?.data) zip.addBytes(`markers/${safeFilePart(e.data.markerId)}/screenshot.png`, base64Bytes(e.data.data));
    for (const e of domSnapshots) if (e.type === 'dom-snapshot' && e.data?.snapshot) zip.addJson(`markers/${safeFilePart(e.data.markerId)}/dom-snapshot.json`, e.data.snapshot);
    return zip.toBlob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none'; document.documentElement.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function readPreparedExport(sessionId, chunkCount) {
    const parts = [];
    for (let i = 0; i < chunkCount; i++) {
      setStatus(`Reading export data · ${i + 1}/${chunkCount}`);
      const response = await send({ action: 'export_chunk', sessionId, index: i });
      if (!response?.ok) throw new Error(response?.error || `Could not read export chunk ${i}.`);
      parts.push(String(response.text || ''));
      if (i % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return JSON.parse(parts.join(''));
  }

  async function exportStopped() {
    const sessionId = ui.stopped?.sessionId;
    if (!sessionId || ui.busy) return;
    ui.busy = true; setStatus('Preparing diagnostic export…'); syncUi();
    try {
      const prepared = await send({ action: 'prepare_export', sessionId });
      if (!prepared?.ok) throw new Error(prepared?.error || 'Could not prepare the stopped recording.');
      const data = await readPreparedExport(sessionId, Number(prepared.chunkCount || 0));
      setStatus('Packing diagnostic ZIP…');
      const blob = buildZip(data), started = data.session?.startedIso || ui.stopped?.startedIso || new Date().toISOString();
      const filename = `etsy-bettersearch-diagnostic-${started.replace(/[:.]/g, '-').replace(/Z$/, 'Z')}.zip`;
      downloadBlob(blob, filename);
      appendActivity(`ZIP download requested: ${filename} (${Math.round(blob.size / 1024)} KiB). The stopped data is still retained so you can export again if Chrome blocks or loses the download.`);
      setStatus('Export requested · data retained'); ui.mode = 'stopped';
    } catch (error) {
      appendActivity(`Export failed safely: ${error?.message || error}. The stopped recording is still retained and can be retried after refresh.`);
      setStatus('Export failed · data retained'); ui.mode = 'stopped';
    } finally { ui.busy = false; syncUi(); }
  }

  async function stopAndExport() { if (ui.mode === 'recording' || ui.mode === 'paused') { if (!(await stopRecordingOnly())) return; } await exportStopped(); }

  async function cancelMarker() {
    const modal = ui.panel?.querySelector('[data-role="marker-modal"]'), markerId = modal?.dataset.markerId || '';
    if (!markerId) return;
    const request = { action: 'cancel_marker', markerId, sessionId: ui.session?.sessionId || ui.stopped?.sessionId || '' };
    modal.hidden = true; modal.dataset.markerId = '';
    const first = await send(request); setTimeout(() => void send(request), 650);
    appendActivity(first?.ok ? `Cancelled marker ${markerId}.` : `Marker cancel warning: ${first?.error || 'unknown error'}`);
  }

  function injectControlStyle() {
    if (document.getElementById(CONTROL_STYLE_ID)) return;
    const style = document.createElement('style'); style.id = CONTROL_STYLE_ID;
    style.textContent = `
      #${PANEL_ID}[data-collapsed="1"]{width:36px!important;min-width:36px!important;height:36px!important;min-height:36px!important;border-radius:10px!important}
      #${PANEL_ID}[data-collapsed="1"] header{position:relative!important;width:36px!important;height:36px!important;padding:0!important;display:block!important;background:#202224!important}
      #${PANEL_ID}[data-collapsed="1"] header>span{display:none!important}
      #${PANEL_ID}[data-collapsed="1"] header>button{position:absolute!important;right:0!important;bottom:0!important;width:42px!important;height:42px!important;border-radius:0!important;display:grid!important;place-items:center!important}
      #${PANEL_ID}[data-collapsed="1"] .ebd-body{display:none!important}
      #${PANEL_ID} [data-role="marker-cancel"]{margin-right:auto}
      #${PANEL_ID} [data-role="status-core"],#${PANEL_ID} [data-role="elapsed-core"]{display:none!important}
      #${PANEL_ID}[data-recording="1"] [data-role="status-v2"]{color:#ff9d8f;font-weight:800}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureOwnedStatus(panel) {
    const row = panel.querySelector('.ebd-status'); if (!row || row.querySelector('[data-role="status-v2"]')) return;
    const oldStatus = row.querySelector('[data-role="status"]'), oldElapsed = row.querySelector('[data-role="elapsed"]');
    if (oldStatus) oldStatus.dataset.role = 'status-core'; if (oldElapsed) oldElapsed.dataset.role = 'elapsed-core';
    const status = document.createElement('span'), elapsed = document.createElement('span'); status.dataset.role = 'status-v2'; status.textContent = 'Ready'; elapsed.dataset.role = 'elapsed-v2'; elapsed.textContent = '0:00'; row.prepend(status); row.append(elapsed);
  }

  function ensureCancelButton(panel) {
    const actions = panel.querySelector('.ebd-note-actions'); if (!actions || actions.querySelector('[data-role="marker-cancel"]')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ebd-secondary'; button.dataset.role = 'marker-cancel'; button.textContent = 'Cancel'; actions.prepend(button);
  }

  function handlePanelClick(event) {
    const target = event.target instanceof Element ? event.target.closest('button') : null; if (!target || !ui.panel?.contains(target)) return;
    if (target.matches('[data-role="collapse"]')) { event.preventDefault(); event.stopImmediatePropagation(); applyPanelOpen(ui.panel.dataset.collapsed === '1', true); return; }
    if (target.matches('[data-start="reload"]')) { event.preventDefault(); event.stopImmediatePropagation(); if (ui.mode === 'recording' || ui.mode === 'paused') void stopRecordingOnly(); else void startAndReload(); return; }
    if (target.matches('[data-start="start"]')) { event.preventDefault(); event.stopImmediatePropagation(); if (ui.mode === 'recording') void pauseRecording(); else if (ui.mode === 'paused') void resumeRecording(); return; }
    if (target.matches('[data-role="stop"]')) { event.preventDefault(); event.stopImmediatePropagation(); void stopAndExport(); return; }
    if (target.matches('[data-role="marker-cancel"]')) { event.preventDefault(); event.stopImmediatePropagation(); void cancelMarker(); }
  }

  function install(panel) {
    if (ui.panel) return;
    ui.panel = panel; injectControlStyle(); ensureOwnedStatus(panel); ensureCancelButton(panel); applyPanelOpen(readPanelOpen(), false); panel.addEventListener('click', handlePanelClick, true);
    new MutationObserver(() => { ensureOwnedStatus(panel); ensureCancelButton(panel); queueSync(); }).observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'data-recording', 'data-collapsed', 'hidden'] });
    ui.stopped = readStopped(); ensureElapsedTimer(); void refreshMode();
  }

  function waitForPanel() { const panel = document.getElementById(PANEL_ID); if (panel) install(panel); else requestAnimationFrame(waitForPanel); }
  waitForPanel();
})();
