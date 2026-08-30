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
 *  - a save writes only leaves that changed relative to this tab's canonical
 *    snapshot;
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
    const missing = favMissingSetting01518();
    const value = GM_getValue(favSettingsFieldKey01518(baseKey, path), missing);
    return value === missing ? { found:false, value:undefined } : { found:true, value };
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
    const listenerId = GM_addValueChangeListener(key, (_name, _oldValue, newValue, remote) => {
        if (remote !== true) return;
        const live = state.getLive();
        if (!live) return;
        const next = favCloneSetting01518(live);
        if (newValue === undefined) {
            const defaults = favFlattenSettings01518(state.normalize({}));
            if (!defaults.has(path)) return;
            favSetSettingPath01518(next, path, defaults.get(path));
        } else {
            favSetSettingPath01518(next, path, newValue);
        }
        const normalized = state.normalize(next);
        favApplySettingsInPlace01518(live, normalized);
        const normalizedFlat = favFlattenSettings01518(normalized);
        if (normalizedFlat.has(path)) state.snapshot.set(path, favCloneSetting01518(normalizedFlat.get(path)));
        state.onRemote?.(path);
    });
    state.listeners.set(path, listenerId);
}

function favSeedAndOverlaySettings01518(state) {
    const live = state.getLive();
    const normalized = state.normalize(live);
    const merged = favCloneSetting01518(normalized);
    const flat = favFlattenSettings01518(normalized);

    for (const [path, fallback] of flat) {
        const stored = favReadSettingsField01518(state.baseKey, path);
        if (stored.found) {
            favSetSettingPath01518(merged, path, stored.value);
        } else {
            GM_setValue(favSettingsFieldKey01518(state.baseKey, path), favCloneSetting01518(fallback));
        }
        favRegisterSettingsField01518(state, path);
    }

    const canonical = state.normalize(merged);
    favApplySettingsInPlace01518(live, canonical);
    state.snapshot = favFlattenSettings01518(canonical);
    GM_setValue(state.baseKey, favCloneSetting01518(canonical));
    return live;
}

function favCommitSettings01518(state) {
    const live = state.getLive();
    let normalized = state.normalize(live);
    let flat = favFlattenSettings01518(normalized);
    let canonical = favCloneSetting01518(normalized);
    let canonicalChanged = false;

    /* Later modules expand the UI-preference schema after this module loads.
     * Unknown paths therefore re-check canonical leaf storage before deciding
     * whether the newly visible in-memory value is authoritative. */
    for (const [path, value] of flat) {
        favRegisterSettingsField01518(state, path);
        if (!state.snapshot.has(path)) {
            const stored = favReadSettingsField01518(state.baseKey, path);
            if (stored.found) {
                favSetSettingPath01518(canonical, path, stored.value);
                canonicalChanged = true;
                state.snapshot.set(path, favCloneSetting01518(stored.value));
            } else {
                GM_setValue(favSettingsFieldKey01518(state.baseKey, path), favCloneSetting01518(value));
                state.snapshot.set(path, favCloneSetting01518(value));
            }
            continue;
        }
        const previous = state.snapshot.get(path);
        if (favSettingsValueEqual01518(previous, value)) continue;
        GM_setValue(favSettingsFieldKey01518(state.baseKey, path), favCloneSetting01518(value));
        state.snapshot.set(path, favCloneSetting01518(value));
    }

    if (canonicalChanged) {
        normalized = state.normalize(canonical);
        favApplySettingsInPlace01518(live, normalized);
        flat = favFlattenSettings01518(normalized);
        for (const [path, value] of flat) state.snapshot.set(path, favCloneSetting01518(value));
    } else {
        favApplySettingsInPlace01518(live, normalized);
    }

    /* Compatibility only. Fixed versions load canonical leaf keys over this
     * aggregate, so a stale aggregate write cannot erase unrelated leaf data. */
    GM_setValue(state.baseKey, favCloneSetting01518(state.normalize(live)));
    return live;
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
    normalize:(value) => favNormalizeConfig(value),
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
