'use strict';

/* v0.7.6 network-level Favorites hardening. Etsy's own Favorites AJAX helpers
 * send x-detected-locale (for example EUR|en-US|FI). Mirror that header so
 * prices/shipping/localized data are resolved in the same locale as the page. */
function favDetectedLocaleHeaderV076() {
    const body = document.body;
    const currency = String(body?.dataset?.currency || '').trim();
    const language = String(body?.dataset?.language || document.documentElement?.lang || '').trim();
    const region = String(body?.dataset?.region || favProps()?.countryIsoCode || '').trim();
    return currency && language && region ? `${currency}|${language}|${region}` : '';
}

function favRetryAfterMsV076(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

favFetchJsonV073 = async function favFetchJsonNativeLocale(url, signal, attempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const headers = { Accept: 'application/json' };
            const detectedLocale = favDetectedLocaleHeaderV076();
            if (detectedLocale) headers['x-detected-locale'] = detectedLocale;

            const response = await fetch(url.href || url, {
                credentials: 'include',
                signal,
                headers,
            });
            if (!response.ok) {
                const error = new Error(`Favorites endpoint returned HTTP ${response.status}`);
                error.retryAfterMs = favRetryAfterMsV076(response.headers.get('Retry-After'));
                throw error;
            }
            return await response.json();
        } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) throw error;
            lastError = error;
            await favWaitUntilVisibleV073(signal);
            const hinted = Math.max(0, Number(error?.retryAfterMs) || 0);
            const delay = Math.min(8000, Math.max(400 * (attempt + 1), hinted));
            await sleep(delay, signal);
        }
    }
    throw lastError || new Error('Favorites request failed');
};

/* Promise.all rejects as soon as one parallel batch exhausts its retries, while
 * sibling workers otherwise keep running. Once that specific dataset load has
 * returned incomplete, abort its own controller so no orphan worker can keep
 * fetching/updating progress behind the partial result. */
var favLoadAllBaseV076 = favLoadAll;
favLoadAll = async function favLoadAllStopOrphans(force = false) {
    const requestedKey = favDatasetKey();
    const pending = favLoadAllBaseV076(force);
    const controller = favState.controller;
    const records = await pending;
    if (
        controller
        && favState.controller === controller
        && favState.loadKey === requestedKey
        && !favState.loadComplete
        && !controller.signal.aborted
    ) {
        controller.abort();
    }
    return records;
};
