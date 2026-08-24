'use strict';

/* Keep Etsy's own pagination out of the way only while BetterSearch owns the
 * Favorites grid. The selector is structural instead of language-specific. */
GM_addStyle(`
body.ebsf-results-active .phase3-listing-cards-section + nav[data-clg-id="WtPagination"] {
    display:none!important;
}
`);

/* The first Favorites implementation intentionally restores native nodes rather
 * than cloning them. Always clear the ownership marker at the same time. */
var favRestoreNativeBaseV071 = favRestoreNative;
favRestoreNative = function favRestoreNativeHardened() {
    const result = favRestoreNativeBaseV071();
    document.body?.classList.remove('ebsf-results-active');
    return result;
};

/* Etsy can replace its native Favorites search form during an AJAX update. Bind
 * each replacement form as it appears so a later search invalidates our local
 * dataset just like the first form does. */
function favBindNativeSearchV071() {
    const form = favSearchInput()?.closest('form');
    if (!form || form.dataset.ebsfBound) return;
    form.dataset.ebsfBound = '1';
    form.addEventListener('submit', () => {
        favRestoreNative();
        setTimeout(() => favScheduleSync(0), 450);
        setTimeout(() => favScheduleSync(0), 1100);
    });
}

var favEnsureToolbarBaseV071 = favEnsureToolbar;
favEnsureToolbar = function favEnsureToolbarHardened() {
    const result = favEnsureToolbarBaseV071();
    favBindNativeSearchV071();
    return result;
};

/* If Etsy changes Favorites scope/query while our rail is open, restore the old
 * sidebar first and reopen the rail against Etsy's new sidebar after the reset. */
var favResetForNativeChangeBaseV071 = favResetForNativeChange;
favResetForNativeChange = function favResetForNativeChangeHardened() {
    const reopen = favState.filterOpen;
    if (reopen) favCloseFilters();
    const result = favResetForNativeChangeBaseV071();
    favBindNativeSearchV071();
    if (reopen) requestAnimationFrame(() => {
        if (isFavoritesPage() && !favState.filterOpen) favOpenFilters();
    });
    return result;
};

favBindNativeSearchV071();
