'use strict';

/* Etsy order is normally treated as the unmodified/native state. Once the
 * user explicitly reverses it, BetterSearch must keep the local renderer
 * active so the reversed order is actually visible. */
var favBaseEnhancementActiveForEtsyReverse = favEnhancementActive;
favEnhancementActive = function favEnhancementActiveWithEtsyReverse() {
    return favBaseEnhancementActiveForEtsyReverse()
        || (favCfg.sort === 'etsy' && favCfg.sortReversed === true);
};
