'use strict';

/* v0.12.6 startup ordering guard.
 *
 * Module 86 historically starts the Favorites runtime before modules 87+ have
 * finished installing their shell/layout overrides. That produces a transient
 * older shell, extra mutation work, and a visible second reconstruction during
 * page hydration. Intercept that early start and release it only from the final
 * module after every Favorites override is installed.
 */

var favStartRuntimeBefore0128 = favStartRuntime;
var favRuntimePending0128 = false;

favStartRuntime = function favStartRuntimeDeferred0128() {
    favRuntimePending0128 = true;
};

function favReleaseRuntime0128() {
    const shouldStart = favRuntimePending0128 || !favState.runtimeStarted0120;
    favStartRuntime = favStartRuntimeBefore0128;
    favRuntimePending0128 = false;
    if (!shouldStart) return;
    favState.runtimeStarted0120 = true;
    favStartRuntimeBefore0128();
}
