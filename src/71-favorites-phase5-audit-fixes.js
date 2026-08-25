'use strict';

/* v0.10.1 Phase 5 integration/audit fixes.
 *
 * Phase 5 successfully persisted deep listing observations, but several of the
 * resulting fields never made it back into live Favorites records. This module
 * closes that integration gap, adds catalogue-aware filter pruning, removes the
 * unwanted video filter, and makes deep-scan progress as informative as the
 * ordinary Favorites sync progress without changing the native search footprint.
 */

/* ---------- Production config cleanup ---------- */

var favDefaultConfigBefore0101 = favDefaultConfig;
favDefaultConfig = function favDefaultConfig0101() {
    const config = favDefaultConfigBefore0101();
    if (config?.filters) delete config.filters.hasVideo;
    return config;
};

var favNormalizeConfigBefore0101 = favNormalizeConfig;
favNormalizeConfig = function favNormalizeConfig0101(raw) {
    const config = favNormalizeConfigBefore0101(raw);
    if (config?.filters) delete config.filters.hasVideo;
    return config;
};

favCfg = favNormalizeConfig(favCfg);
favSaveConfig();

var favHasActiveFiltersBefore0101 = favHasActiveFilters;
favHasActiveFilters = function favHasActiveFilters0101() {
    const filters = favCfg.filters || {};
    const shipTo = String(filters.shipTo || '').toUpperCase();
    return favHasActiveFiltersBefore0101()
        || filters.ready1Day === true
        || filters.ready3Days === true
        || Boolean(shipTo && shipTo !== 'ZZ');
};

/* ---------- Preferences ---------- */

var favNormalizeUiPrefsBefore0101 = favNormalizeUiPrefs;
favNormalizeUiPrefs = function favNormalizeUiPrefs0101(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        ...favNormalizeUiPrefsBefore0101(source),
        hideUnavailableCatalogFilters: source.hideUnavailableCatalogFilters === true,
    };
};

favUiPrefs = favNormalizeUiPrefs(GM_getValue(FAV_UI_PREFS_STORAGE_KEY, favUiPrefs || {}));

/* ---------- Indexed deep metadata -> live Favorites records ---------- */

function favKnownIndexedValue0101(group, key) {
    const field = group?.[key];
    return field?.known === true ? field.value : undefined;
}

function favApplyKnownBoolean0101(record, property, knownKey, value) {
    if (typeof value !== 'boolean') return;
    record[property] = value;
    record.known = record.known || {};
    record.known[knownKey] = true;
}

function favApplyKnownNumber0101(record, property, knownKey, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    record[property] = number;
    record.known = record.known || {};
    record.known[knownKey] = true;
}

var favIndexApplyListingMetadataToRecordBefore0101 = favIndexApplyListingMetadataToRecord;
favIndexApplyListingMetadataToRecord = function favIndexApplyListingMetadataToRecord0101(record, listing) {
    record = favIndexApplyListingMetadataToRecordBefore0101(record, listing);
    if (!record || !listing) return record;

    const card = listing.cardMetadata || {};
    const shipping = listing.shippingMetadata || {};

    favApplyKnownNumber0101(record, 'price', 'price', favKnownIndexedValue0101(card, 'price'));
    favApplyKnownNumber0101(record, 'rating', 'rating', favKnownIndexedValue0101(card, 'rating'));
    favApplyKnownNumber0101(record, 'reviews', 'reviews', favKnownIndexedValue0101(card, 'reviewCount'));
    favApplyKnownBoolean0101(record, 'isOnSale', 'isOnSale', favKnownIndexedValue0101(card, 'onSale'));
    favApplyKnownBoolean0101(record, 'hasFreeShipping', 'hasFreeShipping', favKnownIndexedValue0101(card, 'freeShipping'));
    favApplyKnownBoolean0101(record, 'isDownload', 'isDownload', favKnownIndexedValue0101(card, 'digital'));
    favApplyKnownBoolean0101(record, 'isBestSeller', 'isBestSeller', favKnownIndexedValue0101(card, 'bestSeller'));
    favApplyKnownBoolean0101(record, 'isPersonalizable', 'isPersonalizable', favKnownIndexedValue0101(card, 'personalizable'));
    favApplyKnownBoolean0101(record, 'hasVariations', 'hasVariations', favKnownIndexedValue0101(card, 'hasVariations'));

    favApplyKnownNumber0101(record, 'shipping', 'shipping', favKnownIndexedValue0101(shipping, 'cost'));
    favApplyKnownBoolean0101(record, 'acceptsReturns', 'acceptsReturns', favKnownIndexedValue0101(shipping, 'returnsAccepted'));
    favApplyKnownBoolean0101(record, 'acceptsExchanges', 'acceptsExchanges', favKnownIndexedValue0101(shipping, 'exchangesAccepted'));
    favApplyKnownNumber0101(record, 'processingDays', 'processingDays', favKnownIndexedValue0101(shipping, 'processingDays'));

    const estimatedDelivery = favKnownIndexedValue0101(shipping, 'estimatedDelivery');
    if (estimatedDelivery != null && String(estimatedDelivery)) {
        record.estimatedDelivery = String(estimatedDelivery);
        record.known = record.known || {};
        record.known.estimatedDelivery = true;
    }

    const shipsTo = favKnownIndexedValue0101(shipping, 'shipsTo');
    if (Array.isArray(shipsTo)) {
        record.shipsToCountries = Array.from(new Set(shipsTo.map((value) => String(value)).filter(Boolean)));
        record.known = record.known || {};
        record.known.shipsTo = true;
    }

    if (listing.availabilityState === 'sold-out') {
        record.isSoldOut = true;
        record.known = record.known || {};
        record.known.isSoldOut = true;
    } else if (listing.availabilityState === 'available') {
        record.isSoldOut = false;
        record.known = record.known || {};
        record.known.isSoldOut = true;
    }

    return record;
};

var favIndexHydrateRecordsBefore0101 = favIndexHydrateRecords;
favIndexHydrateRecords = async function favIndexHydrateRecords0101(records) {
    const list = await favIndexHydrateRecordsBefore0101(records);
    const shopIds = Array.from(new Set(list.map((record) => String(record?.shopId || '')).filter(Boolean)));
    if (!shopIds.length) return list;

    try {
        const db = await favIndexOpen();
        const store = db.transaction('shops', 'readonly').objectStore('shops');
        const shops = await Promise.all(shopIds.map((shopId) => favIndexRequest(store.get(shopId))));
        const byId = new Map(shopIds.map((shopId, index) => [shopId, shops[index]]));
        for (const record of list) {
            const starSeller = byId.get(String(record?.shopId || ''))?.starSeller;
            if (starSeller?.known !== true || typeof starSeller.value !== 'boolean') continue;
            record.isStarSeller = starSeller.value;
            record.known = record.known || {};
            record.known.isStarSeller = true;
        }
    } catch (_) {
        /* A shop-hydration failure must not block listing filtering. */
    }
    return list;
};

/* The only remaining rail placeholder is seller-origin filtering. A deep scan
 * currently cannot populate that field, so do not misleadingly promise that a
 * listing-metadata scan will unlock it. */
favDeepMetadataNote = function favDeepMetadataNote0101() {
    const note = document.createElement('p');
    note.className = 'ebsf-metadata-pending';
    note.textContent = 'Not available from current metadata';
    return note;
};

/* ---------- Newly usable deep filters ---------- */

function favNormalizeCountryCode0101(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[a-z]{2}$/i.test(raw)) return raw.toUpperCase();
    const wanted = normalize(raw);
    for (const code of FAV_COUNTRY_CODES_) {
        if (normalize(favCountryName(code)) === wanted) return code;
    }
    return raw.toUpperCase();
}

function favRecordShipsTo0101(record, selectedCountry) {
    const wanted = favNormalizeCountryCode0101(selectedCountry);
    if (!wanted || wanted === 'ZZ') return true;
    const values = Array.isArray(record?.shipsToCountries) ? record.shipsToCountries : [];
    return values.some((value) => favNormalizeCountryCode0101(value) === wanted);
}

var favFilteredRecordsBefore0101 = favFilteredRecords;
favFilteredRecords = function favFilteredRecords0101() {
    const filters = favCfg.filters || {};
    let records = favFilteredRecordsBefore0101();

    if (filters.ready1Day || filters.ready3Days) {
        const maxDays = filters.ready3Days ? 3 : 1;
        records = records.filter((record) => Number.isFinite(record.processingDays) && record.processingDays <= maxDays);
    }

    const shipTo = String(filters.shipTo || '').toUpperCase();
    if (shipTo && shipTo !== 'ZZ') records = records.filter((record) => favRecordShipsTo0101(record, shipTo));

    return records;
};

function favBuildReady() {
    const filters = favCfg.filters;
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-native-group';
    wrap.append(
        favCheckbox({
            checked: filters.ready1Day,
            label: '1 day',
            onChange: (value) => { filters.ready1Day = value; favSaveAndApply(true); },
        }).row,
        favCheckbox({
            checked: filters.ready3Days,
            label: '1–3 days',
            onChange: (value) => { filters.ready3Days = value; favSaveAndApply(true); },
        }).row,
    );
    return wrap;
}

function favCatalogueDeepComplete0101(records = favState.records) {
    return Boolean(
        favState.loadComplete
        && records.length
        && records.every((record) => Number(record?.deepMetadata?.scannedAt) > 0)
    );
}

function favCatalogueShipToCodes0101(records = favState.records) {
    const codes = new Set();
    for (const record of records) {
        for (const value of Array.isArray(record?.shipsToCountries) ? record.shipsToCountries : []) {
            const code = favNormalizeCountryCode0101(value);
            if (code) codes.add(code);
        }
    }
    return codes;
}

function favFilterCountryOptions0101(options, allowed, selected) {
    const keep = new Set(['ZZ', selected, ...allowed].filter(Boolean));
    return options.flatMap((option) => {
        if (!option.group) return keep.has(option.value) ? [option] : [];
        const children = (option.options || []).filter((child) => keep.has(child.value));
        return children.length ? [{ ...option, options:children }] : [];
    });
}

function favBuildShipTo() {
    const filters = favCfg.filters;
    const country = String(favProps()?.countryIsoCode || 'FI').toUpperCase();
    const selected = String(filters.shipTo || 'ZZ').toUpperCase();
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-native-group';

    let options = favCountryOptions(true);
    if (favUiPrefs.hideUnavailableCatalogFilters && favCatalogueDeepComplete0101()) {
        options = favFilterCountryOptions0101(options, favCatalogueShipToCodes0101(), selected);
    }

    wrap.append(favSelect(
        selected || country,
        options,
        (value) => {
            filters.shipTo = value === 'ZZ' ? '' : value;
            favSaveAndApply(true);
        }
    ));
    return wrap;
}

/* ---------- Catalogue-aware filter visibility ---------- */

function favCatalogueCapabilities0101(records = favState.records) {
    const any = (predicate) => records.some(predicate);
    const shops = new Set(records.map((record) => String(record.shopName || '')).filter(Boolean));
    return {
        loaded: favState.loadComplete === true,
        deepComplete: favCatalogueDeepComplete0101(records),
        freeShipping: any((record) => record.hasFreeShipping === true || record.shipping === 0),
        onSale: any((record) => record.isOnSale === true || Number(record.discountPercent) > 0),
        digital: any((record) => record.known?.isDownload === true && record.isDownload === true),
        physical: any((record) => record.known?.isDownload === true && record.isDownload === false),
        etsysPick: any((record) => record.deepMetadata?.etsysPick === true),
        starSeller: any((record) => record.isStarSeller === true),
        ready1: any((record) => Number.isFinite(record.processingDays) && record.processingDays <= 1),
        ready3: any((record) => Number.isFinite(record.processingDays) && record.processingDays <= 3),
        price: any((record) => Number.isFinite(record.price)),
        vintage: any((record) => record.deepMetadata?.vintage === true),
        giftWrap: any((record) => record.deepMetadata?.giftWrap === true),
        personalizable: any((record) => record.isPersonalizable === true),
        soldOut: any((record) => record.known?.isSoldOut === true && record.isSoldOut === true),
        discount: any((record) => Number(record.discountPercent) > 0),
        rating: any((record) => Number.isFinite(record.rating)),
        reviews: any((record) => Number.isFinite(record.reviews)),
        shops,
        bestSeller: any((record) => record.isBestSeller === true),
        variations: any((record) => record.hasVariations === true),
        lowStock: any((record) => Number.isFinite(record.stockLeft)),
        carts: any((record) => Number.isFinite(record.carts)),
        shipping: any((record) => Number.isFinite(record.shipping)),
        returns: any((record) => record.known?.acceptsReturns === true && record.acceptsReturns === true),
        exchanges: any((record) => record.known?.acceptsExchanges === true && record.acceptsExchanges === true),
        shipToCodes: favCatalogueShipToCodes0101(records),
        category: any((record) => Array.isArray(record.deepMetadata?.category) && record.deepMetadata.category.length > 0),
    };
}

function favSectionNode0101(rail, key) {
    return rail?.querySelector?.(`[data-ebsf-section="${key}"]`) || null;
}

function favRemoveChoice0101(rail, key, label, available, active = false) {
    if (available || active) return;
    const section = favSectionNode0101(rail, key);
    if (!section) return;
    for (const text of section.querySelectorAll('.ebsf-native-choice-label')) {
        if (String(text.textContent || '').trim() !== label) continue;
        const choice = text.closest('.ebsf-native-choice');
        const helpRow = choice?.closest('.ebsf-native-help-row');
        (helpRow || choice)?.remove();
    }
}

function favRemoveField0101(rail, key, text, available, active = false) {
    if (available || active) return;
    const section = favSectionNode0101(rail, key);
    if (!section) return;
    for (const field of section.querySelectorAll('.ebsf-native-field')) {
        if (!normalize(field.textContent).includes(normalize(text))) continue;
        field.remove();
    }
}

function favSetSectionVisible0101(rail, key, visible) {
    const section = favSectionNode0101(rail, key);
    if (section) section.hidden = !visible;
}

function favPruneCategory0101(rail, caps) {
    if (!caps.deepComplete) return;
    const section = favSectionNode0101(rail, 'category');
    if (!section) return;
    const active = String(favCfg.filters.category || '');
    let availableCount = 0;
    for (const button of section.querySelectorAll('.ebsf-native-link')) {
        const label = String(button.textContent || '').trim();
        if (/^all categories$/i.test(label)) continue;
        const definition = FAV_NATIVE_CATEGORIES_.find((entry) => entry[1] === label);
        if (!definition) continue;
        const available = favState.records.some((record) => favCategoryMatch(record.deepMetadata?.category, definition[0]));
        if (available || active === definition[0]) availableCount += 1;
        else button.remove();
    }
    const more = section.querySelector('.ebsf-native-show-more');
    if (more && availableCount <= 5) more.remove();
    favSetSectionVisible0101(rail, 'category', availableCount > 0 || Boolean(active));
}

function favPruneUnavailableCatalogueFilters0101(rail) {
    /* The video filter is intentionally gone even when catalogue pruning is off. */
    favRemoveChoice0101(rail, 'listing-features', 'Has video', false, false);

    if (!favUiPrefs.hideUnavailableCatalogFilters || !favState.loadComplete || !favState.records.length) return rail;

    const filters = favCfg.filters;
    const caps = favCatalogueCapabilities0101();
    const deepUnknown = !caps.deepComplete;

    favPruneCategory0101(rail, caps);

    favRemoveChoice0101(rail, 'special-offers', 'Free shipping', caps.freeShipping, filters.freeShipping);
    favRemoveChoice0101(rail, 'special-offers', 'On sale', caps.onSale, filters.onSale);
    favSetSectionVisible0101(rail, 'special-offers', caps.freeShipping || caps.onSale || filters.freeShipping || filters.onSale);

    favSetSectionVisible0101(rail, 'item-format', (caps.digital && caps.physical) || filters.itemFormat !== 'all');

    favRemoveChoice0101(rail, 'etsys-best', "Etsy's Picks", deepUnknown || caps.etsysPick, filters.etsysPick);
    favRemoveChoice0101(rail, 'etsys-best', 'Star Seller', caps.starSeller, filters.starSeller);
    favSetSectionVisible0101(rail, 'etsys-best', deepUnknown || caps.etsysPick || caps.starSeller || filters.etsysPick || filters.starSeller);

    const shipsFromActive = filters.shipsFrom !== 'anywhere' || Boolean(filters.shipsFromCity || filters.shipsFromCountry);
    favSetSectionVisible0101(rail, 'ships-from', shipsFromActive);

    favRemoveChoice0101(rail, 'ready-to-ship-in', '1 day', deepUnknown || caps.ready1, filters.ready1Day);
    favRemoveChoice0101(rail, 'ready-to-ship-in', '1–3 days', deepUnknown || caps.ready3, filters.ready3Days);
    favSetSectionVisible0101(rail, 'ready-to-ship-in', deepUnknown || caps.ready1 || caps.ready3 || filters.ready1Day || filters.ready3Days);

    favSetSectionVisible0101(rail, 'price', caps.price || Boolean(filters.minPrice || filters.maxPrice));

    favRemoveChoice0101(rail, 'item-type', 'Vintage', deepUnknown || caps.vintage, filters.vintage);
    favSetSectionVisible0101(rail, 'item-type', deepUnknown || caps.vintage || filters.vintage);

    favRemoveChoice0101(rail, 'ordering-options', 'Accepts Etsy gift cards', false, filters.giftCards);
    favRemoveChoice0101(rail, 'ordering-options', 'Can be gift-wrapped', deepUnknown || caps.giftWrap, filters.giftWrap);
    favRemoveChoice0101(rail, 'ordering-options', 'Customizable', caps.personalizable, filters.personalizable);
    favSetSectionVisible0101(
        rail,
        'ordering-options',
        Boolean(filters.giftCards || filters.giftWrap || filters.personalizable || deepUnknown || caps.giftWrap || caps.personalizable)
    );

    const shipToActive = Boolean(filters.shipTo && String(filters.shipTo).toUpperCase() !== 'ZZ');
    favSetSectionVisible0101(rail, 'ship-to', deepUnknown || caps.shipToCodes.size > 0 || shipToActive);

    favRemoveChoice0101(rail, 'availability', 'Available only', caps.soldOut, filters.availableOnly);
    favRemoveField0101(rail, 'availability', 'Minimum discount', caps.discount, Boolean(filters.minDiscount));
    favSetSectionVisible0101(rail, 'availability', caps.soldOut || caps.discount || filters.availableOnly || Boolean(filters.minDiscount));

    const ratingSection = favSectionNode0101(rail, 'rating-and-reviews');
    if (ratingSection) {
        const inputs = Array.from(ratingSection.querySelectorAll('input[type="number"]'));
        if (!caps.rating && !filters.minRating) inputs.find((input) => /rating/i.test(input.placeholder || ''))?.closest('.ebsf-native-number-wrap')?.remove();
        if (!caps.reviews && !filters.minReviews) inputs.find((input) => /review/i.test(input.placeholder || ''))?.closest('.ebsf-native-number-wrap')?.remove();
    }
    favSetSectionVisible0101(rail, 'rating-and-reviews', caps.rating || caps.reviews || Boolean(filters.minRating || filters.minReviews));

    favSetSectionVisible0101(rail, 'seller', caps.shops.size > 1 || Boolean(filters.shop));

    favRemoveChoice0101(rail, 'listing-features', 'Best Seller', caps.bestSeller, filters.bestSeller);
    favRemoveChoice0101(rail, 'listing-features', 'Has variations', caps.variations, filters.hasVariations);
    favSetSectionVisible0101(rail, 'listing-features', caps.bestSeller || caps.variations || filters.bestSeller || filters.hasVariations);

    favRemoveChoice0101(rail, 'popularity-and-stock', 'Etsy reports low stock', caps.lowStock, filters.lowStock);
    favRemoveField0101(rail, 'popularity-and-stock', 'At least X carts', caps.carts, Boolean(filters.minCarts));
    favSetSectionVisible0101(rail, 'popularity-and-stock', caps.lowStock || caps.carts || filters.lowStock || Boolean(filters.minCarts));

    favRemoveField0101(rail, 'delivery', 'Maximum shipping cost', caps.shipping, Boolean(filters.maxShipping));
    favRemoveChoice0101(rail, 'delivery', 'Returns accepted', caps.returns, filters.returns);
    favRemoveChoice0101(rail, 'delivery', 'Exchanges accepted', caps.exchanges, filters.exchanges);
    favSetSectionVisible0101(rail, 'delivery', caps.shipping || caps.returns || caps.exchanges || Boolean(filters.maxShipping) || filters.returns || filters.exchanges);

    return rail;
}

var favBuildFilterRailBefore0101 = favBuildFilterRail;
favBuildFilterRail = function favBuildFilterRail0101() {
    const rail = favBuildFilterRailBefore0101();

    /* Reset is a filter action, not a background-settings or sort action. The
     * old handler rebuilt the entire config, which silently re-enabled automatic
     * deep scans and reset the independent sort mode. Replace that behavior. */
    const reset = rail.querySelector('.ebsf-native-reset');
    reset?.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const keep = {
            multiRules: favCfg.multiRules,
            autoSync: favCfg.autoSync,
            autoScanMissingMetadata: favCfg.autoScanMissingMetadata,
            sort: favCfg.sort,
            sortReversed: favCfg.sortReversed,
        };
        favCfg = favDefaultConfig();
        Object.assign(favCfg, keep);
        favState.strictSettingsOpen = false;
        favState.manualOpenSections.clear();
        favSaveConfig();
        favRefreshRail();
        await favReapply(true);
    }, true);

    return favPruneUnavailableCatalogueFilters0101(rail);
};

/* ---------- Deep scan progress: count + remaining + speed + ETA ---------- */

var favDeepProgressMetrics0101 = {
    startedAt: 0,
    lastDone: 0,
    samples: [],
};

function favDeepResetProgressMetrics0101(now = Date.now()) {
    favDeepProgressMetrics0101 = { startedAt:now, lastDone:0, samples:[{ at:now, done:0 }] };
}

function favDeepRate0101(now = Date.now()) {
    const metrics = favDeepProgressMetrics0101;
    const recent = metrics.samples.filter((sample) => now - sample.at <= 18000);
    const sampleSet = recent.length >= 2 ? recent : metrics.samples;
    if (sampleSet.length >= 2) {
        const first = sampleSet[0];
        const last = sampleSet[sampleSet.length - 1];
        const elapsed = last.at - first.at;
        const advanced = last.done - first.done;
        if (elapsed >= 500 && advanced > 0) return advanced / (elapsed / 1000);
    }
    const elapsed = now - metrics.startedAt;
    if (elapsed >= 1500 && metrics.lastDone > 0) return metrics.lastDone / (elapsed / 1000);
    return 0;
}

function favDeepEtaText0101(milliseconds) {
    const seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
    if (!seconds) return '';
    if (seconds < 60) return `~${seconds}s left`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes < 60) return `~${minutes}m${remainder ? ` ${remainder}s` : ''} left`;
    const hours = Math.floor(minutes / 60);
    return `~${hours}h ${minutes % 60}m left`;
}

var favDeepDispatchStateBefore0101 = favDeepDispatchState;
favDeepDispatchState = function favDeepDispatchState0101(detail = {}) {
    const now = Date.now();
    const nextStatus = detail.status || favDeepState.status;
    const starting = nextStatus === 'running' && favDeepState.status !== 'running';
    if (starting || !favDeepProgressMetrics0101.startedAt) favDeepResetProgressMetrics0101(now);

    if (nextStatus === 'running') {
        const done = Math.max(0, Number(detail.completed ?? favDeepState.completed) || 0)
            + Math.max(0, Number(detail.failed ?? favDeepState.failed) || 0);
        if (done > favDeepProgressMetrics0101.lastDone) {
            favDeepProgressMetrics0101.lastDone = done;
            favDeepProgressMetrics0101.samples.push({ at:now, done });
            favDeepProgressMetrics0101.samples = favDeepProgressMetrics0101.samples.filter((sample) => now - sample.at <= 30000);
        }
        const ratePerSecond = favDeepRate0101(now);
        const total = Math.max(0, Number(detail.total ?? favDeepState.total) || 0);
        const remaining = Math.max(0, total - done);
        detail = {
            ...detail,
            startedAt: favDeepProgressMetrics0101.startedAt,
            ratePerSecond,
            estimatedRemainingMs: ratePerSecond > 0 ? (remaining / ratePerSecond) * 1000 : 0,
        };
    }

    return favDeepDispatchStateBefore0101(detail);
};

var favDeepProgressModelBefore0101 = favDeepProgressModel;
favDeepProgressModel = function favDeepProgressModel0101(state = favDeepState) {
    const completed = Math.max(0, Number(state.completed) || 0);
    const failed = Math.max(0, Number(state.failed) || 0);
    const done = completed + failed;
    const total = Math.max(0, Number(state.total) || 0);
    if (!total) return favDeepProgressModelBefore0101(state);

    const remaining = Math.max(0, total - done);
    const rate = Math.max(0, Number(state.ratePerSecond) || 0);
    const parts = [`${done}/${total}`];
    if (remaining) parts.push(`${remaining} left`);
    if (rate > 0) parts.push(`${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)}/s`);
    const eta = favDeepEtaText0101(state.estimatedRemainingMs);
    if (eta) parts.push(eta);
    if (failed) parts.push(`${failed} failed`);

    return {
        title: 'Syncing',
        detail: parts.join(' · '),
        ratio: Math.min(1, done / total),
    };
};

/* If another trigger populates more jobs while the single worker is already
 * active (common when an authoritative Favorites sync completes), expand the
 * current run total instead of allowing completed > total. */
var favDeepPopulateQueueBefore0101 = favDeepPopulateQueue;
favDeepPopulateQueue = async function favDeepPopulateQueue0101(options = {}) {
    const added = await favDeepPopulateQueueBefore0101(options);
    if (added > 0 && favDeepState.status === 'running') {
        const activeJobs = (await favDeepQueueReadAll()).filter((job) => job.status === 'queued' || job.status === 'running');
        const done = Math.max(0, Number(favDeepState.completed) || 0) + Math.max(0, Number(favDeepState.failed) || 0);
        const total = Math.max(Number(favDeepState.total) || 0, done + activeJobs.length);
        if (total !== favDeepState.total) favDeepDispatchState({ status:'running', total });
    }
    return added;
};

/* A full Favorites load is also a valid discovery point for automatic deep
 * metadata, even when the user disabled ordinary Favorites auto-sync. */
var favLoadAllBefore0101 = favLoadAll;
favLoadAll = async function favLoadAll0101(force = false) {
    const records = await favLoadAllBefore0101(force);
    if (favState.loadComplete && records?.length) {
        await favIndexHydrateRecords(records);
        if (favCfg.autoScanMissingMetadata) queueMicrotask(() => { void favDeepMaybeAutoScan(); });
        if (favUiPrefs.hideUnavailableCatalogFilters && favState.filterOpen && !favState.extraReady) {
            void favEnsureExtraInfo().then(() => { if (favState.filterOpen) favRefreshRail(); });
        }
    }
    return records;
};

/* Rehydrate all current records once a deep run settles. The original Phase 5
 * completion listener already reapplies results; this guarantees every newly
 * indexed shipping/shop field is present before the next interaction and lets
 * catalogue-aware filter visibility update once, not once per listing. */
document.addEventListener('ebsf:favorites-deep-state', (event) => {
    if (event.detail?.status === 'running') return;
    if (!favState.records?.length) return;
    void favIndexHydrateRecords(favState.records).then(() => {
        if (favState.filterOpen) favRefreshRail();
    });
});

/* ---------- Preferences UI ---------- */

var favOpenSettingsModalBefore0101 = favOpenSettingsModal;
favOpenSettingsModal = function favOpenSettingsModal0101(event) {
    favOpenSettingsModalBefore0101(event);
    const layer = favState.settingsModal;
    const card = layer?.querySelector('[data-ebsf-settings-panel="preferences"] .ebsf-settings-card');
    if (!card || card.querySelector('[data-ebsf-hide-unavailable]')) return;

    const row = document.createElement('label');
    row.className = 'ebsf-settings-toggle ebsf-settings-rowline';
    row.innerHTML = `<span>
        <strong>Hide unavailable catalogue filters</strong>
        <small>Hide filter options that aren't available in your catalogue. Whole sections are hidden when none of their filters can match.</small>
    </span><input type="checkbox" data-ebsf-hide-unavailable ${favUiPrefs.hideUnavailableCatalogFilters ? 'checked' : ''}>`;
    card.append(row);

    row.querySelector('[data-ebsf-hide-unavailable]').addEventListener('change', (changeEvent) => {
        favUiPrefs.hideUnavailableCatalogFilters = changeEvent.target.checked;
        favSaveUiPrefs();
        if (!favState.filterOpen) return;
        if (!favUiPrefs.hideUnavailableCatalogFilters) {
            favRefreshRail();
            return;
        }
        void favLoadAll(false)
            .then(() => favEnsureExtraInfo())
            .finally(() => { if (favState.filterOpen) favRefreshRail(); });
    });
};

GM_addStyle(`
  /* Deep progress must stay a single compact line inside Etsy's search shell. */
  .ebsf-sync-progress-copy,
  .ebsf-sync-progress-copy strong,
  .ebsf-sync-progress-copy span{
    min-width:0!important;
    white-space:nowrap!important;
  }
  .ebsf-sync-progress-copy strong{
    overflow:hidden!important;
    text-overflow:ellipsis!important;
  }
`);
