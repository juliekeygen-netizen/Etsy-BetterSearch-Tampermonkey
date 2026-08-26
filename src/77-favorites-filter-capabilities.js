'use strict';

/* v0.11.0 Favorites filter option mapping and availability capabilities. */

function favOptionKeyFromElement0110(sectionKey, element) {
    if (!element) return '';
    const input = element.matches?.('input,select') ? element : element.querySelector?.('input,select');
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    const value = String(input?.value || '').toLowerCase();
    const placeholder = String(input?.placeholder || '').toLowerCase();

    if (sectionKey === 'search') {
        if (/strict title/i.test(text)) return 'strict-title';
        if (/multi-search/i.test(text)) return 'multi-search';
    }
    if (sectionKey === 'category') {
        const match = FAV_NATIVE_CATEGORIES_.find(([, label]) => label === text);
        return match?.[0] || '';
    }
    if (sectionKey === 'special-offers') {
        if (/free shipping/i.test(text)) return 'free-shipping';
        if (/on sale/i.test(text)) return 'on-sale';
    }
    if (sectionKey === 'item-format') {
        if (value === 'all' || /^all items$/i.test(text)) return 'all-items';
        if (value === 'false' || /exclude digital/i.test(text)) return 'physical';
        if (value === 'true' || /digital downloads only/i.test(text)) return 'digital';
    }
    if (sectionKey === 'etsys-best') {
        if (/etsy.?s picks/i.test(text)) return 'etsys-picks';
        if (/star seller/i.test(text)) return 'star-seller';
    }
    if (sectionKey === 'ships-from') {
        if (['anywhere','europe','local','country'].includes(value)) return value;
        if (/anywhere/i.test(text)) return 'anywhere';
        if (/europe/i.test(text)) return 'europe';
        if (/another country/i.test(text)) return 'country';
        return 'local';
    }
    if (sectionKey === 'ready-to-ship-in') {
        if (/1[–-]3 days/i.test(text)) return '1-3-days';
        if (/^1 day$/i.test(text)) return '1-day';
    }
    if (sectionKey === 'price') return 'price-range';
    if (sectionKey === 'item-type' && /vintage/i.test(text)) return 'vintage';
    if (sectionKey === 'ordering-options') {
        if (/gift cards/i.test(text)) return 'gift-cards';
        if (/gift-wrapped/i.test(text)) return 'gift-wrap';
        if (/customizable/i.test(text)) return 'customizable';
    }
    if (sectionKey === 'ship-to') return 'destination';
    if (sectionKey === 'availability') {
        if (/available only/i.test(text)) return 'available-only';
        if (/minimum discount/i.test(text)) return 'min-discount';
    }
    if (sectionKey === 'rating-and-reviews') {
        if (/rating/.test(placeholder) || /rating/i.test(text)) return 'min-rating';
        if (/review/.test(placeholder) || /review/i.test(text)) return 'min-reviews';
    }
    if (sectionKey === 'seller') return 'shop';
    if (sectionKey === 'listing-features') {
        if (/best seller/i.test(text)) return 'best-seller';
        if (/variations/i.test(text)) return 'has-variations';
    }
    if (sectionKey === 'popularity-and-stock') {
        if (/low stock/i.test(text)) return 'low-stock';
        if (/carts/i.test(text)) return 'min-carts';
    }
    if (sectionKey === 'delivery') {
        if (/maximum shipping/i.test(text)) return 'max-shipping';
        if (/returns accepted/i.test(text)) return 'returns';
        if (/exchanges accepted/i.test(text)) return 'exchanges';
    }
    return '';
}

function favOptionUnits0110(sectionKey, section) {
    const body = section?.querySelector?.('.ebsf-section-body');
    if (!body) return [];
    let elements = [];

    if (sectionKey === 'search') {
        elements = Array.from(body.querySelectorAll('.ebsf-search-split'));
    } else if (sectionKey === 'category') {
        elements = Array.from(body.querySelectorAll('.ebsf-native-link')).filter((node) => !/^all categories$/i.test(String(node.textContent || '').trim()));
    } else if (sectionKey === 'price' || sectionKey === 'seller' || sectionKey === 'ship-to') {
        const group = body.querySelector('.ebsf-native-group');
        if (group) elements = [group];
    } else if (sectionKey === 'rating-and-reviews') {
        elements = Array.from(body.querySelectorAll('.ebsf-native-two-col > .ebsf-native-number-wrap'));
    } else {
        const group = body.querySelector('.ebsf-native-group') || body;
        const helpRows = Array.from(group.querySelectorAll(':scope > .ebsf-native-help-row'));
        const choices = Array.from(group.querySelectorAll(':scope > .ebsf-native-choice'));
        const fields = Array.from(group.querySelectorAll(':scope > .ebsf-native-field'));
        elements = [...helpRows, ...choices, ...fields];
    }

    const out = [];
    const strictPanel = sectionKey === 'search' ? body.querySelector('.ebsf-strict-settings') : null;
    for (const element of elements) {
        const key = favOptionKeyFromElement0110(sectionKey, element);
        if (!key) continue;
        const unitElements = [element];
        if (key === 'strict-title' && strictPanel) unitElements.push(strictPanel);
        element.dataset.ebsfOptionKey = key;
        out.push({ key, element, elements:unitElements, parent:element.parentElement });
    }
    return out;
}

function favOptionActive0110(sectionKey, optionKey) {
    const f = favCfg.filters || {};
    if (sectionKey === 'search') return optionKey === 'strict-title' ? favCfg.strict === true : optionKey === 'multi-search' ? favCfg.multi === true : false;
    if (sectionKey === 'category') return String(f.category || '') === optionKey;
    if (sectionKey === 'special-offers') return optionKey === 'free-shipping' ? f.freeShipping === true : optionKey === 'on-sale' ? f.onSale === true : false;
    if (sectionKey === 'item-format') return optionKey === 'all-items' ? f.itemFormat === 'all' : optionKey === 'physical' ? f.itemFormat === 'physical' : optionKey === 'digital' ? f.itemFormat === 'digital' : false;
    if (sectionKey === 'etsys-best') return optionKey === 'etsys-picks' ? f.etsysPick === true : optionKey === 'star-seller' ? f.starSeller === true : false;
    if (sectionKey === 'ships-from') return String(f.shipsFrom || 'anywhere') === optionKey;
    if (sectionKey === 'ready-to-ship-in') return optionKey === '1-day' ? f.ready1Day === true : optionKey === '1-3-days' ? f.ready3Days === true : false;
    if (sectionKey === 'price') return Boolean(f.minPrice || f.maxPrice);
    if (sectionKey === 'item-type') return f.vintage === true;
    if (sectionKey === 'ordering-options') return optionKey === 'gift-cards' ? false : optionKey === 'gift-wrap' ? f.giftWrap === true : optionKey === 'customizable' ? f.personalizable === true : false;
    if (sectionKey === 'ship-to') return Boolean(f.shipTo && String(f.shipTo).toUpperCase() !== 'ZZ');
    if (sectionKey === 'availability') return optionKey === 'available-only' ? f.availableOnly === true : optionKey === 'min-discount' ? Boolean(f.minDiscount) : false;
    if (sectionKey === 'rating-and-reviews') return optionKey === 'min-rating' ? Boolean(f.minRating) : optionKey === 'min-reviews' ? Boolean(f.minReviews) : false;
    if (sectionKey === 'seller') return Boolean(f.shop);
    if (sectionKey === 'listing-features') return optionKey === 'best-seller' ? f.bestSeller === true : optionKey === 'has-variations' ? f.hasVariations === true : false;
    if (sectionKey === 'popularity-and-stock') return optionKey === 'low-stock' ? f.lowStock === true : optionKey === 'min-carts' ? Boolean(f.minCarts) : false;
    if (sectionKey === 'delivery') return optionKey === 'max-shipping' ? Boolean(f.maxShipping) : optionKey === 'returns' ? f.returns === true : optionKey === 'exchanges' ? f.exchanges === true : false;
    return false;
}

function favAvailabilityCaps0110(records) {
    return favCatalogueCapabilities0101(Array.isArray(records) ? records : []);
}

function favOptionAvailable0110(sectionKey, optionKey, caps, records) {
    if (favAvailabilityMode0110() === 'disabled') return true;
    const deepUnknown = !favDeepVisibilityReady0110();
    const active = favOptionActive0110(sectionKey, optionKey);
    if (active) return true;

    if (sectionKey === 'search') return true;
    if (sectionKey === 'category') {
        if (deepUnknown) return true;
        return records.some((record) => favCategoryMatch(record.deepMetadata?.category, optionKey));
    }
    if (sectionKey === 'special-offers') return optionKey === 'free-shipping' ? caps.freeShipping : caps.onSale;
    if (sectionKey === 'item-format') return optionKey === 'all-items' || (optionKey === 'digital' ? caps.digital : caps.physical);
    if (sectionKey === 'etsys-best') return optionKey === 'etsys-picks' ? (deepUnknown || caps.etsysPick) : caps.starSeller;
    if (sectionKey === 'ships-from') {
        if (optionKey === 'anywhere') return true;
        if (!caps.shipsFromCodes?.size) return true;
        if (optionKey === 'europe') return Array.from(caps.shipsFromCodes || []).some((code) => FAV_EUROPE_COUNTRY_CODES0101.has(code));
        if (optionKey === 'local') return caps.shipsFromCodes?.has(favNormalizeCountryCode0101(favProps()?.countryIsoCode || ''));
        return Boolean(caps.shipsFromCodes?.size);
    }
    if (sectionKey === 'ready-to-ship-in') return true;
    if (sectionKey === 'price') return caps.price;
    if (sectionKey === 'item-type') return deepUnknown || caps.vintage;
    if (sectionKey === 'ordering-options') {
        if (optionKey === 'gift-cards') return true;
        if (optionKey === 'gift-wrap') return deepUnknown || caps.giftWrap;
        return caps.personalizable;
    }
    if (sectionKey === 'ship-to') return true;
    if (sectionKey === 'availability') return optionKey === 'available-only' ? caps.soldOut : caps.discount;
    if (sectionKey === 'rating-and-reviews') return optionKey === 'min-rating' ? caps.rating : caps.reviews;
    if (sectionKey === 'seller') return caps.shops?.size > 1;
    if (sectionKey === 'listing-features') return optionKey === 'best-seller' ? caps.bestSeller : caps.variations;
    if (sectionKey === 'popularity-and-stock') return optionKey === 'low-stock' ? caps.lowStock : caps.carts;
    if (sectionKey === 'delivery') {
        if (optionKey === 'max-shipping') return caps.shipping;
        if (optionKey === 'returns') return caps.returns;
        return caps.exchanges;
    }
    return true;
}
