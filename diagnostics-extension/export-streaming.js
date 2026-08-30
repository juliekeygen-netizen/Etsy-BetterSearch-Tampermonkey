'use strict';

// v0.2.8 page-side recorder lifecycle + bounded, compressed ZIP export.
//
// Stop & Export is transactional: stop, build/download the bounded ZIP, verify
// backend cleanup, then reload into a clean Ready-to-record state. Export
// failure keeps the stopped capture for retry. Text-heavy forensic files use
// lossless raw DEFLATE when the browser supports it; incompressible/binary files
// and any compression failure safely fall back to ZIP STORE.
(() => {
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const STOPPED_KEY = 'ebsf-diagnostics:stopped:v1';
  const STYLE_ID = `${PANEL_ID}-lifecycle-v027-style`;
  const encoder = new TextEncoder();
  const ZIP32_MAX = 0xffffffff;
  const ZIP16_MAX = 0xffff;
  const ZIP_DEFLATE_METHOD = 8;
  const ZIP_STORE_METHOD = 0;
  const COMPRESS_MIN_BYTES = 1024;
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

  function setElapsedZero() {
    const root = panel();
    for (const node of root?.querySelectorAll?.('[data-role="elapsed-v2"], [data-role="elapsed-core"], [data-role="elapsed"]') || []) {
      node.textContent = '0:00';
    }
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

  function clearLocalSessionHints() {
    try {
      sessionStorage.removeItem(ARM_KEY);
      sessionStorage.removeItem(STOPPED_KEY);
    } catch (_) {}
  }

  function installLifecycleStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}[data-recording="1"] [data-start="reload"]{
        font-size:0!important;
      }
      #${PANEL_ID}[data-recording="1"] [data-start="reload"]::after{
        content:"Cancel";
        font-size:13px;
        line-height:inherit;
      }
      #${PANEL_ID}[data-ebsf-lifecycle-ready="1"][data-recording="0"] [data-role="status-v2"]{
        font-size:0!important;
      }
      #${PANEL_ID}[data-ebsf-lifecycle-ready="1"][data-recording="0"] [data-role="status-v2"]::after{
        content:"Ready to record";
        font-size:13px;
        line-height:inherit;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function markReadyVisual() {
    const root = panel();
    if (!root) return;
    root.dataset.ebsfLifecycleReady = '1';
    setStatus('Ready to record');
    setElapsedZero();
  }

  function clearReadyVisual() {
    const root = panel();
    if (root) delete root.dataset.ebsfLifecycleReady;
  }

  async function refreshVisualState() {
    const root = panel();
    if (!root) return;
    const state = await send({ action: 'get_state' });
    if (state?.session?.recording || state?.session?.paused || state?.stopped?.sessionId) {
      clearReadyVisual();
      return;
    }
    try { sessionStorage.removeItem(STOPPED_KEY); } catch (_) {}
    markReadyVisual();
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

  function u16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function u32(value) {
    const v = Number(value) >>> 0;
    return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  }

  function u64(value) {
    let v = BigInt(Math.max(0, Number(value)));
    const out = new Uint8Array(8);
    for (let index = 0; index < 8; index++) {
      out[index] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function concatSmall(parts) {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function dosTime(date = new Date()) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function normalizeZipPath(path) {
    const normalized = String(path || '').normalize?.('NFC') || String(path || '');
    const segments = normalized.replace(/\\/g, '/').split('/');
    const cleaned = [];
    for (const raw of segments) {
      if (!raw || raw === '.' || raw === '..') continue;
      const segment = raw
        .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 180) || '_';
      cleaned.push(segment);
    }
    return cleaned.join('/').slice(0, 1200) || 'recovered-item';
  }

  function base64ChunkBytes(value) {
    let text = String(value || '').replace(/\s+/g, '');
    if (text.length % 4) text += '='.repeat(4 - (text.length % 4));
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function zip64Extra(values) {
    if (!values.length) return new Uint8Array(0);
    const data = concatSmall(values.map((value) => u64(value)));
    return concatSmall([u16(0x0001), u16(data.length), data]);
  }

  function zipPathCompressible(path) {
    return /\.(?:json|ndjson|jsonl|har|txt|html?|css|js|mjs|csv|tsv|xml|svg|md|log|map)$/i.test(String(path || ''));
  }

  async function deflateRawParts(parts) {
    if (typeof CompressionStream !== 'function') return null;
    try {
      const stream = new Blob(parts).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (_) {
      return null;
    }
  }

  class StreamingZipBuilder {
    constructor() {
      this.files = [];
      this.paths = new Set();
    }

    addParts(path, parts) {
      let normalized = normalizeZipPath(path);
      if (this.paths.has(normalized)) {
        const slash = normalized.lastIndexOf('/');
        const dir = slash >= 0 ? normalized.slice(0, slash + 1) : '';
        const leaf = slash >= 0 ? normalized.slice(slash + 1) : normalized;
        const dot = leaf.lastIndexOf('.');
        const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
        const ext = dot > 0 ? leaf.slice(dot) : '';
        let number = 2;
        while (this.paths.has(`${dir}${stem}-${number}${ext}`)) number++;
        normalized = `${dir}${stem}-${number}${ext}`;
      }
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
        compressedSize: size,
        method: ZIP_STORE_METHOD,
        crc: (crcState ^ 0xffffffff) >>> 0,
        date: new Date()
      });
    }

    async prepareCompression(onProgress = () => {}) {
      let rawBytes = 0;
      let packedBytes = 0;
      let deflatedFiles = 0;
      const supported = typeof CompressionStream === 'function';

      for (let index = 0; index < this.files.length; index++) {
        const file = this.files[index];
        rawBytes += file.size;
        onProgress({ index, count:this.files.length, path:file.path, rawBytes, packedBytes, supported });

        if (supported && file.size >= COMPRESS_MIN_BYTES && zipPathCompressible(file.path)) {
          const compressed = await deflateRawParts(file.parts);
          if (compressed && compressed.length < file.size) {
            file.parts = [compressed];
            file.compressedSize = compressed.length;
            file.method = ZIP_DEFLATE_METHOD;
            deflatedFiles += 1;
          }
        }
        packedBytes += file.compressedSize;
        if (index % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return { rawBytes, packedBytes, deflatedFiles, supported };
    }

    toBlob() {
      const localParts = [];
      const centralParts = [];
      let offset = 0;
      for (const file of this.files) {
        const name = encoder.encode(file.path);
        const stamp = dosTime(file.date);
        const flags = 0x0800;
        const compressedSize = Number(file.compressedSize) || 0;
        const uncompressedLarge = file.size > ZIP32_MAX;
        const compressedLarge = compressedSize > ZIP32_MAX;
        const largeSize = uncompressedLarge || compressedLarge;
        const localZip64Values = [];
        if (uncompressedLarge) localZip64Values.push(file.size);
        if (compressedLarge) localZip64Values.push(compressedSize);
        const localExtra = zip64Extra(localZip64Values);
        const localVersion = largeSize ? 45 : 20;
        const local = concatSmall([
          u32(0x04034b50), u16(localVersion), u16(flags), u16(file.method), u16(stamp.time), u16(stamp.date),
          u32(file.crc), u32(compressedLarge ? ZIP32_MAX : compressedSize), u32(uncompressedLarge ? ZIP32_MAX : file.size),
          u16(name.length), u16(localExtra.length), name, localExtra
        ]);
        localParts.push(local, ...file.parts);

        const largeOffset = offset > ZIP32_MAX;
        const centralZip64Values = [];
        if (uncompressedLarge) centralZip64Values.push(file.size);
        if (compressedLarge) centralZip64Values.push(compressedSize);
        if (largeOffset) centralZip64Values.push(offset);
        const centralExtra = zip64Extra(centralZip64Values);
        const centralVersion = largeSize || largeOffset ? 45 : 20;
        centralParts.push(concatSmall([
          u32(0x02014b50), u16(centralVersion), u16(centralVersion), u16(flags), u16(file.method),
          u16(stamp.time), u16(stamp.date), u32(file.crc),
          u32(compressedLarge ? ZIP32_MAX : compressedSize), u32(uncompressedLarge ? ZIP32_MAX : file.size),
          u16(name.length), u16(centralExtra.length), u16(0), u16(0), u16(0), u32(0),
          u32(largeOffset ? ZIP32_MAX : offset), name, centralExtra
        ]));
        offset += local.length + compressedSize;
        if (!Number.isSafeInteger(offset)) throw new Error('ZIP grew beyond JavaScript safe-integer addressing.');
      }

      const centralOffset = offset;
      const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
      const needsZip64 = this.files.length >= ZIP16_MAX || centralOffset > ZIP32_MAX || centralSize > ZIP32_MAX;
      const endingParts = [];
      if (needsZip64) {
        const zip64EocdOffset = centralOffset + centralSize;
        endingParts.push(concatSmall([
          u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0),
          u64(this.files.length), u64(this.files.length), u64(centralSize), u64(centralOffset)
        ]));
        endingParts.push(concatSmall([
          u32(0x07064b50), u32(0), u64(zip64EocdOffset), u32(1)
        ]));
      }
      endingParts.push(concatSmall([
        u32(0x06054b50), u16(0), u16(0),
        u16(needsZip64 ? ZIP16_MAX : this.files.length), u16(needsZip64 ? ZIP16_MAX : this.files.length),
        u32(needsZip64 ? ZIP32_MAX : centralSize), u32(needsZip64 ? ZIP32_MAX : centralOffset), u16(0)
      ]));
      return new Blob([...localParts, ...centralParts, ...endingParts], { type: 'application/zip' });
    }
  }

  function safeDownloadFilename(started) {
    const value = String(started || new Date().toISOString()).normalize?.('NFC') || String(started || new Date().toISOString());
    const safe = value
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 160) || Date.now().toString();
    return `etsy-bettersearch-diagnostic-${safe}.zip`;
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

  async function fetchPreparedChunk(sessionId, descriptor, index) {
    const response = await send({
      action: 'stream_export_chunk',
      sessionId,
      path: descriptor.path,
      index
    });
    if (!response?.ok) throw new Error(response?.error || `Could not read ${descriptor.path} chunk ${index}.`);
    return response;
  }

  async function loadPreparedFile(zip, sessionId, descriptor, fileIndex, fileCount) {
    const chunks = Math.max(0, Number(descriptor.chunkCount || 0));
    const encoding = descriptor.encoding || 'utf8';
    const parts = [];
    let base64Failed = false;

    for (let index = 0; index < chunks; index++) {
      setStatus(`Reading ZIP file ${fileIndex + 1}/${fileCount} · chunk ${index + 1}/${chunks}`);
      const response = await fetchPreparedChunk(sessionId, descriptor, index);
      if (encoding === 'base64') {
        try { parts.push(base64ChunkBytes(response.text || '')); }
        catch (_) { base64Failed = true; break; }
      } else {
        parts.push(encoder.encode(String(response.text || '')));
      }
      if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (!base64Failed) {
      zip.addParts(descriptor.path, parts);
      return;
    }

    appendActivity(`Warning: ${descriptor.path} contained invalid base64; preserving its raw data as a recovery text file instead of aborting the ZIP.`);
    const recoveryParts = [];
    for (let index = 0; index < chunks; index++) {
      const response = await fetchPreparedChunk(sessionId, descriptor, index);
      recoveryParts.push(encoder.encode(String(response.text || '')));
    }
    zip.addParts(`${descriptor.path}.base64-recovery.txt`, recoveryParts);
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

    setStatus('Compressing ZIP losslessly…');
    const compression = await zip.prepareCompression(({ index, count, path }) => {
      setStatus(`Compressing ZIP ${index + 1}/${count} · ${path}`);
    });
    if (compression.deflatedFiles) {
      const percent = compression.rawBytes > 0
        ? Math.max(0, Math.round((1 - compression.packedBytes / compression.rawBytes) * 100))
        : 0;
      appendActivity(`Lossless ZIP compression: ${compression.deflatedFiles} file(s) deflated; payload reduced by about ${percent}% before ZIP headers.`);
    } else if (!compression.supported) {
      appendActivity('Browser raw-DEFLATE support unavailable; ZIP safely fell back to uncompressed STORE entries.');
    }

    setStatus('Packing ZIP from bounded byte parts…');
    const blob = zip.toBlob();
    const filename = safeDownloadFilename(prepared.startedIso || session.startedIso);
    downloadBlob(blob, filename);
    appendActivity(`ZIP download requested: ${filename} (${Math.round(blob.size / 1024)} KiB).`);

    setStatus('Clearing exported recording…');
    const finalized = await send({ action: 'finalize_stream_export', sessionId });
    if (!finalized?.ok) {
      throw new Error(finalized?.error || 'ZIP download was requested, but diagnostics storage cleanup failed.');
    }
    clearLocalSessionHints();
    appendActivity('Export complete. The exported recording and temporary export cache were cleared.');
    return { filename, size: blob.size };
  }

  async function stopIfNeeded() {
    const state = await send({ action: 'get_state' });
    let stopped = state?.stopped || readStopped();
    let stoppedNow = false;
    if (state?.session?.recording || state?.session?.paused) {
      clearReadyVisual();
      setStatus('Stopping recording…');
      await new Promise((resolve) => setTimeout(resolve, 650));
      const response = await send({ action: 'stop_recording' });
      if (!response?.ok) throw new Error(response?.error || 'Could not stop recording.');
      stopped = response.session;
      stoppedNow = true;
      writeStopped(stopped);
      appendActivity('Recording stopped. Starting bounded ZIP export.');
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
      markReadyVisual();
      setElapsedZero();
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      appendActivity(`Export failed safely: ${error?.message || error}. The stopped recording is retained whenever cleanup did not complete; retry Export ZIP after reloading Diagnostics.`);
      setStatus('Export failed · data retained');
      clearReadyVisual();
      button.disabled = false;
      if (stoppedNow) setTimeout(() => location.reload(), 900);
    } finally {
      busy = false;
    }
  }

  async function handleCancelClick(event, button) {
    const root = panel();
    if (!root || root.dataset.recording !== '1') return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return true;

    const confirmed = confirm('Cancel this diagnostics recording? All captured data will be permanently discarded and no ZIP will be exported.');
    if (!confirmed) return true;

    busy = true;
    button.disabled = true;
    clearReadyVisual();
    setStatus('Cancelling recording…');
    try {
      const state = await send({ action: 'get_state' });
      const sessionId = String(state?.session?.sessionId || readStopped()?.sessionId || '');
      if (!sessionId) throw new Error('Active diagnostic session ID is missing.');
      const discarded = await send({ action: 'discard_stream_recording', sessionId });
      if (!discarded?.ok) throw new Error(discarded?.error || 'Could not discard the recording.');

      globalThis.__EBSF_DIAG_TRANSPORT__?.setCaptureEnabled(false);
      clearLocalSessionHints();
      appendActivity('Recording cancelled. Captured diagnostic data was discarded; nothing was exported.');
      markReadyVisual();
      setElapsedZero();
      setTimeout(() => location.reload(), 300);
    } catch (error) {
      appendActivity(`Cancel failed: ${error?.message || error}. The recording was not reported as discarded.`);
      setStatus('Cancel failed');
      button.disabled = false;
    } finally {
      busy = false;
    }
    return true;
  }

  function install() {
    installLifecycleStyle();

    document.addEventListener('click', (event) => {
      const exportButton = event.target instanceof Element
        ? event.target.closest(`#${PANEL_ID} [data-role="stop"]`)
        : null;
      if (exportButton instanceof HTMLButtonElement) {
        void handleExportClick(event, exportButton);
        return;
      }

      const recordButton = event.target instanceof Element
        ? event.target.closest(`#${PANEL_ID} [data-start="reload"]`)
        : null;
      if (recordButton instanceof HTMLButtonElement && panel()?.dataset.recording === '1') {
        void handleCancelClick(event, recordButton);
      }
    }, true);

    const wait = () => {
      if (!panel()) {
        requestAnimationFrame(wait);
        return;
      }
      void refreshVisualState();
    };
    wait();
  }

  install();
})();
