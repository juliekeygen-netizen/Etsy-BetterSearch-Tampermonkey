'use strict';

/* Phase 4: deep listing-page parser foundation.
 *
 * This module intentionally does not own a scan queue. It provides:
 *   - a cheap, side-effect-free listing HTML parser;
 *   - one same-site fetch+parse primitive for Phase 5;
 *   - an IndexedDB merge path that preserves unknown/known semantics.
 *
 * Missing positive-only UI signals remain unknown. We only write false/zero
 * when Etsy explicitly exposes a negative/zero value.
 */

var FAV_DEEP_PARSER_VERSION = 'listing-html-v1';
var FAV_DEEP_SOURCE = 'listing-page-html';
var FAV_DEEP_SHIPPING_ORIGIN_VERSION = 'shipping-origin-v1';

function favDeepField(value, known = true, observedAt = Date.now(), source = FAV_DEEP_SOURCE) {
    return {
        value: known ? value : null,
        known: known === true,
        source,
        observedAt: Math.max(0, Number(observedAt) || 0),
        parserVersion: known ? FAV_DEEP_PARSER_VERSION : '',
    };
}

function favDeepUnknown(observedAt = 0) {
    return favDeepField(null, false, observedAt || 0, 'unknown');
}

function favDeepShippingOriginField(value, observedAt) {
    return {
        value,
        known: true,
        source: FAV_DEEP_SOURCE,
        observedAt: Math.max(0, Number(observedAt) || 0),
        parserVersion: FAV_DEEP_SHIPPING_ORIGIN_VERSION,
    };
}

function favDeepShippingOriginUnknown(observedAt) {
    return {
        value: null,
        known: false,
        source: 'unknown',
        observedAt: Math.max(0, Number(observedAt) || 0),
        parserVersion: FAV_DEEP_SHIPPING_ORIGIN_VERSION,
    };
}

function favDeepDecodeText(value) {
    return String(value ?? '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;|&#34;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return ''; }
        })
        .replace(/&#(\d+);/g, (_m, dec) => {
            try { return String.fromCodePoint(parseInt(dec, 10)); } catch (_) { return ''; }
        });
}

function favDeepPlainText(html) {
    return favDeepDecodeText(
        String(html || '')
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
}

function favDeepNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
    const text = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return Number.NaN;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : Number.NaN;
}

function favDeepTypeIncludes(node, type) {
    const actual = node?.['@type'];
    if (Array.isArray(actual)) return actual.some((entry) => String(entry).toLowerCase() === String(type).toLowerCase());
    return String(actual || '').toLowerCase() === String(type).toLowerCase();
}

function favDeepFlattenJson(value, out = []) {
    if (!value || typeof value !== 'object') return out;
    out.push(value);
    if (Array.isArray(value)) {
        for (const child of value) favDeepFlattenJson(child, out);
        return out;
    }
    for (const child of Object.values(value)) {
        if (child && typeof child === 'object') favDeepFlattenJson(child, out);
    }
    return out;
}

function favDeepJsonLdNodes(html) {
    const nodes = [];
    const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(String(html || '')))) {
        const raw = favDeepDecodeText(match[1]).trim();
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            favDeepFlattenJson(parsed, nodes);
        } catch (_) {
            /* Ignore malformed/non-JSON scripts rather than treating fields as false. */
        }
    }
    return nodes;
}

function favDeepFirstType(nodes, type) {
    return (nodes || []).find((node) => favDeepTypeIncludes(node, type)) || null;
}

function favDeepOffer(product, nodes) {
    const offers = product?.offers;
    if (Array.isArray(offers)) return offers.find((offer) => offer && typeof offer === 'object') || null;
    if (offers && typeof offers === 'object') return offers;
    return favDeepFirstType(nodes, 'Offer');
}

function favDeepBreadcrumbPath(nodes) {
    const breadcrumb = favDeepFirstType(nodes, 'BreadcrumbList');
    const items = Array.isArray(breadcrumb?.itemListElement) ? breadcrumb.itemListElement : [];
    return items
        .map((entry) => {
            const item = entry?.item;
            return favDeepDecodeText(entry?.name || item?.name || (typeof item === 'string' ? '' : '')).trim();
        })
        .filter(Boolean)
        .filter((name) => !/^(etsy|home)$/i.test(name));
}

function favDeepStructuredBoolean(html, keys) {
    const text = String(html || '');
    for (const key of keys) {
        const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = text.match(new RegExp(`["']${escaped}["']\\s*:\\s*(true|false)`, 'i'));
        if (match) return match[1].toLowerCase() === 'true';
    }
    return null;
}

function favDeepSemanticBoolean(text, positivePatterns, negativePatterns = []) {
    for (const pattern of negativePatterns) if (pattern.test(text)) return false;
    for (const pattern of positivePatterns) if (pattern.test(text)) return true;
    return null;
}

function favDeepListingId(html, baseUrl = '') {
    const urlMatch = String(baseUrl || '').match(/\/listing\/(\d+)/i);
    if (urlMatch) return urlMatch[1];
    const htmlMatch = String(html || '').match(/(?:listing[_-]?id|listingId)(?:&quot;|["'])?\s*(?::|=)\s*(?:&quot;|["'])?(\d{5,})/i);
    return htmlMatch?.[1] || '';
}

function favDeepNormalizeAvailability(value) {
    const text = String(value || '').toLowerCase();
    if (!text) return 'unknown';
    if (/outofstock|soldout|discontinued|offline/.test(text)) return 'sold-out';
    if (/instock|preorder|presale|limitedavailability/.test(text)) return 'available';
    return 'unknown';
}

function favDeepShippingFromOffer(offer, observedAt) {
    const result = {
        cost: favDeepUnknown(),
        freeShipping: favDeepUnknown(),
        shipsTo: favDeepUnknown(),
        processingDays: favDeepUnknown(),
    };
    const details = offer?.shippingDetails;
    const list = Array.isArray(details) ? details : (details && typeof details === 'object' ? [details] : []);
    if (!list.length) return result;

    const costs = [];
    const destinations = [];
    const handlingUpper = [];
    for (const detail of list) {
        const rate = detail?.shippingRate;
        const amount = favDeepNumber(rate?.value ?? rate?.price ?? rate);
        if (Number.isFinite(amount)) costs.push(amount);

        const destination = detail?.shippingDestination;
        const country = destination?.addressCountry || destination?.name;
        if (country) destinations.push(String(country));

        const handling = detail?.deliveryTime?.handlingTime;
        const upper = favDeepNumber(handling?.maxValue ?? handling?.value);
        if (Number.isFinite(upper)) handlingUpper.push(upper);
    }

    if (costs.length) {
        const cost = Math.min(...costs);
        result.cost = favDeepField(cost, true, observedAt);
        result.freeShipping = favDeepField(cost === 0, true, observedAt);
    }
    if (destinations.length) result.shipsTo = favDeepField(Array.from(new Set(destinations)), true, observedAt);
    if (handlingUpper.length) result.processingDays = favDeepField(Math.max(...handlingUpper), true, observedAt);
    return result;
}

function favDeepParseListingHtml(html, baseUrl = '', options = {}) {
    const observedAt = Math.max(0, Number(options.observedAt) || Date.now());
    const sourceHtml = String(html || '');
    const plain = favDeepPlainText(sourceHtml);
    const nodes = favDeepJsonLdNodes(sourceHtml);
    const product = favDeepFirstType(nodes, 'Product');
    const offer = favDeepOffer(product, nodes);
    const breadcrumbs = favDeepBreadcrumbPath(nodes);
    const shipsFromMatch = sourceHtml.match(/\bShips\s+from:\s*(?:<\/?[^>]+>\s*){0,3}<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
    const shipsFromText = shipsFromMatch ? favDeepPlainText(shipsFromMatch[1]) : '';

    const etsysPickPositive =
        /aria-describedby\s*=\s*["']etsys_pick["']/i.test(sourceHtml)
        || /<clg-signal\b[\s\S]{0,600}Etsy(?:’|')s Pick/i.test(sourceHtml)
        || /<clg-icon\b[^>]*name\s*=\s*["']oneofakind["'][^>]*>[\s\S]{0,400}Etsy(?:’|')s Pick/i.test(sourceHtml);
    const starSellerPositive =
        /clg-profile-avatar__badge-star-seller/i.test(sourceHtml)
        || /<strong>\s*Star Seller\.\s*<\/strong>/i.test(sourceHtml);
    const personalizablePositive =
        /data-selector\s*=\s*["']listing-page-personalization["']/i.test(sourceHtml)
        || /data-selector\s*=\s*["']enhanced-perso-content-toggle["']/i.test(sourceHtml);
    /* Digital is deliberately not inferred from arbitrary listing-page text:
     * recommendation cards on a listing page can also contain Digital download.
     * Favorites JSON/card parsing remains the trusted source until a scoped
     * listing-page signal is confirmed.
     */
    const vintageMatch = sourceHtml.match(/Vintage from the\s+([^<\r\n]+)/i);
    const vintagePositive =
        /<clg-icon\b[^>]*name\s*=\s*["']vintage["']/i.test(sourceHtml)
        && /\bVintage from the\b/i.test(plain);
    const giftWrapPositive = /\bGift wrapping available\b/i.test(plain);

    /* These UI fallbacks are positive-only. Their absence never proves false. */
    const etsysPick = etsysPickPositive ? favDeepField(true, true, observedAt) : favDeepUnknown();
    const starSeller = starSellerPositive ? favDeepField(true, true, observedAt) : favDeepUnknown();
    const personalizable = personalizablePositive ? favDeepField(true, true, observedAt) : favDeepUnknown();
    const digital = favDeepUnknown();
    const vintage = vintagePositive ? favDeepField(true, true, observedAt) : favDeepUnknown();
    const giftWrap = giftWrapPositive ? favDeepField(true, true, observedAt) : favDeepUnknown();

    const productCategory = product?.category;
    const categoryValue = Array.isArray(productCategory)
        ? productCategory.map((value) => String(value)).filter(Boolean)
        : (productCategory ? [String(productCategory)] : breadcrumbs);
    const category = categoryValue.length
        ? favDeepField(Array.from(new Set(categoryValue)), true, observedAt)
        : favDeepUnknown();

    const price = favDeepNumber(offer?.price ?? offer?.lowPrice);
    const rating = favDeepNumber(product?.aggregateRating?.ratingValue);
    const reviews = favDeepNumber(product?.aggregateRating?.reviewCount ?? product?.aggregateRating?.ratingCount);
    const availabilityState = favDeepNormalizeAvailability(offer?.availability);

    const returns = favDeepSemanticBoolean(
        plain,
        [/\bReturns accepted\b/i, /\bAccepts returns\b/i],
        [/\bReturns not accepted\b/i, /\bDoes not accept returns\b/i]
    );
    const exchanges = favDeepSemanticBoolean(
        plain,
        [/\bExchanges accepted\b/i, /\bAccepts exchanges\b/i],
        [/\bExchanges not accepted\b/i, /\bDoes not accept exchanges\b/i]
    );

    const shipping = favDeepShippingFromOffer(offer, observedAt);
    shipping.shipsFromCountry = shipsFromText
        ? favDeepShippingOriginField(shipsFromText, observedAt)
        : favDeepShippingOriginUnknown(observedAt);
    if (returns !== null) shipping.returnsAccepted = favDeepField(returns, true, observedAt);
    else shipping.returnsAccepted = favDeepUnknown();
    if (exchanges !== null) shipping.exchangesAccepted = favDeepField(exchanges, true, observedAt);
    else shipping.exchangesAccepted = favDeepUnknown();

    const identity = {
        listingId: favDeepListingId(sourceHtml, baseUrl),
        url: String(product?.url || baseUrl || ''),
        title: favDeepDecodeText(product?.name || '').trim(),
        shopName: favDeepDecodeText(product?.seller?.name || product?.brand?.name || '').trim(),
    };

    return {
        source: FAV_DEEP_SOURCE,
        parserVersion: FAV_DEEP_PARSER_VERSION,
        observedAt,
        identity,
        completeSignals: {
            productJsonLd: Boolean(product),
            offerJsonLd: Boolean(offer),
            listingIdentity: Boolean(identity.listingId || identity.title),
        },
        availabilityState,
        cardMetadata: {
            price: Number.isFinite(price) ? favDeepField(price, true, observedAt) : favDeepUnknown(),
            rating: Number.isFinite(rating) ? favDeepField(rating, true, observedAt) : favDeepUnknown(),
            reviewCount: Number.isFinite(reviews) ? favDeepField(reviews, true, observedAt) : favDeepUnknown(),
            digital,
            personalizable,
            freeShipping: shipping.freeShipping,
        },
        listingMetadata: {
            category,
            etsysPick,
            vintage,
            vintageEra: vintagePositive && vintageMatch?.[1]
                ? favDeepField(vintageMatch[1].trim(), true, observedAt)
                : favDeepUnknown(),
            giftWrap,
            digital,
            personalizable,
        },
        shippingMetadata: shipping,
        shopMetadata: {
            starSeller,
        },
    };
}

async function favDeepFetchListing(recordOrUrl, options = {}) {
    const url = typeof recordOrUrl === 'string'
        ? recordOrUrl
        : String(recordOrUrl?.url || recordOrUrl?.listingUrl || '');
    if (!url) throw new Error('Deep metadata fetch requires a listing URL.');

    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: options.signal,
        headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!response.ok) throw new Error(`Listing metadata request failed (${response.status}).`);
    const html = await response.text();
    return favDeepParseListingHtml(html, response.url || url, { observedAt: options.observedAt || Date.now() });
}

async function favIndexApplyDeepListingObservationNow(listingId, parsed, options = {}) {
    const idValue = String(listingId || parsed?.identity?.listingId || '');
    if (!idValue) throw new Error('Deep metadata observation is missing listing ID.');

    const observedAt = Math.max(0, Number(options.observedAt) || Number(parsed?.observedAt) || Date.now());
    const existing = await favIndexGet('listings', idValue);
    if (!existing) throw new Error(`Favorite ${idValue} is not present in the Favorites index.`);

    const next = {
        ...existing,
        url: parsed?.identity?.url || existing.url || '',
        title: parsed?.identity?.title || existing.title || '',
        lastDeepScanAt: Math.max(Number(existing.lastDeepScanAt) || 0, observedAt),
        deepParserVersion: String(parsed?.parserVersion || FAV_DEEP_PARSER_VERSION),
        shippingOriginParserVersion: FAV_DEEP_SHIPPING_ORIGIN_VERSION,
        listingMetadata: favIndexMergeMetadata(existing.listingMetadata, parsed?.listingMetadata || {}),
        shippingMetadata: favIndexMergeMetadata(existing.shippingMetadata, parsed?.shippingMetadata || {}),
        cardMetadata: favIndexMergeMetadata(existing.cardMetadata, parsed?.cardMetadata || {}),
    };

    if (parsed?.availabilityState && parsed.availabilityState !== 'unknown') {
        Object.assign(next, favIndexMarkListingAvailability(next, parsed.availabilityState, observedAt));
    }

    let nextShop = null;
    if (existing.shopId) {
        const oldShop = await favIndexGet('shops', String(existing.shopId));
        const starSeller = parsed?.shopMetadata?.starSeller;
        nextShop = favIndexMergeShop(oldShop, {
            shopId: String(existing.shopId),
            shopName: parsed?.identity?.shopName || oldShop?.shopName || '',
            shopUrl: oldShop?.shopUrl || '',
            starSeller: starSeller || favIndexUnknown(),
            observedAt,
        });
        nextShop.lastScannedAt = Math.max(Number(oldShop?.lastScannedAt) || 0, observedAt);
    }

    await favIndexWrite(nextShop ? ['listings', 'shops'] : ['listings'], (transaction) => {
        transaction.objectStore('listings').put(next);
        if (nextShop) transaction.objectStore('shops').put(nextShop);
    });
    return next;
}

function favIndexApplyDeepListingObservation(listingId, parsed, options = {}) {
    return favIndexEnqueue(() => favIndexApplyDeepListingObservationNow(listingId, parsed, options));
}
