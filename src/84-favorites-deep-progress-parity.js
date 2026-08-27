'use strict';

/* v0.11.0 deep metadata progress parity.
 *
 * The durable listing scanner previously exposed only completed/total. Mirror
 * the richer normal-scan progress model without changing queue ownership or
 * scheduling: count terminal failures as processed work, show remaining work,
 * calculate a rolling items/second rate, and estimate time remaining.
 */

var favDeepProgressMetrics0111 = {
    samples: [],
    lastProcessed: 0,
};

function favDeepProgressClock0111() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function favDeepProgressReset0111(processed = 0) {
    favDeepProgressMetrics0111.samples = [];
    favDeepProgressMetrics0111.lastProcessed = Math.max(0, Number(processed) || 0);
}

function favDeepProgressRate0111(state = {}) {
    const completed = Math.max(0, Number(state.completed) || 0);
    const failed = Math.max(0, Number(state.failed) || 0);
    const processed = completed + failed;
    const now = favDeepProgressClock0111();

    if (processed < favDeepProgressMetrics0111.lastProcessed) {
        favDeepProgressReset0111(processed);
    }

    const samples = favDeepProgressMetrics0111.samples;
    const last = samples[samples.length - 1];
    if (!last || processed !== last.processed || now - last.time >= 2000) {
        samples.push({ time:now, processed });
    }
    favDeepProgressMetrics0111.lastProcessed = processed;

    const cutoff = now - 18000;
    while (samples.length > 2 && samples[1].time < cutoff) samples.shift();
    if (samples.length < 2) return 0;

    const newest = samples[samples.length - 1];
    let oldest = samples[0];
    for (const sample of samples) {
        if (newest.time - sample.time <= 12000) {
            oldest = sample;
            break;
        }
    }

    const deltaItems = newest.processed - oldest.processed;
    const deltaSeconds = (newest.time - oldest.time) / 1000;
    if (deltaItems <= 0 || deltaSeconds < 0.25) return 0;
    return deltaItems / deltaSeconds;
}

function favDeepFormatRate0111(rate) {
    if (!Number.isFinite(rate) || rate <= 0) return '';
    return rate >= 1 ? rate.toFixed(1) : rate.toFixed(2);
}

function favDeepFormatEta0111(seconds) {
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

var favDeepProgressModelBefore0111 = favDeepProgressModel;
favDeepProgressModel = function favDeepProgressModel0111(state = favDeepState) {
    const base = favDeepProgressModelBefore0111(state);
    const completed = Math.max(0, Number(state.completed) || 0);
    const failed = Math.max(0, Number(state.failed) || 0);
    const total = Math.max(0, Number(state.total) || 0);
    const processed = completed + failed;
    const remaining = total ? Math.max(0, total - processed) : 0;
    const rate = state.status === 'running' ? favDeepProgressRate0111(state) : 0;
    const etaSeconds = rate > 0 ? remaining / rate : Number.NaN;
    const parts = [];

    if (total) {
        parts.push(`${processed} / ${total}`);
        parts.push(`${remaining} remaining`);
    } else if (processed) {
        parts.push(`${processed} processed`);
    }
    if (failed) parts.push(`${failed} failed`);
    if (rate > 0) {
        parts.push(`${favDeepFormatRate0111(rate)} items/s`);
        if (remaining > 0) parts.push(`ETA ${favDeepFormatEta0111(etaSeconds)}`);
    } else if (state.status === 'running' && total > 0 && remaining > 0) {
        parts.push('Calculating speed and ETA…');
    }

    return {
        ...base,
        title:'Scanning metadata',
        detail:parts.join(' · '),
        ratio:total ? Math.min(1, processed / total) : 0,
        processed,
        remaining,
        rate,
        etaSeconds,
    };
};

/* Match the normal Favorites sync layout: keep the title in <strong> and put
 * detailed progress in the truncatable secondary span instead of making the
 * entire metrics string bold. */
favRenderDeepProgress = function favRenderDeepProgress0111(state = favDeepState) {
    const anchor = favSearchAnchor();
    if (!anchor || state.status !== 'running') return;

    let node = anchor.searchSlot.querySelector(':scope > [data-ebsf-sync-progress]');
    if (!node) {
        node = document.createElement('div');
        node.className = 'ebsf-sync-progress';
        node.dataset.ebsfSyncProgress = '';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        node.innerHTML = '<div class="ebsf-sync-progress-fill"></div><div class="ebsf-sync-progress-copy"><strong></strong><span></span></div>';
        anchor.searchSlot.append(node);
    }

    anchor.form.classList.add('ebsf-native-search-sync-hidden');
    const copy = node.querySelector('.ebsf-sync-progress-copy');
    const title = copy?.querySelector('strong');
    let detail = copy?.querySelector('span');
    if (copy && !detail) {
        detail = document.createElement('span');
        copy.append(detail);
    }

    const model = favDeepProgressModel(state);
    if (title) title.textContent = model.title;
    if (detail) detail.textContent = model.detail;
    node.style.setProperty('--ebsf-sync-ratio', `${model.ratio * 100}%`);
};
