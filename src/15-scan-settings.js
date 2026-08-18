'use strict';

var SCAN_SETTINGS_KEYS = Object.freeze({
  preset: 'etsy-bettersearch.scanPreset',
  custom: 'etsy-bettersearch.scanCustom',
});

var SCAN_PRESETS = Object.freeze({
  safe: Object.freeze({ concurrency: 1, spacingMs: 250, scanOrder: 'roundRobin', maxPages: 0, stopAfter: 0, pageRetries: 2, scanRetries: 3, retryProfile: 'patient', adaptiveSlowdown: true, showPartial: false, reuseCurrentPage: true }),
  balanced: Object.freeze({ concurrency: 3, spacingMs: 0, scanOrder: 'roundRobin', maxPages: 0, stopAfter: 0, pageRetries: 2, scanRetries: 3, retryProfile: 'normal', adaptiveSlowdown: true, showPartial: false, reuseCurrentPage: true }),
  fast: Object.freeze({ concurrency: 5, spacingMs: 0, scanOrder: 'roundRobin', maxPages: 0, stopAfter: 0, pageRetries: 1, scanRetries: 2, retryProfile: 'fast', adaptiveSlowdown: true, showPartial: false, reuseCurrentPage: true }),
});

var SCAN_PRESET_INFO = Object.freeze({
  safe: Object.freeze({ label: 'Safe', description: 'Most conservative. One request at a time with a small delay between pages.', summary: '1 concurrent request · 250 ms spacing · patient retries' }),
  balanced: Object.freeze({ label: 'Balanced', description: 'Recommended default. Good speed without being overly aggressive.', summary: '3 concurrent requests · no spacing · normal retries' }),
  fast: Object.freeze({ label: 'Fast', description: 'Faster background scanning for large searches. Temporary request errors can be more common.', summary: '5 concurrent requests · no spacing · shorter retries' }),
  custom: Object.freeze({ label: 'Custom', description: 'Expose all scanner controls so you can experiment with speed, coverage, and recovery.', summary: 'Uses your custom values below' }),
});

function scanInt(value, fallback, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.floor(number));
}

function normalizeScanCustom(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = SCAN_PRESETS.balanced;
  return {
    concurrency: scanInt(source.concurrency, base.concurrency, 1),
    spacingMs: scanInt(source.spacingMs, base.spacingMs, 0),
    scanOrder: source.scanOrder === 'searchBySearch' ? 'searchBySearch' : 'roundRobin',
    maxPages: scanInt(source.maxPages, base.maxPages, 0),
    stopAfter: scanInt(source.stopAfter, base.stopAfter, 0),
    pageRetries: scanInt(source.pageRetries, base.pageRetries, 0),
    scanRetries: scanInt(source.scanRetries, base.scanRetries, 0),
    retryProfile: ['fast', 'normal', 'patient'].includes(source.retryProfile) ? source.retryProfile : base.retryProfile,
    adaptiveSlowdown: source.adaptiveSlowdown !== false,
    showPartial: source.showPartial === true,
    reuseCurrentPage: source.reuseCurrentPage !== false,
  };
}

function readScanCustom() {
  const stored = GM_getValue(SCAN_SETTINGS_KEYS.custom, null);
  if (typeof stored === 'string') {
    try { return normalizeScanCustom(JSON.parse(stored)); } catch (_) {}
  }
  return normalizeScanCustom(stored);
}

var storedScanPreset = GM_getValue(SCAN_SETTINGS_KEYS.preset, 'balanced');
var scanCfg = {
  preset: ['safe', 'balanced', 'fast', 'custom'].includes(storedScanPreset) ? storedScanPreset : 'balanced',
  custom: readScanCustom(),
};

var scanSettingsUi = { modal: null, draft: null };

function activeScanSettings() {
  if (scanCfg.preset === 'custom') return normalizeScanCustom(scanCfg.custom);
  return { ...(SCAN_PRESETS[scanCfg.preset] || SCAN_PRESETS.balanced) };
}

function saveScanSettings(preset, custom) {
  scanCfg.preset = ['safe', 'balanced', 'fast', 'custom'].includes(preset) ? preset : 'balanced';
  scanCfg.custom = normalizeScanCustom(custom);
  GM_setValue(SCAN_SETTINGS_KEYS.preset, scanCfg.preset);
  GM_setValue(SCAN_SETTINGS_KEYS.custom, scanCfg.custom);
}

function scanSettingsSummary(settings = activeScanSettings()) {
  const pages = settings.maxPages > 0 ? `max ${settings.maxPages} pages/search` : 'all pages';
  const stop = settings.stopAfter > 0 ? `stop at ${settings.stopAfter} matches` : 'all matches';
  return `${settings.concurrency} concurrent · ${settings.spacingMs} ms spacing · ${pages} · ${stop}`;
}
