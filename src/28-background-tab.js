'use strict';

function ebsWaitUntilVisible(signal) {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onVisibility = () => { if (!document.hidden) finish(); };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    document.addEventListener('visibilitychange', onVisibility);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/*
 * Keep first-pass fetches alive in a background tab, but pause retry rounds until
 * the page is visible again. This prevents Chrome background throttling from
 * burning through the configured page-retry budget.
 */
runJobs = async function runJobsBackgroundFriendly(items, concurrency, worker, signal, onRetry, options = {}) {
  let pending = items.slice();
  let lastErrors = [];
  const retries = scanInt(options.pageRetries, 2, 0);
  const adaptive = options.adaptiveSlowdown !== false;
  const baseSpacing = scanInt(options.spacingMs, 0, 0);
  let currentConcurrency = Math.max(1, scanInt(concurrency, 1, 1));
  let spacing = baseSpacing;
  let lastStartAt = 0;
  let startGate = Promise.resolve();

  const waitForRequestSlot = async () => {
    if (spacing <= 0) return;
    let release;
    const previous = startGate;
    startGate = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, lastStartAt + spacing - Date.now());
      if (wait) await sleep(wait, signal);
      lastStartAt = Date.now();
    } finally {
      release();
    }
  };

  for (let round = 0; round <= retries && pending.length; round += 1) {
    if (options.shouldStop?.()) return { pending: [], errors: lastErrors, stopped: true };
    if (round > 0) {
      if (document.hidden) await ebsWaitUntilVisible(signal);
      onRetry?.();
      await sleep(ebsRetryDelay(options.retryProfile, round, lastErrors, false), signal);
    }

    let cursor = 0;
    const failed = [];
    let stopped = false;
    const runners = Array.from({ length: Math.min(currentConcurrency, pending.length) }, async () => {
      while (cursor < pending.length) {
        if (options.shouldStop?.()) { stopped = true; return; }
        const item = pending[cursor++];
        try {
          await waitForRequestSlot();
          await worker(item);
        } catch (error) {
          if (error?.name === 'AbortError' || signal.aborted) throw error;
          failed.push({ item, error });
        }
      }
    });

    await Promise.all(runners);
    if (stopped || options.shouldStop?.()) return { pending: [], errors: failed, stopped: true };

    lastErrors = failed;
    pending = failed.map((entry) => entry.item);
    if (pending.length && adaptive) {
      currentConcurrency = Math.max(1, currentConcurrency - 1);
      spacing = Math.max(spacing, baseSpacing + round * 100);
    }
  }

  return { pending, errors: lastErrors, stopped: false };
};

var ebsDeferredRetrySig = '';

scheduleAutoRetry = function scheduleAutoRetryBackgroundFriendly(sig) {
  const settings = activeScanSettings();

  if (state.retrySig !== sig) {
    state.retrySig = sig;
    state.retryCount = 0;
  }

  /* Hidden time does not spend another whole-scan retry. */
  if (document.hidden) {
    clearTimeout(state.retryTimer);
    state.retryTimer = 0;
    ebsDeferredRetrySig = sig;
    state.status = { ...(state.status || {}), phase: 'retrying', coverageLimited: state.coverageLimited === true };
    showStatus(state.status);
    if (!settings.showPartial) updateScanPanel(state.status);
    return;
  }

  state.retryCount += 1;
  if (state.retryCount > settings.scanRetries) {
    clearTimeout(state.retryTimer);
    state.retryTimer = 0;
    state.status = { ...(state.status || {}), phase: 'error', coverageLimited: state.coverageLimited === true };
    renderResults(sig, 'error');
    showStatus(state.status);
    return;
  }

  const delay = ebsRetryDelay(settings.retryProfile, state.retryCount, [], true);
  state.status = { ...(state.status || {}), phase: 'retrying', coverageLimited: state.coverageLimited === true };
  if (settings.showPartial) {
    renderResults(sig, 'retrying');
    showStatus(state.status);
  } else {
    showStatus(state.status);
    updateScanPanel(state.status);
  }

  clearTimeout(state.retryTimer);
  state.retryTimer = setTimeout(() => {
    state.retryTimer = 0;
    if (!(cfg.multi || cfg.strict) || !isSearchPage() || signature() !== sig) return;
    if (document.hidden) {
      ebsDeferredRetrySig = sig;
      return;
    }
    invalidateCache();
    scan();
  }, delay);
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden || !ebsDeferredRetrySig) return;
  const sig = ebsDeferredRetrySig;
  ebsDeferredRetrySig = '';
  if (!(cfg.multi || cfg.strict) || !isSearchPage() || signature() !== sig) return;
  clearTimeout(state.retryTimer);
  state.retryTimer = 0;
  invalidateCache();
  setTimeout(() => {
    if (!document.hidden && (cfg.multi || cfg.strict) && isSearchPage() && signature() === sig) scan();
  }, 80);
});
