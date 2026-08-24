'use strict';

/* All Favorites modules/overrides are now loaded. Release the initial gate and
 * perform the persisted-state reapply with the final hardened implementation. */
favRuntimeEnhancementReady = true;
if (isFavoritesPage()) {
    favEnsureToolbar();
    if (favEnhancementActive()) favReapply();
}
