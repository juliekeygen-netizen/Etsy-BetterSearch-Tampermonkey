'use strict';

// v0.2.6 page-side export replacement. It intercepts only the final
// Stop/Export button and leaves the recorder/control UX intact. Prepared files
// are read in bounded chunks and fed directly into ZIP file parts; the page never
// joins the complete recording into a single JavaScript string.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const encoder = new TextEncoder();
  let busy = false;

  function panel() { return document.getElementById(PANEL_ID); }

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

  function setStatus(text) {
    const node = panel()?.querySelector('[data-role="status-v2"], [data-role="status"]');
    if (node) node.textContent = text;
  }

  function appendActivity(message) {
    const pre = panel()?.querySelector('[data-role="activity"]');
    if (!pre) return;
    const existing = pre.textContent ? `${pre.textContent.trimEnd()}\n` : '';
    pre.textContent = `${existing}[${new Date().toLocaleTimeString()}] ${message}`.split('\n').slice(-80).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  function readStopped() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STOPPED_KEY) || 'null');
      return value?.sessionId ? value : null;
    } catch (_) { return null; }
  }

  function writeStopped(session) {
    if (!session?.sessionId) return;
    const value = {
      sessionId: session.sessionId,
      startedAt: Number(session.startedAt || 0),
      startedIso: session.startedIso || '',
      stoppedAt: Number(session.stoppedAt || Date.now()),
      stoppedIso: session.stoppedIso || new Date().toISOString()
    };
    try { sessionStorage.setItem(STOPPED_KEY, JSON.stringify(value)); } catch (_) {}
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
  function crcUpdate(state, bytes) {
    let crc = state;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return crc >>> 0;
  }
  function u16(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
  function u32(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
  function concatSmall(parts) {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }
  function dosTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function base64ChunkBytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  class StreamingZipBuilder {
    constructor() {
      this.files = [];
      this.paths = new Set();
    }

    addParts(path, parts) {
      const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
      if (!normalized || this.paths.has(normalized)) return;
      this.paths.add(normalized);
      let size = 0;
      let crcState = 0xffffffff;
      for (const part of parts) {
        size += part.length;
        crcState = crcUpdate(crcState, part);
      }
      this.files.push({
        path: normalized,
        parts,
        size,
        crc: (crcState ^ 0xffffffff) >>> 0,
        date: new Date()
      });
    }

    toBlob() {
      const localParts = [];
      const centralParts = [];
      let offset = 0;
      for (const file of this.files) {
        const name = encoder.encode(file.path);
        const stamp = dosTime(file.date);
        const flags = 0x0800;
        const local = concatSmall([
          u32(0x04034b50), u16(20), u16(flags), u16(0), u16(stamp.time), u16(stamp.date),
          u32(file.crc), u32(file.size), u32(file.size), u16(name.length), u16(0), name
        ]);
        localParts.push(local, ...file.parts);
        centralParts.push(concatSmall([
          u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(stamp.time), u16(stamp.date),
          u32(file.crc), u32(file.size), u32(file.size), u16(name.length), u16(0), u16(0),
          u16(0), u16(0), u32(0), u32(offset), name
        ]));
        offset += local.length + file.size;
      }
      const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
      const end = concatSmall([
        u32(0x06054b50), u16(0), u16(0), u16(this.files.length), u16(this.files.length),
        u32(centralSize), u32(offset), u16(0)
      ]);
      return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
    }
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

  async function loadPreparedFile(zip, sessionId, descriptor, fileIndex, fileCount) {
    const parts = [];
    const chunks = Math.max(0, Number(descriptor.chunkCount || 0));
    for (let index = 0; index < chunks; index++) {
      setStatus(`Reading ZIP file ${fileIndex + 1}/${fileCount} · chunk ${index + 1}/${chunks}`);
      const response = await send({
        action: 'stream_export_chunk',
        sessionId,
        path: descriptor.path,
        index
      });
      if (!response?.ok) throw new Error(response?.error || `Could not read ${descriptor.path} chunk ${index}.`);
      const encoding = response.encoding || descriptor.encoding || 'utf8';
      parts.push(encoding === 'base64' ? base64ChunkBytes(response.text || '') : encoder.encode(String(response.text || '')));
      if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    zip.addParts(descriptor.path, parts);
  }

  async function streamingExport(session) {
    const sessionId = String(session?.sessionId || '');
    if (!sessionId) throw new Error('Stopped diagnostic session ID is missing.');

    setStatus('Preparing bounded export files…');
    const prepared = await send({ action: 'prepare_stream_export', sessionId });
    if (!prepared?.ok) throw new Error(prepared?.error || 'Could not prepare the streaming export.');
    const files = Array.isArray(prepared.files) ? prepared.files : [];
    if (!files.length) throw new Error('Streaming exporter prepared no files.');

    const zip = new StreamingZipBuilder();
    for (let index = 0; index < files.length; index++) {
      await loadPreparedFile(zip, sessionId, files[index], index, files.length);
    }

    setStatus('Packing ZIP from bounded byte parts…');
    const blob = zip.toBlob();
    const started = prepared.startedIso || session.startedIso || new Date().toISOString();
    const filename = `etsy-bettersearch-diagnostic-${started.replace(/[:.]/g, '-').replace(/Z$/, 'Z')}.zip`;
    downloadBlob(blob, filename);
    appendActivity(`ZIP download requested: ${filename} (${Math.round(blob.size / 1024)} KiB). Streaming export avoided whole-recording JSON/string joins; captured data remains retained.`);
    setStatus('Export requested · data retained');
    await send({ action: 'clear_stream_export_cache', sessionId });
    return { filename, size: blob.size };
  }

  async function stopIfNeeded() {
    const state = await send({ action: 'get_state' });
    let stopped = state?.stopped || readStopped();
    let stoppedNow = false;
    if (state?.session?.recording || state?.session?.paused) {
      setStatus('Stopping recording…');
      // Match the existing control layer's grace period so its 350 ms recorder
      // flush has time to persist the final page events before debugger detach.
      await new Promise((resolve) => setTimeout(resolve, 420));
      const response = await send({ action: 'stop_recording' });
      if (!response?.ok) throw new Error(response?.error || 'Could not stop recording.');
      stopped = response.session;
      stoppedNow = true;
      writeStopped(stopped);
      appendActivity('Recording stopped. Starting bounded streaming export.');
    }
    if (!stopped?.sessionId) throw new Error('No stopped recording is available to export.');
    return { stopped, stoppedNow };
  }

  async function handleExportClick(event, button) {
    if (busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    busy = true;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    let stoppedNow = false;
    try {
      const resolved = await stopIfNeeded();
      stoppedNow = resolved.stoppedNow;
      await streamingExport(resolved.stopped);
      button.textContent = 'Export ZIP';
      button.disabled = false;
      // If this layer performed the Stop itself, the legacy control closure still
      // has its old in-memory mode. Reload only after the browser accepted the
      // download request so the normal get_state path rehydrates clean stopped UI
      // and tears down the page-side recorder observer.
      if (stoppedNow) setTimeout(() => location.reload(), 900);
    } catch (error) {
      appendActivity(`Export failed safely: ${error?.message || error}. The stopped recording is still retained; retry Export ZIP after updating/reloading Diagnostics.`);
      setStatus('Export failed · data retained');
      button.disabled = false;
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest(`#${PANEL_ID} [data-role="stop"]`) : null;
    if (!(target instanceof HTMLButtonElement)) return;
    void handleExportClick(event, target);
  }, true);
})();
