'use strict';

/* Favorites local-card cart/action final owner.
 *
 * Keep Etsy-owned native cards untouched. BetterSearch-owned cards reserve a
 * stable checkout slot so hover/focus only changes visibility, never row
 * geometry. Cart actions prefer the connected native Etsy card; off-page
 * cache/fallback cards submit Etsy's own /cart/listing.php form contract
 * without navigating away from Favorites.
 */

if (typeof favState !== 'undefined') {
    if (!(favState.cartListingIds01530 instanceof Set)) favState.cartListingIds01530 = new Set();
    if (!(favState.cartPending01530 instanceof Set)) favState.cartPending01530 = new Set();
}

function favOwnedCardId01530(card) {
    return String(card?.dataset?.ebsfId || card?.dataset?.ebsListingId || '').trim();
}

function favOwnedCardUrl01530(card) {
    return String(card?.dataset?.ebsfUrl || card?.dataset?.ebsListingUrl || '').trim();
}

function favCartActionControl01530(card) {
    if (!card?.querySelectorAll) return null;
    return Array.from(card.querySelectorAll('button,a')).find((control) =>
        /^(?:add to cart|multiple options|select options|in cart|go to cart\b)/i.test(String(control.textContent || '').trim())
    ) || null;
}

function favCartActionSlot01530(card, record = null, create = true) {
    if (!card?.querySelector) return null;
    let slot = card.querySelector('[data-ebsf-owned-cart-slot="1"]');
    if (!slot) {
        const testSlot = card.querySelector('[data-testid="add-to-cart-button"]');
        const control = favCartActionControl01530(card);
        slot = testSlot?.closest?.('.ebsf-card-actions')
            || testSlot?.parentElement
            || control?.closest?.('.ebsf-card-actions')
            || control?.closest?.('.favorites-landing-card-checkout-buttons')?.parentElement
            || control?.parentElement
            || null;
    }
    if (!slot && create) {
        const stack = card.querySelector('.wt-card__inner') || card.querySelector('[data-clg-id="WtCard"]') || card;
        slot = document.createElement('div');
        slot.className = 'wt-p-xs-1 ebsf-card-actions';
        const label = record?.hasVariations ? 'Select options' : 'Add to cart';
        slot.innerHTML = `<div data-testid="add-to-cart-button" class="favorites-landing-card-checkout-buttons implicit-comparison-card-checkout-button-container"><button type="button" data-clg-id="WtButton" class="wt-btn wt-btn--secondary wt-width-full wt-p-xs-1 wt-btn--small">${label}</button></div>`;
        stack.append(slot);
    }
    if (!slot) return null;
    slot.dataset.ebsfOwnedCartSlot = '1';
    const stack = slot.parentElement;
    if (stack) stack.dataset.ebsfOwnedCardStack = '1';
    return slot;
}

function favRenderOwnedInCart01530(card) {
    const slot = favCartActionSlot01530(card, null, true);
    if (!slot) return;
    slot.dataset.ebsfCartState = 'in-cart';
    slot.innerHTML = '<div class="ebsf-owned-in-cart"><span class="ebsf-owned-in-cart-label">In cart</span><span class="ebsf-owned-in-cart-separator" aria-hidden="true">|</span><a class="wt-text-link ebsf-owned-go-to-cart" data-ebsf-go-to-cart="1" href="/cart">Go to cart <span aria-hidden="true">→</span></a></div>';
}

function favSetOwnedCartState01530(listingId, inCart = true) {
    const id = String(listingId || '').trim();
    if (!id || typeof favState === 'undefined') return;
    if (inCart) favState.cartListingIds01530.add(id);
    else favState.cartListingIds01530.delete(id);
    document.querySelectorAll?.(`[data-ebsf-owned-card="1"][data-ebsf-id="${CSS.escape(id)}"], [data-ebsf-owned-card="1"][data-ebs-listing-id="${CSS.escape(id)}"]`).forEach((card) => {
        if (inCart) favRenderOwnedInCart01530(card);
    });
}

function favNormalizeOwnedCard01530(card, record = null) {
    if (!card?.matches?.('[data-ebsf-owned-card="1"]')) return card;
    if (record?.hasVariations) card.dataset.ebsfHasVariations = '1';
    else if (record && !record.hasVariations) card.dataset.ebsfHasVariations = '0';
    const slot = favCartActionSlot01530(card, record, true);
    const id = favOwnedCardId01530(card);
    const slotText = String(slot?.textContent || '').replace(/\s+/g, ' ').trim();
    if (id && (/\bin cart\b/i.test(slotText) || /\bgo to cart\b/i.test(slotText))) {
        favState.cartListingIds01530.add(id);
    }
    if (id && favState.cartListingIds01530.has(id)) favRenderOwnedInCart01530(card);
    return card;
}

const favPrepareOwnedCardBefore01530 = typeof favPrepareOwnedCard0141 === 'function' ? favPrepareOwnedCard0141 : null;
if (favPrepareOwnedCardBefore01530) {
    favPrepareOwnedCard0141 = function favPrepareOwnedCard01530(node, record) {
        return favNormalizeOwnedCard01530(favPrepareOwnedCardBefore01530(node, record), record);
    };
}

document.querySelectorAll?.('[data-ebsf-owned-card="1"]').forEach((card) => favNormalizeOwnedCard01530(card));

function favLiveNativeCard01530(card) {
    const id = favOwnedCardId01530(card);
    if (!id) return null;
    const grid = typeof favNativeMainGrid0141 === 'function' ? favNativeMainGrid0141(document) : null;
    if (!grid) return null;
    return Array.from(grid.children || []).find((node) => String(typeof favListingIdFromNode === 'function' ? favListingIdFromNode(node) : '') === id) || null;
}

function favMatchingNativeCartControl01530(card, wantedText = '') {
    const nativeCard = favLiveNativeCard01530(card);
    if (!nativeCard) return null;
    const controls = Array.from(nativeCard.querySelectorAll?.('button,a') || []);
    const wanted = String(wantedText || '').replace(/\s+/g, ' ').trim();
    return controls.find((control) => String(control.textContent || '').replace(/\s+/g, ' ').trim() === wanted)
        || controls.find((control) => /^(?:add to cart|multiple options|select options|go to cart\b)/i.test(String(control.textContent || '').trim()))
        || null;
}

function favSyncOwnedCartFromNative01530(card) {
    const id = favOwnedCardId01530(card);
    const nativeCard = favLiveNativeCard01530(card);
    if (!id || !nativeCard) return false;
    const actionText = Array.from(nativeCard.querySelectorAll?.('button,a') || [])
        .map((control) => String(control.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' | ');
    if (/\bin cart\b/i.test(actionText) || /\bgo to cart\b/i.test(actionText)) {
        favSetOwnedCartState01530(id, true);
        return true;
    }
    return false;
}

function favScheduleNativeCartSync01530(card) {
    for (const delay of [120, 300, 650, 1100, 1800]) {
        setTimeout(() => {
            if (!card?.isConnected) return;
            favSyncOwnedCartFromNative01530(card);
        }, delay);
    }
}

function favCartFormRequest01530(card, clickedControl = null) {
    const id = favOwnedCardId01530(card);
    const listingUrl = favOwnedCardUrl01530(card);
    if (!id) return null;
    const form = clickedControl?.closest?.('form') || card.querySelector?.('form[action*="/cart/listing.php"]') || null;
    const params = new URLSearchParams();
    if (form) {
        try {
            for (const [name, value] of new FormData(form).entries()) {
                if (typeof value === 'string') params.append(name, value);
            }
        } catch (_) {}
    }
    if (!params.has('listing_id')) params.set('listing_id', id);
    if (listingUrl && !params.has('listing_url')) params.set('listing_url', listingUrl);
    if (!params.has('quantity')) params.set('quantity', '1');
    if (!params.has('ref')) params.set('ref', 'favorites');
    const buttonName = clickedControl?.getAttribute?.('name');
    if (buttonName && !params.has(buttonName)) params.set(buttonName, clickedControl.getAttribute('value') || '1');
    const rawAction = form?.getAttribute?.('action') || '/cart/listing.php';
    const action = new URL(rawAction, location.href);
    if (action.origin !== location.origin || !/\/cart\/listing\.php$/i.test(action.pathname)) return null;
    return { id, action: action.href, params };
}

function favSetCartControlBusy01530(control, busy) {
    if (!control) return;
    if (busy) {
        control.dataset.ebsfCartOriginalText = String(control.textContent || '').trim();
        control.setAttribute('aria-busy', 'true');
        control.disabled = true;
    } else {
        control.removeAttribute('aria-busy');
        control.disabled = false;
    }
}

async function favSubmitOwnedCart01530(card, control) {
    const request = favCartFormRequest01530(card, control);
    if (!request || favState.cartPending01530.has(request.id)) return false;
    if (card.dataset.ebsfHasVariations === '1') return false;
    favState.cartPending01530.add(request.id);
    favSetCartControlBusy01530(control, true);
    try {
        const response = await fetch(request.action, {
            method: 'POST',
            credentials: 'include',
            redirect: 'follow',
            body: request.params,
            headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
        });
        if (!response.ok) throw new Error(`Etsy cart request failed with HTTP ${response.status}`);
        favSetOwnedCartState01530(request.id, true);
        return true;
    } catch (error) {
        console.warn('Etsy BetterSearch could not add this Favorite to cart without navigation.', error);
        if (control?.isConnected) {
            const original = control.dataset.ebsfCartOriginalText || 'Add to cart';
            control.textContent = 'Try again';
            setTimeout(() => {
                if (control.isConnected && control.textContent === 'Try again') control.textContent = original;
            }, 1400);
        }
        return false;
    } finally {
        favState.cartPending01530.delete(request.id);
        if (control?.isConnected) favSetCartControlBusy01530(control, false);
    }
}

const favTransplantedClickBefore01530 = typeof favHandleTransplantedClick === 'function' ? favHandleTransplantedClick : null;
if (favTransplantedClickBefore01530) document.removeEventListener('click', favTransplantedClickBefore01530, true);

function favHandleOwnedCardClick01530(event) {
    if (typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true) return;
    const card = event.target?.closest?.('[data-ebsf-owned-card="1"]');
    if (!card) return;

    const favorite = typeof favoriteButtonFromEvent === 'function' ? favoriteButtonFromEvent(event.target) : null;
    if (favorite) {
        if (favTransplantedClickBefore01530) favTransplantedClickBefore01530(event);
        return;
    }

    const goToCart = event.target?.closest?.('[data-ebsf-go-to-cart="1"]')
        || (event.target?.closest?.('a') && /\bgo to cart\b/i.test(String(event.target.closest('a').textContent || '')) ? event.target.closest('a') : null);
    if (goToCart) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const href = goToCart.getAttribute?.('href') || '/cart';
        location.assign(new URL(href, location.origin).href);
        return;
    }

    const control = event.target?.closest?.('button');
    if (!control) return;
    const label = String(control.textContent || '').replace(/\s+/g, ' ').trim();
    if (!/^(?:add to cart|multiple options|select options)$/i.test(label)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const nativeControl = favMatchingNativeCartControl01530(card, label);
    if (nativeControl) {
        nativeControl.click();
        if (/^add to cart$/i.test(label)) favScheduleNativeCartSync01530(card);
        return;
    }

    if (/^(?:multiple options|select options)$/i.test(label) || card.dataset.ebsfHasVariations === '1') {
        const url = favOwnedCardUrl01530(card);
        if (url) window.open(url, '_blank', 'noopener');
        return;
    }

    void favSubmitOwnedCart01530(card, control);
}

document.addEventListener('click', favHandleOwnedCardClick01530, true);

GM_addStyle(`
[data-ebsf-local-grid] > [data-ebsf-owned-card="1"]{align-self:stretch!important;height:100%!important}
[data-ebsf-owned-card="1"]>[data-clg-id="WtCard"],[data-ebsf-owned-card="1"]>.wt-card{width:100%!important;height:100%!important}
[data-ebsf-owned-card-stack="1"]{display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:100%!important}
[data-ebsf-owned-cart-slot="1"]{position:relative!important;z-index:4!important;display:flex!important;flex:0 0 52px!important;align-items:flex-end!important;width:100%!important;height:52px!important;min-height:52px!important;max-height:52px!important;margin-top:auto!important;box-sizing:border-box!important;overflow:visible!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:opacity .12s ease!important}
[data-ebsf-owned-card="1"]:hover [data-ebsf-owned-cart-slot="1"],[data-ebsf-owned-card="1"]:focus-within [data-ebsf-owned-cart-slot="1"]{opacity:1!important;visibility:visible!important;pointer-events:auto!important}
[data-ebsf-owned-cart-slot="1"]>[data-testid="add-to-cart-button"],[data-ebsf-owned-cart-slot="1"]>.favorites-landing-card-checkout-buttons{width:100%!important}
[data-ebsf-owned-cart-slot="1"] .ebsf-owned-in-cart{display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;min-height:40px;font-size:13px}
[data-ebsf-owned-cart-slot="1"] .ebsf-owned-in-cart-label{font-weight:600;color:#222}
[data-ebsf-owned-cart-slot="1"] .ebsf-owned-in-cart-separator{color:#777}
[data-ebsf-owned-cart-slot="1"] .ebsf-owned-go-to-cart{position:relative;z-index:5;font-weight:600;white-space:nowrap}
`);
