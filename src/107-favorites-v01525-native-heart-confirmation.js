'use strict';

/* v0.15.25 native Favorites heart confirmation boundary.
 *
 * Module 63 historically inferred an unfavorite 900 ms after a native heart
 * click. A Preact replacement of the original card/button could therefore look
 * like success even when the replacement was still favorited, while a slower
 * successful removal could miss the one-shot window entirely.
 *
 * Keep Etsy as the mutation owner, but make BetterSearch's durable reaction
 * evidence-driven. Observe the native removal intent before Etsy handles it,
 * consume the historical 900 ms persistence hook, then re-acquire the current
 * native card by listing ID under the exact same Favorites dataset/view. An
 * explicit unfavorited control and card disappearance both require bounded
 * stability before they become durable evidence. Route/view changes,
 * superseding heart clicks and unresolved timeouts fail closed.
 */
var FAV_NATIVE_HEART_CONFIRM_TIMEOUT01525 = 6000;
var FAV_NATIVE_HEART_STATE_STABLE01525 = 1200;
var FAV_NATIVE_HEART_ABSENCE_STABLE01525 = 1500;
var FAV_NATIVE_HEART_POLL01525 = 120;
var FAV_NATIVE_HEART_ACTION_TTL01525 = 10000;

favState.nativeHeartActions01525 = favState.nativeHeartActions01525 instanceof Map
    ? favState.nativeHeartActions01525
    : new Map();
favState.nativeHeartSequence01525 = Math.max(0, Number(favState.nativeHeartSequence01525) || 0);

function favNativeHeartAction01525(idValue) {
    const id = String(idValue || '');
    if (!id) return null;
    const action = favState.nativeHeartActions01525.get(id) || null;
    if (!action) return null;
    if (Date.now() - Number(action.startedAt || 0) <= FAV_NATIVE_HEART_ACTION_TTL01525) return action;
    favState.nativeHeartActions01525.delete(id);
    return null;
}

function favNativeHeartContextCurrent01525(action) {
    if (!action || !isFavoritesPage()) return false;
    return String(favDatasetKey()) === String(action.datasetKey || '')
        && String(favScopeKey()) === String(action.scopeKey || '')
        && String(favViewKey0137()) === String(action.viewKey || '');
}

function favNativeFavoriteButton01525(card) {
    if (!card?.isConnected) return null;
    return Array.from(card.querySelectorAll?.('button,[role="button"]') || [])
        .find((button) => favoriteButtonFromEvent(button) === button) || null;
}

function favNativeHeartDelay01525(delay = FAV_NATIVE_HEART_POLL01525) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delay) || 0)));
}

function favClearNativeHeartAction01525(action) {
    if (!action) return;
    clearTimeout(action.cleanupTimer);
    if (favState.nativeHeartActions01525.get(action.id) === action) {
        favState.nativeHeartActions01525.delete(action.id);
    }
}

function favCaptureNativeHeartIntent01525(event) {
    if (!isFavoritesPage()) return;
    const card = event.target?.closest?.('.favorites-landing-listing-card-container:not([data-ebsf-owned-card="1"])');
    if (!card) return;
    const button = favoriteButtonFromEvent(event.target);
    if (!button) return;
    const id = String(card.dataset?.ebsfId || favListingIdFromNode(card) || '');
    if (!id) return;

    const previous = favState.nativeHeartActions01525.get(id);
    if (previous) clearTimeout(previous.cleanupTimer);
    const action = {
        id,
        sequence:++favState.nativeHeartSequence01525,
        intent:isFavoritedButton(button) ? 'remove' : 'other',
        datasetKey:String(favDatasetKey()),
        scopeKey:String(favScopeKey()),
        viewKey:String(favViewKey0137()),
        startedAt:Date.now(),
        confirmationPromise:null,
        committing:false,
        cleanupTimer:0,
    };
    action.cleanupTimer = setTimeout(() => favClearNativeHeartAction01525(action), FAV_NATIVE_HEART_ACTION_TTL01525);
    favState.nativeHeartActions01525.set(id, action);

    /* Start from the capture itself rather than depending on module 63's later
     * bubble listener. Etsy may optimistically flip aria-pressed/remove the card
     * before that historical listener runs. Promise timing lets the current
     * click stack finish first so Etsy remains the mutation owner. */
    if (action.intent === 'remove') {
        void Promise.resolve().then(() => {
            if (favNativeHeartAction01525(id) === action) return favStartNativeHeartConfirmation01525(action);
            return false;
        });
    }
}

document.addEventListener('click', favCaptureNativeHeartIntent01525, true);

async function favConfirmNativeHeartRemoval01525(action) {
    const startedAt = Date.now();
    let explicitSince = 0;
    let explicitSamples = 0;
    let absenceSince = 0;
    let absenceSamples = 0;

    while (Date.now() - startedAt < FAV_NATIVE_HEART_CONFIRM_TIMEOUT01525) {
        if (favNativeHeartAction01525(action?.id) !== action || action?.intent !== 'remove') {
            return { confirmed:false, reason:'superseded' };
        }
        if (!favNativeHeartContextCurrent01525(action)) {
            return { confirmed:false, reason:'stale-context' };
        }

        const nativeGrid = favNativeMainGrid0141?.();
        if (!nativeGrid?.isConnected) {
            explicitSince = 0;
            explicitSamples = 0;
            absenceSince = 0;
            absenceSamples = 0;
        } else {
            const currentCard = favNativeCardMap0141?.(document)?.get?.(action.id) || null;
            if (currentCard?.isConnected) {
                absenceSince = 0;
                absenceSamples = 0;
                const currentButton = favNativeFavoriteButton01525(currentCard);
                if (currentButton && !isFavoritedButton(currentButton)) {
                    const now = Date.now();
                    if (!explicitSince) explicitSince = now;
                    explicitSamples += 1;
                    if (explicitSamples >= 3 && now - explicitSince >= FAV_NATIVE_HEART_STATE_STABLE01525) {
                        return { confirmed:true, reason:'stable-explicit-state' };
                    }
                } else {
                    explicitSince = 0;
                    explicitSamples = 0;
                }
            } else {
                explicitSince = 0;
                explicitSamples = 0;
                const now = Date.now();
                if (!absenceSince) absenceSince = now;
                absenceSamples += 1;
                if (absenceSamples >= 3 && now - absenceSince >= FAV_NATIVE_HEART_ABSENCE_STABLE01525) {
                    return { confirmed:true, reason:'stable-absence' };
                }
            }
        }
        await favNativeHeartDelay01525();
    }
    return { confirmed:false, reason:'timeout' };
}

async function favCommitConfirmedNativeHeartRemoval01525(action) {
    if (favNativeHeartAction01525(action?.id) !== action || !favNativeHeartContextCurrent01525(action)) return false;

    /* Keep a confirmed tombstone until the action TTL expires. Module 63's old
     * 900 ms callback may still fire after this confirmation; retaining the
     * action lets the wrappers consume that stale callback instead of writing a
     * second time. A later real heart click replaces this action immediately. */
    action.committing = true;
    try {
        if (!favIsOwnFavoritesPage()) {
            action.intent = 'confirmed-remove';
            favRefreshOwnedCardsFromNative0143?.();
            return true;
        }

        const removed = favRemoveLocalFavoriteBefore01525(action.id);
        if (!removed) await favIndexMarkUnfavoriteBefore01525(action.id);
        if (removed && favState.renderMode0141 === 'bettersearch-local') {
            void Promise.resolve(favReapply()).catch((error) => {
                console.debug?.('[EBSF] Confirmed Favorite removal reapply deferred.', error);
            });
        }
        action.intent = 'confirmed-remove';
        return true;
    } finally {
        action.committing = false;
    }
}

async function favRunNativeHeartConfirmation01525(action) {
    const result = await favConfirmNativeHeartRemoval01525(action);
    if (result.confirmed) return favCommitConfirmedNativeHeartRemoval01525(action);

    if (favState.nativeHeartActions01525.get(action?.id) === action) favClearNativeHeartAction01525(action);
    if (result.reason === 'timeout' && favNativeHeartContextCurrent01525(action)) {
        /* Unresolved means no durable write. Ask the established render/hydration
         * owners to reconcile whatever Etsy currently exposes. */
        favRefreshOwnedCardsFromNative0143?.();
        favScheduleRenderIntegrity0142?.(0, favDatasetKey());
    }
    return false;
}

function favStartNativeHeartConfirmation01525(action) {
    if (!action || action.intent !== 'remove') return Promise.resolve(false);
    if (!action.confirmationPromise) {
        action.confirmationPromise = Promise.resolve()
            .then(() => favRunNativeHeartConfirmation01525(action))
            .catch((error) => {
                favClearNativeHeartAction01525(action);
                console.debug?.('[EBSF] Native Favorite action confirmation deferred.', error);
                return false;
            });
    }
    return action.confirmationPromise;
}

/* v0.15.26 local-card safety boundary. A BetterSearch-owned Favorites clone may
 * represent an off-page listing with no connected native Etsy card to delegate
 * to. Never use the generic hidden-iframe Favorite bridge for that case: open
 * the listing visibly so Etsy's own page remains the mutation/identity owner.
 * Generic non-Favorites bridge consumers keep their historical behavior. */
var bridgeFavoriteBefore01526 = bridgeFavorite;
bridgeFavorite = async function bridgeFavorite01526(card, button) {
    if (card?.dataset?.ebsfOwnedCard !== '1') return bridgeFavoriteBefore01526(card, button);
    const url = String(card?.dataset?.ebsfUrl || card?.dataset?.ebsListingUrl || '').trim();
    if (button?.setAttribute) button.setAttribute('title', 'Open this listing to change its Favorite with Etsy.');
    if (url) window.open(url, '_blank', 'noopener');
    return false;
};

/* Consume module 63's old fixed-delay live/local removal path while a captured
 * native heart action is recent. Confirmed tombstones are intentionally consumed
 * too so a late historical callback cannot duplicate the durable write. A
 * consumed callback must report false: historical callers interpret true as
 * "the local row was already removed" and would otherwise direct-render stale
 * state before the confirmation owner commits and re-enters favReapply(). */
var favRemoveLocalFavoriteBefore01525 = favRemoveLocalFavorite;
favRemoveLocalFavorite = function favRemoveLocalFavorite01525(idValue) {
    const action = favNativeHeartAction01525(idValue);
    if (!action) return favRemoveLocalFavoriteBefore01525(idValue);
    if (action.intent === 'remove') void favStartNativeHeartConfirmation01525(action);
    return false;
};

/* Native mode bypasses favRemoveLocalFavorite in module 63 and calls the index
 * helper directly after 900 ms. Fence that historical path by listing ID. The
 * confirmed commit uses the pre-wrapper atomic writer directly, while unrelated
 * calls retain the established v0.15.19 owner-specific writer unchanged. */
var favIndexMarkUnfavoriteBefore01525 = favIndexMarkUnfavorite;
favIndexMarkUnfavorite = function favIndexMarkUnfavorite01525(idValue, ...args) {
    const action = favNativeHeartAction01525(idValue);
    if (!action) return favIndexMarkUnfavoriteBefore01525(idValue, ...args);
    if (action.committing === true) return favIndexMarkUnfavoriteBefore01525(idValue, ...args);
    if (action.intent === 'remove') void favStartNativeHeartConfirmation01525(action);
    return Promise.resolve(false);
};
