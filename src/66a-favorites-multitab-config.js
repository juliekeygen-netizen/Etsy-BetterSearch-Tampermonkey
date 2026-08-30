'use strict';

/* v0.15.18 Favorites config/UI-preference multi-tab ownership.
 *
 * The historical persistence helpers wrote one whole object per domain from a
 * long-lived tab-local object. Two tabs that started from the same snapshot
 * could therefore overwrite unrelated newer changes. This module establishes
 * leaf-level canonical keys while keeping the historical aggregate keys as
 * compatibility mirrors for older BetterSearch versions.
 *
 * Rules:
 *  - normalized leaf values are the cross-tab source of truth;
 *  - saves merge local dirty leaves onto the latest canonical leaf set;
 *  - normalization corrections are themselves converged back to leaf storage;
 *  - missing leaves are seeded once from the normalized legacy aggregate;
 *  - remote leaf changes update the existing live object in place;
 *  - aggregate writes are compatibility mirrors only and never become the
 *    authority again after leaf migration.
 */

var FAV_SETTINGS_FIELD_PREFIX01518 = '.field.v1.';
var favRemoteConfigPaths01518 = new Set();
var favRemoteUiPrefPaths01518 = new Set();
var favRemoteSettingsFrame01518 = 0;

function favCloneSetting01518(value) {
    if (value == null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
        try { return structuredClone(value); } catch (_) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
}

function favPlainSettingObject01518(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function favFlattenSettings01518(value, prefix = '', out = new Map()) {
    if (!favPlainSettingObject01518(value)) {
        if (prefix) out.set(prefix, favCloneSetting01518(value));
        return out;
    }
    for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (favPlainSettingObject01518(child)) favFlattenSettings01518(child, path, out);
        else out.set(path, favCloneSetting01518(child));
    }
    return out;
}

function favSettingsFieldKey01518(baseKey, path) {
    return `${baseKey}${FAV_SETTINGS_FIELD_PREFIX01518}${encodeURIComponent(path)}`;
}

function favSetSettingPath01518(target, path, value) {
    if (!target || !path) return target;
    const parts = String(path).split('.');
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        if (!favPlainSettingObject01518(cursor[key])) cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[parts.at(-1)] = favCloneSetting01518(value);
    return target;
}

function favSettingsValueEqual01518(left, right) {
    if (Object.is(left, right)) return true;
    try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
}

function favApplySettingsInPlace01518(target, source) {
    if (!favPlainSettingObject01518(target) || !favPlainSettingObject01518(source)) return source;
    for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
    for (const [key, value] of Object.entries(source)) {
        if (favPlainSettingObject01518(value)) {
            if (!favPlainSettingObject01518(target[key])) target[key] = {};
            favApplySettingsInPlace01518(target[key], value);
        } else {
            target[key] = favCloneSetting01518(value);
        }
    }
    return target;
}

function favMissingSetting01518() {
    return { __ebsfMissing01518:true };
}

function favReadSettingsField01518(baseKey, path) {
    const value = GM_getValue(favSettingsFieldKey01518(baseKey, path), favMissingSetting01518());
    const missing = Boolean(
        favPlainSettingObject01518(value)
        && value.__ebsfMissing01518 === true
        && Object.keys(value).length === 1
    );
    return missing ? { found:false, value:undefined } : { found:true, value };
}

function favNormalizeStoredConfig01518(value) {
    const normalized = favNormalizeConfig(value);
    /* Preserve the historical mutual-exclusion rule as a storage invariant.
     * Multi-search wins when independently persisted leaves conflict. */
    if (normalized.strict && normalized.multi) normalized.strict = false;
    return normalized;
}

function favSettingsState01518({ name, baseKey, normalize, getLive, onRemote }) {
    return {
        name,
        baseKey,
        normalize,
        getLive,
        onRemote,
        snapshot:new Map(),
        listeners:new Map(),
    };
}

function favRegisterSettingsField01518(state, path) {
    if (state.listeners.has(path) || typeof GM_addValueChangeListener !== 'function') return;
    const key = favSettingsFieldKey01518(state.baseKey, path);
    const listenerId = GM_addValueChangeListener(key, (_name, _oldValue, _newValue, remote) => {
        if (remote !== true) return;
        favRefreshSettingsFromStorage01518(state, path);
    });
    state.listeners.set(path, listenerId);
}

function favReadCanonicalSettings01518(state, fallbackNormalized) {
    const fallbackFlat = favFlattenSettings01518(fallbackNormalized);
    const raw = {};
    const baseline = new Map();

    for (const [path, fallback] of fallbackFlat) {
        favRegisterSettingsField01518(state, path);
        const stored = favReadSettingsField01518(state.baseKey, path);
        const value = stored.found ? stored.value : fallback;
        if (!stored.found) {
            GM_setValue(favSettingsFieldKey01518(state.baseKey, path), favCloneSetting01518(value));
        }
        favSetSettingPath01518(raw, path, value);
        baseline.set(path, favCloneSetting01518(value));
    }
    return { raw, baseline };
}

function favConvergeSettingsState01518(state, normalized, baseline = new Map()) {
    const flat = favFlattenSettings01518(normalized);
    for (const [path, value] of flat) {
        favRegisterSettingsField01518(state, path);
        if (!baseline.has(path) || !favSettingsValueEqual01518(baseline.get(path), value)) {
            GM_setValue(favSettingsFieldKey01518(state.baseKey, path), favCloneSetting01518(value));
        }
    }
    state.snapshot = new Map(Array.from(flat, ([path, value]) => [path, favCloneSetting01518(value)]));
    return flat;
}

function favMirrorSettingsAggregate01518(state, normalized) {
    /* Compatibility only. Fixed versions load canonical leaf keys over this
     * aggregate, so a stale aggregate write cannot erase unrelated leaf data. */
    GM_setValue(state.baseKey, favCloneSetting01518(normalized));
}

function favSeedAndOverlaySettings01518(state) {
    const live = state.getLive();
    const fallback = state.normalize(live);
    const { raw, baseline } = favReadCanonicalSettings01518(state, fallback);
    const canonical = state.normalize(raw);
    favConvergeSettingsState01518(state, canonical, baseline);
    favApplySettingsInPlace01518(live, canonical);
    favMirrorSettingsAggregate01518(state, canonical);
    return live;
}

function favCommitSettings01518(state) {
    const live = state.getLive();
    const localNormalized = state.normalize(live);
    const localFlat = favFlattenSettings01518(localNormalized);
    const dirty = new Map();

    /* Only paths changed relative to this tab's last canonical snapshot are
     * local intent. Everything else is refreshed from canonical storage first,
     * so delayed cross-tab notifications cannot make an unrelated stale value
     * overwrite a newer persisted leaf. */
    for (const [path, value] of localFlat) {
        if (!state.snapshot.has(path)) continue;
        if (!favSettingsValueEqual01518(state.snapshot.get(path), value)) {
            dirty.set(path, favCloneSetting01518(value));
        }
    }

    /* Later modules expand the UI-preference schema after this module loads.
     * Existing canonical leaves beat newly exposed stale aggregate/default
     * values; genuinely new leaves are seeded from the live normalized schema. */
    const { raw, baseline } = favReadCanonicalSettings01518(state, localNormalized);
    for (const [path, value] of dirty) favSetSettingPath01518(raw, path, value);

    const canonical = state.normalize(raw);
    favConvergeSettingsState01518(state, canonical, baseline);
    favApplySettingsInPlace01518(live, canonical);
    favMirrorSettingsAggregate01518(state, canonical);
    return live;
}

function favChangedSettingPaths01518(before, after) {
    const left = favFlattenSettings01518(before);
    const right = favFlattenSettings01518(after);
    const paths = new Set([...left.keys(), ...right.keys()]);
    return Array.from(paths).filter((path) =>
        !favSettingsValueEqual01518(left.get(path), right.get(path))
    );
}

function favRefreshSettingsFromStorage01518(state, incomingPath = '') {
    const live = state.getLive();
    if (!live) return;
    const before = state.normalize(live);
    const { raw, baseline } = favReadCanonicalSettings01518(state, before);
    const canonical = state.normalize(raw);
    favConvergeSettingsState01518(state, canonical, baseline);
    favApplySettingsInPlace01518(live, canonical);
    favMirrorSettingsAggregate01518(state, canonical);

    const changed = favChangedSettingPaths01518(before, canonical);
    if (incomingPath && !changed.includes(incomingPath)) changed.push(incomingPath);
    for (const path of changed) state.onRemote?.(path);
}

function favScheduleRemoteSettingsReconcile01518(kind, path) {
    const target = kind === 'config' ? favRemoteConfigPaths01518 : favRemoteUiPrefPaths01518;
    target.add(path);
    if (favRemoteSettingsFrame01518) return;
    const schedule = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    favRemoteSettingsFrame01518 = schedule(() => {
        favRemoteSettingsFrame01518 = 0;
        const configPaths = Array.from(favRemoteConfigPaths01518);
        const prefPaths = Array.from(favRemoteUiPrefPaths01518);
        favRemoteConfigPaths01518.clear();
        favRemoteUiPrefPaths01518.clear();

        const modal = favState?.settingsModal;
        if (modal?.isConnected) {
            const autoSync = modal.querySelector?.('[data-ebsf-auto-sync]');
            const interval = modal.querySelector?.('[data-ebsf-auto-sync-interval]');
            const autoOpen = modal.querySelector?.('[data-ebsf-auto-open-active]');
            const availability = modal.querySelector?.('[data-ebsf-filter-availability-mode]');
            if (autoSync) autoSync.checked = favCfg.autoSync === true;
            if (interval) {
                interval.value = String(favUiPrefs.autoSyncIntervalHours);
                interval.disabled = favCfg.autoSync !== true;
            }
            if (autoOpen) autoOpen.checked = favUiPrefs.autoOpenActiveSections === true;
            if (availability && favUiPrefs.filterAvailabilityMode) availability.value = favUiPrefs.filterAvailabilityMode;
        }

        const renderConfigChanged = configPaths.some((entry) => !['autoSync','autoScanMissingMetadata'].includes(entry));
        const sortChanged = configPaths.some((entry) => entry === 'sort' || entry === 'sortReversed')
            || prefPaths.some((entry) => entry === 'sortMenuOrder' || entry === 'sortMenuHidden');
        const layoutChanged = prefPaths.some((entry) =>
            entry.startsWith('filterSection')
            || entry.startsWith('filterOption')
            || entry === 'filterAvailabilityMode'
            || entry === 'hideUnavailableCatalogFilters'
        );

        if (sortChanged) {
            try { favEnsureVisibleActiveSort0110?.(); } catch (_) {}
            try { favRebuildSortControl0110?.(); } catch (_) {}
            try { favUpdateSortUi?.(); } catch (_) {}
        }
        if (layoutChanged && favState?.filterOpen && favState?.rail) {
            try { favRefreshRail?.(); } catch (_) {}
        }
        if (favState?.layoutModal?.isConnected && prefPaths.length) {
            try { favRenderLayoutEditor0110?.(favState.layoutModal.dataset.activeTab || 'filters'); } catch (_) {}
        }
        if (renderConfigChanged && typeof isFavoritesPage === 'function' && isFavoritesPage()) {
            favState.localPage = 1;
            try {
                const pending = favReapply?.();
                if (pending?.catch) pending.catch(() => {});
            } catch (_) {}
        }
    });
}

var favConfigStorageState01518 = favSettingsState01518({
    name:'config',
    baseKey:FAV_STORAGE_KEY,
    normalize:(value) => favNormalizeStoredConfig01518(value),
    getLive:() => favCfg,
    onRemote:(path) => favScheduleRemoteSettingsReconcile01518('config', path),
});
var favUiStorageState01518 = favSettingsState01518({
    name:'ui-prefs',
    baseKey:FAV_UI_PREFS_STORAGE_KEY,
    normalize:(value) => favNormalizeUiPrefs(value),
    getLive:() => favUiPrefs,
    onRemote:(path) => favScheduleRemoteSettingsReconcile01518('ui', path),
});

favSeedAndOverlaySettings01518(favConfigStorageState01518);
favSeedAndOverlaySettings01518(favUiStorageState01518);

favSaveConfig = function favSaveConfig01518() {
    return favCommitSettings01518(favConfigStorageState01518);
};

favSaveUiPrefs = function favSaveUiPrefs01518() {
    return favCommitSettings01518(favUiStorageState01518);
};
