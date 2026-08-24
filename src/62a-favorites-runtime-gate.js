'use strict';

/* Delay only the automatic enhanced Favorites render during initial module load.
 * The base runtime can still capture Etsy's native DOM, install its observer, and
 * build the toolbar; the final ready module releases this gate after every
 * hardening override has loaded. */
var favEnhancementActiveUngated = favEnhancementActive;
var favRuntimeEnhancementReady = false;
favEnhancementActive = function favEnhancementActiveGated() {
    return favRuntimeEnhancementReady && favEnhancementActiveUngated();
};
