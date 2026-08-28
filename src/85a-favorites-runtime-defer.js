'use strict';

/* v0.12.8 startup ordering guard.
 *
 * Module 86 historically starts the Favorites runtime before the later shell
 * and responsive overrides have finished loading. v0.12.6 deferred that start
 * until module 94, but module 95 was added later, so the runtime was once again
 * released one module too early. Keep every release request pending until the
 * actual final module explicitly marks the override chain ready.
 */

var favStartRuntimeBefore0128 = favStartRuntime;
var favRuntimePending0128 = false;
var favFinalRuntimeReady0130 = false;

favStartRuntime = function favStartRuntimeDeferred0128() {
    favRuntimePending0128 = true;
};

function favReleaseRuntime0128() {
    if (!favFinalRuntimeReady0130) {
        favRuntimePending0128 = true;
        return;
    }
    const shouldStart = favRuntimePending0128 || !favState.runtimeStarted0120;
    favStartRuntime = favStartRuntimeBefore0128;
    favRuntimePending0128 = false;
    if (!shouldStart) return;
    favState.runtimeStarted0120 = true;
    favStartRuntimeBefore0128();
}

function favMarkFinalRuntimeReady0130() {
    favFinalRuntimeReady0130 = true;
    favReleaseRuntime0128();
}
