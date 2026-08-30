'use strict';

/* v0.15.12 final Favorites render transaction boundary.
 *
 * Browser evidence showed a stale/empty BetterSearch local grid could reclaim
 * ownership after Etsy had already restored useful native cards. Historical
 * layers entered local mode first (hiding Etsy's grid/pager) and only later
 * decided whether the local render signature was current.
 *
 * This module is deliberately loaded after the v0.15.11 state/count boundary.
 * It does not add another crawler, grid model or pager model. It turns the
 * existing BetterSearch local grid + module-95 pager into one visual transaction:
 *
 *   stage local grid + pager while Etsy stays useful
 *   -> sign current request/data/view generations
 *   -> validate
 *   -> switch native/local grid + pager + count/status in one synchronous turn
 *
 * A stale or failed transaction releases ownership back to Etsy. Historical
 * ownership helpers remain compatibility APIs but cannot hide Etsy unless this
 * final transaction explicitly approves the claim.
 */

favState.renderToken01512 = String(favState.renderToken01512 || '');
favState.renderRequestSignature01512 = String(favState.renderRequestSignature01512 || '');
favState.renderClaimApproved01512 = false;
favState.renderTransactionSequence01512 = Math.max(0, Number(favState.renderTransactionSequence01512) || 0);

function favHashText01512(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function favNormalizedConfigText01512() {
    try { return JSON.stringify(favNormalizeConfig(favCfg)); }
    catch (_) { return JSON.stringify(favCfg || {}); }
}

function favCurrentMetadataCapabilities01512() {
    try { return Array.from(favMetadataRequirements0141?.(favCfg) || [], String).sort(); }
    catch (_) { return []; }
}

function favMetadataCoverageCurrent01512() {
    const coverage = favState.metadataCoverage0141 || null;
    const required = favCurrentMetadataCapabilities01512();
    const covered = Array.from(coverage?.capabilities || [], String).sort();
    return Boolean(
        coverage
        && String(coverage.datasetKey || '') === String(favDatasetKey())
        && Number(coverage.pending) <= 0
        && JSON.stringify(covered) === JSON.stringify(required)
    );
}

function favNativeViewFingerprint01512(nativeGrid = favNativeMainGrid0141?.()) {
    if (!nativeGrid?.isConnected) return 'missing';
    const ids = Array.from(nativeGrid.children || [])
        .map((node) => String(favListingIdFromNode(node) || ''))
        .filter(Boolean);
    const viewKey = typeof favViewKey0137 === 'function' ? favViewKey0137() : '';
    return favHashText01512(`${viewKey}|${ids.join(',')}`);
}

function favSnapshotRevision01512() {
    const scope = favState.cacheScope0137 || {};
    return [
        scope.snapshotGeneration || '',
        Number(scope.snapshotCommittedAt) || 0,
        Number(scope.lastCompleteSyncAt) || 0,
    ].join(':');
}

function favRecordsRevision01512(records = favState.records) {
    /* Do not include lastObservedAt/indexObservedAt/metadata timestamps here.
     * Current-page metadata observations can refresh those values without a new
     * committed catalogue. Membership/order is stable catalogue identity;
     * metadata coverage has its own generation in the transaction token. */
    return favHashText01512(Array.from(records || [], (record) =>
        `${String(record?.id || '')}:${Number(record?.order) || 0}`
    ).join('|'));
}

function favLocalResultRequestKey01512() {
    /* Strict/Multi intentionally reuse the full unqueried catalogue. Their live
     * Search text is therefore absent from favDatasetKey(). favScopeKey() is the
     * local-view identity and must participate so a new Strict query cannot keep
     * page 3 from the previous query. */
    return `${favDatasetKey()}|${favScopeKey()}|${favHashText01512(favNormalizedConfigText01512())}`;
}

favEnsureLocalPageContext0150 = function favEnsureLocalPageContext01512() {
    const key = favLocalResultRequestKey01512();
    if (favState.localResultKey0150 !== key) {
        favState.localResultKey0150 = key;
        favState.localPage = 1;
    }
    favState.pageSize = typeof FAV_LOCAL_PAGE_SIZE0150 === 'number' ? FAV_LOCAL_PAGE_SIZE0150 : 20;
    return key;
};

function favRenderRequestSignature01512() {
    const destination = typeof favMetadataDestination0141 === 'function'
        ? String(favMetadataDestination0141()?.contextKey || '')
        : '';
    return [
        favDatasetKey(),
        favScopeKey(),
        favState.loadKey || '',
        favState.nativeQueryGeneration01511 || 0,
        favSnapshotRevision01512(),
        favHashText01512(favNormalizedConfigText01512()),
        destination,
        favCurrentMetadataCapabilities01512().join(','),
    ].join('|');
}

/* Keep module-101 diagnostics/count consumers on the same final request truth. */
favRequestedRenderSignature0143 = function favRequestedRenderSignature01512() {
    return favRenderRequestSignature01512();
};

function favRenderTransactionToken01512(nativeGrid = favNativeMainGrid0141?.()) {
    const filtered = Array.isArray(favState.filtered) ? favState.filtered : [];
    const pageSize = Math.max(1, Number(favState.pageSize) || 20);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(favState.localPage) || 1));
    const coverage = favState.metadataCoverage0141 || {};
    return [
        favRenderRequestSignature01512(),
        favMetadataCoverageCurrent01512() ? 'metadata:ready' : 'metadata:stale',
        Number(coverage.observedAt) || 0,
        Number(coverage.unresolved) || 0,
        favRecordsRevision01512(),
        favNativeViewFingerprint01512(nativeGrid),
        favHashText01512(filtered.map((record) => String(record?.id || '')).join(',')),
        filtered.length,
        pageSize,
        page,
        pages,
    ].join('|');
}

function favSetRenderStatus01512(status) {
    const next = String(status || 'native');
    favState.renderStatus0143 = next;
    if (document.body?.dataset?.ebsfRenderStatus !== next) document.body.dataset.ebsfRenderStatus = next;
}

function favStagedPaginationReady01512(pages) {
    const totalPages = Math.max(1, Number(pages) || 1);
    const pager = document.querySelector('[data-ebsf-local-pagination]');
    if (totalPages <= 1) return !pager;
    return Boolean(
        pager?.isConnected
        && pager.dataset.ebsfPaginationPresentation === 'etsy-native'
        && pager.dataset.ebsfLocalPageCount === String(totalPages)
        && pager.dataset.ebsfLocalCurrentPage === String(favState.localPage)
        && pager.hidden === true
        && pager.inert === true
        && pager.getAttribute('aria-hidden') === 'true'
        && pager.hasAttribute('data-ebsf-local-staged')
    );
}

function favCommittedPaginationReady01512() {
    const filtered = Array.isArray(favState.filtered) ? favState.filtered : [];
    const pageSize = Math.max(1, Number(favState.pageSize) || 20);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const pager = document.querySelector('[data-ebsf-local-pagination]');
    const nativeHidden = typeof favNativePagers0150 !== 'function'
        || favNativePagers0150().every((native) =>
            native.hasAttribute('data-ebsf-native-pager-hidden')
            && favNodeVisuallySuppressed0143(native)
        );
    if (!nativeHidden) return false;
    if (pages <= 1) return !pager;
    return Boolean(
        pager?.isConnected
        && pager.dataset.ebsfPaginationPresentation === 'etsy-native'
        && pager.dataset.ebsfLocalPageCount === String(pages)
        && pager.dataset.ebsfLocalCurrentPage === String(favState.localPage)
        && pager.hidden !== true
        && pager.inert !== true
        && pager.getAttribute('aria-hidden') !== 'true'
        && !favNodeVisuallySuppressed0143(pager)
    );
}

/* The old module-95 helper is still the low-level DOM writer, but local mode by
 * itself is no longer permission to suppress Etsy. Historical callers in 95/101
 * become harmless unless the transaction commit explicitly opens this gate. */
var favApplyLocalVisualOwnershipBefore01512 = favApplyLocalVisualOwnership0150;
favApplyLocalVisualOwnership0150 = function favApplyLocalVisualOwnership01512() {
    if (favState.renderClaimApproved01512 !== true) return false;
    return favApplyLocalVisualOwnershipBefore01512();
};

/* Reuse module 95 as the sole pager presentation builder. During staging we
 * temporarily satisfy its local-mode precondition, while the ownership gate
 * above prevents it from hiding Etsy. The prepared local pager itself remains
 * hidden + inert until the transaction commits. */
var favRenderPaginationBefore01512 = favRenderPagination;
favRenderPagination = function favRenderPagination01512(pages) {
    if (favState.renderMode0141 !== 'bettersearch-staged') {
        return favRenderPaginationBefore01512(pages);
    }
    const localGrid = favState.localGrid0141;
    if (!localGrid?.isConnected) return false;
    const previousMode = favState.renderMode0141;
    try {
        favState.renderMode0141 = 'bettersearch-local';
        favRenderPaginationBefore01512(pages);
    } finally {
        favState.renderMode0141 = previousMode;
    }
    const pager = document.querySelector('[data-ebsf-local-pagination]');
    if (pager) {
        pager.hidden = true;
        pager.inert = true;
        pager.setAttribute('aria-hidden', 'true');
        pager.setAttribute('data-ebsf-local-staged', '1');
    }
    return favStagedPaginationReady01512(pages);
};

function favAbortStagedRender01512(status = 'native-fallback') {
    favState.renderToken01512 = '';
    favState.renderRequestSignature01512 = '';
    favState.renderClaimApproved01512 = false;
    const result = favRestoreNative();
    favSetRenderStatus01512(status);
    return result;
}

function favCommitStagedRender01512(token, pages, nativeGrid) {
    if (!token || token !== favRenderTransactionToken01512(nativeGrid)) return false;
    if (!favMetadataCoverageCurrent01512() || !favStagedPaginationReady01512(pages)) return false;
    const localGrid = favState.localGrid0141;
    if (!nativeGrid?.isConnected || !localGrid?.isConnected) return false;
    if (localGrid.hidden !== true || localGrid.inert !== true || !localGrid.hasAttribute('data-ebsf-local-staged')) return false;

    favState.renderClaimApproved01512 = true;
    try {
        /* Synchronous switch: no paint or MutationObserver callback can occur
         * between native suppression and local reveal/status/count commit. */
        favState.renderMode0141 = 'bettersearch-local';
        if (!favApplyLocalVisualOwnership0150()) return false;

        localGrid.inert = false;
        localGrid.removeAttribute('aria-hidden');
        localGrid.removeAttribute('data-ebsf-local-staged');
        const pager = document.querySelector('[data-ebsf-local-pagination]');
        if (pager) {
            pager.hidden = false;
            pager.inert = false;
            pager.removeAttribute('aria-hidden');
            pager.removeAttribute('data-ebsf-local-staged');
        }

        favState.rendered = true;
        favState.renderToken01512 = token;
        favState.renderRequestSignature01512 = favRenderRequestSignature01512();
        favState.renderSignature0143 = favState.renderRequestSignature01512;
        document.body?.classList.add('ebsf-results-active');
        favSetRenderStatus01512('bettersearch-local');
        favUpdateScopeHeader0120?.();
        return true;
    } finally {
        favState.renderClaimApproved01512 = false;
    }
}

/* Final renderer. Local nodes are built hidden/inert; native Etsy nodes remain
 * useful until the signed commit succeeds. A legitimate current zero-result may
 * still commit, but an old empty result cannot alias a newer native view because
 * native fingerprint + scope/query/config/data/coverage/page all sign the token. */
favRenderCurrent = function favRenderCurrent01512() {
    const nativeGrid = favNativeMainGrid0141?.();
    if (!nativeGrid?.isConnected) return false;
    if (!favEnhancementActive() || !favState.loadComplete || favState.loadKey !== favDatasetKey()) {
        favAbortStagedRender01512('native-fallback');
        return false;
    }
    if (!favMetadataCoverageCurrent01512()) {
        favAbortStagedRender01512(Number(favState.metadataCoverage0141?.pending) > 0 ? 'metadata-pending' : 'native-fallback');
        return false;
    }

    favCaptureNativeGrid();
    const matched = favFilteredRecords();
    favState.filtered = matched;
    const pageSize = Math.max(1, Number(favState.pageSize) || 20);
    const pages = Math.max(1, Math.ceil(matched.length / pageSize));
    favState.localPage = Math.min(pages, Math.max(1, Number(favState.localPage) || 1));
    const start = (favState.localPage - 1) * pageSize;
    const page = matched.slice(start, start + pageSize);
    const localGrid = favEnsureLocalGrid0141(nativeGrid);
    const fragment = document.createDocumentFragment();
    if (!page.length) {
        const empty = document.createElement('li');
        empty.className = 'ebsf-empty';
        empty.textContent = 'No favorites match these filters.';
        fragment.append(empty);
    } else {
        for (const record of page) fragment.append(favNodeForRecord(record));
    }

    favState.rendering = true;
    try {
        localGrid.hidden = true;
        localGrid.inert = true;
        localGrid.setAttribute('aria-hidden', 'true');
        localGrid.setAttribute('data-ebsf-local-staged', '1');
        localGrid.replaceChildren(fragment);
        favState.renderMode0141 = 'bettersearch-staged';
        favState.rendered = false;
        document.body?.classList.remove('ebsf-results-active');

        if (!favRenderPagination(pages)) {
            favAbortStagedRender01512('native-fallback');
            return false;
        }

        const token = favRenderTransactionToken01512(nativeGrid);
        if (token !== favRenderTransactionToken01512(nativeGrid)) {
            favAbortStagedRender01512('native-fallback');
            return false;
        }
        if (!favCommitStagedRender01512(token, pages, nativeGrid)) {
            favAbortStagedRender01512('native-fallback');
            return false;
        }
        return true;
    } catch (error) {
        favAbortStagedRender01512('error');
        console.warn('[Etsy BetterSearch] Local Favorites render transaction failed; restored Etsy results.', error);
        return false;
    } finally {
        queueMicrotask(() => { favState.rendering = false; });
    }
};

/* Final authority requires both the historical visual checks and the signed
 * transaction. Multi-page local pager health also requires that the local pager
 * is actually visible/non-inert, closing the older false-positive health check. */
favLocalGridAuthoritative0142 = function favLocalGridAuthoritative01512() {
    if (!favLocalGridMounted0143()) return false;
    if (!favCommittedPaginationReady01512()) return false;
    if (!favState.renderToken01512) return false;
    if (favState.renderRequestSignature01512 !== favRenderRequestSignature01512()) return false;
    return favState.renderToken01512 === favRenderTransactionToken01512();
};

/* Proof first, never hide first. If Etsy reconciles either native grid or pager
 * visibility, the committed authority test fails; restore Etsy and rebuild from
 * the current catalogue/metadata pipeline instead of blindly re-hiding it. */
favRepairLocalOwnership0142 = function favRepairLocalOwnership01512(datasetKey) {
    if (!favRenderIntegrityReady0142(datasetKey)) {
        if (favState.renderMode0141 !== 'native') favAbortStagedRender01512('native-fallback');
        return;
    }
    if (favLocalGridAuthoritative0142()) {
        favUpdateScopeHeader0120?.();
        favEnsurePermanentRail0142();
        favWatchNativeHydration0143();
        return;
    }
    if (favState.renderMode0141 !== 'native' || favState.localGrid0141?.isConnected) {
        favAbortStagedRender01512('native-fallback');
    }
    void Promise.resolve(favReapply()).catch((error) => {
        console.debug?.('[EBSF] local Favorites render repair deferred', error);
    });
};

/* Request changes release the old local result before asynchronous work. This
 * is essential for Strict/Multi because their catalogue dataset can stay the
 * same while favScopeKey() (the local Search view) changes. Same-request refresh
 * may keep its useful already-authoritative local result until staging commits. */
var favReapplyBefore01512 = favReapply;
favReapply = async function favReapply01512(...args) {
    favEnsureLocalPageContext0150();
    const requestSignature = favRenderRequestSignature01512();
    favState.renderTransactionSequence01512 += 1;
    if (
        favState.renderMode0141 === 'bettersearch-local'
        && favState.renderRequestSignature01512
        && favState.renderRequestSignature01512 !== requestSignature
    ) favAbortStagedRender01512('loading');
    return favReapplyBefore01512(...args);
};

/* The v0.15.11 count authority layer correctly decides the TOTAL authority but
 * overwrote module 101's earlier shown-count safety wrapper. Reapply that one
 * semantic at the actual final integration boundary: native/fallback mode shows
 * total; only a signed local grid may advertise filtered shown count. */
var favScopeCountsBefore01512 = favScopeCounts0120;
favScopeCounts0120 = function favScopeCounts01512() {
    const previous = favScopeCountsBefore01512();
    const total = Math.max(0, Number(previous?.total) || 0);
    return {
        ...previous,
        total,
        shown:favLocalGridAuthoritative0142()
            ? (Array.isArray(favState.filtered) ? favState.filtered.length : total)
            : total,
    };
};

var favRestoreNativeBefore01512 = favRestoreNative;
favRestoreNative = function favRestoreNative01512() {
    favState.renderToken01512 = '';
    favState.renderRequestSignature01512 = '';
    favState.renderClaimApproved01512 = false;
    const local = favState.localGrid0141;
    if (local?.isConnected) {
        local.removeAttribute('data-ebsf-local-staged');
        local.inert = false;
    }
    const pager = document.querySelector('[data-ebsf-local-pagination]');
    if (pager) {
        pager.removeAttribute('data-ebsf-local-staged');
        pager.inert = false;
    }
    return favRestoreNativeBefore01512();
};
