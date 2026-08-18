'use strict';

/*
 * Live scan throughput + ETA for the full-page scan progress screen.
 * Uses a rolling page-completion window so concurrent request bursts do not make
 * the displayed speed jump as much as a single instant measurement would.
 */

var ebsScanMetrics = {
  scanId: -1,
  samples: [],
  lastPages: 0,
};

function ebsResetScanMetrics() {
  ebsScanMetrics.scanId = state.scanId;
  ebsScanMetrics.samples = [];
  ebsScanMetrics.lastPages = 0;
}

function ebsFormatScanRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) return '';
  if (rate >= 10) return rate.toFixed(1);
  if (rate >= 1) return rate.toFixed(1);
  return rate.toFixed(2);
}

function ebsFormatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 5) return '<5s';
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs ? `~${minutes}m ${secs}s` : `~${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `~${hours}h ${minutes}m` : `~${hours}h`;
}

function ebsRecordScanMetric(status = {}) {
  const now = performance.now();
  const pages = Math.max(0, Number(status.completedPages) || 0);

  if (ebsScanMetrics.scanId !== state.scanId || pages < ebsScanMetrics.lastPages) {
    ebsResetScanMetrics();
  }

  const samples = ebsScanMetrics.samples;
  const last = samples[samples.length - 1];
  if (!last || pages !== last.pages || now - last.time >= 2000) {
    samples.push({ time: now, pages });
  }
  ebsScanMetrics.lastPages = pages;

  /* Keep enough history for a stable rolling average without letting an old
     slow/fast period dominate the rest of a long scan. */
  const cutoff = now - 18000;
  while (samples.length > 2 && samples[1].time < cutoff) samples.shift();

  if (samples.length < 2) return 0;
  const newest = samples[samples.length - 1];
  let oldest = samples[0];

  /* Prefer roughly the last 12 seconds when enough history exists. */
  for (const sample of samples) {
    if (newest.time - sample.time <= 12000) {
      oldest = sample;
      break;
    }
  }

  const deltaPages = newest.pages - oldest.pages;
  const deltaSeconds = (newest.time - oldest.time) / 1000;
  if (deltaPages < 2 || deltaSeconds < 0.5) return 0;
  return deltaPages / deltaSeconds;
}

function ebsUpdateScanMetricsLine(status = {}) {
  const panel = document.querySelector('[data-ebs-scan-panel]');
  if (!panel) return;

  let line = panel.querySelector('[data-ebs-scan-metrics]');
  if (!line) {
    line = document.createElement('span');
    line.className = 'ebs-scan-metrics';
    line.dataset.ebsScanMetrics = '';
    panel.querySelector('.ebs-scan-copy')?.append(line);
  }
  if (!line) return;

  const speed = ebsRecordScanMetric(status);
  const completedPages = Math.max(0, Number(status.completedPages) || 0);
  const totalPages = Math.max(0, Number(status.totalPages) || 0);
  const readySearches = Math.max(0, Number(status.readySearches) || 0);
  const searchCount = Math.max(1, Number(status.searchCount) || 1);

  if (status.phase === 'retrying') {
    line.textContent = speed > 0
      ? `Average speed: ${ebsFormatScanRate(speed)} pages/s · ETA recalculates after retry`
      : 'Average speed / ETA will resume after retry';
    return;
  }

  if (readySearches < searchCount || totalPages <= 0 || completedPages <= 0) {
    line.textContent = 'Calculating average speed and ETA…';
    return;
  }

  if (speed <= 0) {
    line.textContent = 'Calculating average speed and ETA…';
    return;
  }

  const remainingPages = Math.max(0, totalPages - completedPages);
  const eta = ebsFormatEta(remainingPages / speed);
  const earlyStop = typeof activeScanSettings === 'function' && activeScanSettings().stopAfter > 0;
  const etaLabel = earlyStop ? `Estimated max remaining: ${eta}` : `Estimated remaining: ${eta}`;
  line.textContent = `Average speed: ${ebsFormatScanRate(speed)} pages/s · ${etaLabel}`;
}

var ebsUpdateScanPanelBase = updateScanPanel;
updateScanPanel = function updateScanPanelWithMetrics(status = {}) {
  ebsUpdateScanPanelBase(status);
  ebsUpdateScanMetricsLine(status);
};

var ebsClearScanPanelBase = clearScanPanel;
clearScanPanel = function clearScanPanelWithMetrics() {
  ebsClearScanPanelBase();
  ebsResetScanMetrics();
};

/* Returning from a heavily throttled background tab can make the old rolling
 * window unrepresentative. Restart the speed window from the current page count
 * while leaving the actual scan itself untouched. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !state.scanningSig) return;
  const pages = Math.max(0, Number(state.status?.completedPages) || 0);
  ebsScanMetrics.scanId = state.scanId;
  ebsScanMetrics.samples = [{ time: performance.now(), pages }];
  ebsScanMetrics.lastPages = pages;
});

GM_addStyle(`
  .ebs-scan-metrics {
    color:#8a8a84!important;
    font-size:11px!important;
    line-height:1.4;
  }
  @media (max-width:760px) {
    .ebs-scan-metrics { font-size:10.5px!important; }
  }
`);
