'use strict';

/* v0.15.26 focused Favorites rail refresh guard.
 *
 * The permanent desktop rail deliberately preserves its root identity, but a
 * refresh still replaces every child beneath that root. Several legitimate
 * asynchronous paths (background sync, metadata completion, route/cache
 * rehydration) can request that rebuild while the user is midway through
 * editing a text-like filter. Those controls commit on change/blur, so replacing
 * the focused element first can discard an uncommitted draft and rebuild from
 * the older favCfg value.
 *
 * Keep asynchronous rail maintenance non-destructive while a draft-capable
 * editor owns focus. Coalesce any number of requested refreshes and flush one
 * refresh after focus leaves the editor. If focus moves directly into another
 * draft editor, the normal wrapper re-defers against that new owner. Checkbox,
 * radio, select and button interactions remain immediate because their values
 * commit synchronously through their existing change/click handlers.
 */

favState.railRefreshDeferred01526 = favState.railRefreshDeferred01526 === true;
favState.railRefreshDeferredTarget01526 = null;
favState.railRefreshDeferredArgs01526 = null;

function favFocusedRailDraftControl01526() {
    const rail = favState.rail;
    const active = document.activeElement;
    if (!rail?.isConnected || !active?.isConnected || !rail.contains?.(active)) return null;
    if (active.disabled === true || active.readOnly === true) return null;
    if (!active.matches?.('textarea,input:not([type]),input[type="text"],input[type="search"],input[type="number"],input[type="range"]')) return null;
    return active;
}

function favDeferRailRefreshUntilBlur01526(editor, args) {
    favState.railRefreshDeferred01526 = true;
    favState.railRefreshDeferredArgs01526 = Array.from(args || []);
    if (favState.railRefreshDeferredTarget01526 === editor) return;

    favState.railRefreshDeferredTarget01526 = editor;
    editor.addEventListener('focusout', () => {
        /* change handlers for text/number controls run as focus is yielded.
         * Flush on the next task so the canonical config is committed first. */
        setTimeout(() => {
            if (favState.railRefreshDeferredTarget01526 !== editor) return;
            const pending = favState.railRefreshDeferred01526;
            const pendingArgs = favState.railRefreshDeferredArgs01526 || [];
            favState.railRefreshDeferredTarget01526 = null;
            favState.railRefreshDeferred01526 = false;
            favState.railRefreshDeferredArgs01526 = null;
            if (pending) favRefreshRail(...pendingArgs);
        }, 0);
    }, { once:true });
}

var favRefreshRailBefore01526 = favRefreshRail;
favRefreshRail = function favRefreshRail01526(...args) {
    const editor = favFocusedRailDraftControl01526();
    if (editor) {
        favDeferRailRefreshUntilBlur01526(editor, args);
        return favState.rail;
    }

    /* An immediate refresh supersedes any older deferred request. Its one-shot
     * focusout callback will see the target mismatch and become a no-op. */
    favState.railRefreshDeferred01526 = false;
    favState.railRefreshDeferredTarget01526 = null;
    favState.railRefreshDeferredArgs01526 = null;
    return favRefreshRailBefore01526(...args);
};
