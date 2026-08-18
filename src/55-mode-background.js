'use strict';

/*
 * Behavior patch loaded after the main runtime:
 * - Strict title and Multi-search are mutually exclusive.
 * - Background-tab throttling no longer burns through retry budgets and ends in
 *   "scan incomplete" just because the Etsy tab was not visible.
 */

function ebsEnableStrictExclusive(nextStrict) {
  const next = nextStrict === true;
  const wasMulti = cfg.multi;
  const current = query();

  if (wasMulti && current) save('multiQuery', current);

  if (next) {
    if (wasMulti) save('multi', false);
    save('strict', true);
  } else {
    save('strict', false);
  }

  updateButtons();
  closeStrictPopup();
  closeMultiModal();
  stopScan();
  invalidateCache();
  restoreNative();
  scheduleFit();

  if (!isSearchPage()) return;

  if (next && wasMulti) {
    const target = cfg.singleQuery || current;
    if (!target) return scheduleSync(50);
    save('singleQuery', target);
    const desired = searchUrl(target, modeSwitchFilters());
    if (desired.href !== location.href) location.assign(desired.href);
    else reapply();
    return;
  }

  if (next) reapply();
  else showStatus(null);
}

/* Intercept the Strict-title main button before its original target handler. */
document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-ebs-strict]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ebsEnableStrictExclusive(!cfg.strict);
}, true);

/* Multi-search activation always turns Strict title off first. */
var ebsSwitchSearchModeBase = switchSearchMode;
switchSearchMode = function switchSearchModeExclusive(nextMulti) {
  if (nextMulti && cfg.strict) save('strict', false);
  return ebsSwitchSearchModeBase(nextMulti);
};

/* Applying the Multi-search editor can also enable Multi-search directly. */
var ebsApplyMultiModalBase = applyMultiModal;
applyMultiModal = function applyMultiModalExclusive() {
  if (state.modal && state.modalDraft) {
    const normalized = normalizeRuleConnectors(normalizeRules(state.modalDraft));
    if (validateRules(normalized).size === 0 && cfg.strict) save('strict', false);
  }
  return ebsApplyMultiModalBase();
};

/* Clean up a persisted state from older versions where both could be enabled. */
if (cfg.multi && cfg.strict) {
  save('strict', false);
  updateButtons();
}

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
 * Same configurable worker pool as v0.5.x, except retry rounds wait for the tab
 * to become visible again. First-pass fetches are not cancelled just because the
 * user Alt-Tabs; browsers may continue them normally in the background.
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
      /* Do not consume a retry round while Chrome has background-throttled Etsy. */
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

  /* A hidden tab pauses whole-scan recovery without spending another attempt. */
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
  /* Give the browser a moment to fully foreground the tab before resuming fetches. */
  setTimeout(() => {
    if (!document.hidden && (cfg.multi || cfg.strict) && isSearchPage() && signature() === sig) scan();
  }, 80);
});
