'use strict';

/* Favorites IndexedDB cross-tab version-change boundary.
 *
 * The base v2 opener rejects `onblocked`, but an already-open Etsy tab did not
 * close its existing database connection when another tab requested a schema
 * upgrade. That can strand a future migration indefinitely. Worse, an old
 * runtime should not reopen its older schema after receiving a versionchange
 * notification and continue writing shapes it no longer owns.
 *
 * Attach the cooperative close handler to both already-created and future
 * connections. Once this document receives a versionchange, database work is
 * fail-closed until the page reloads into the new runtime/schema.
 *
 * v0.15.19 adds a later cached `favIndexOpen` wrapper. A versionchange must
 * clear that outer cache as well, otherwise the final runtime opener can hand
 * the already-closed DB back without re-entering this invalidation guard.
 */

var favIndexVersionInvalidated01527 = favIndexVersionInvalidated01527 === true;
var favIndexVersionchangeDatabases01527 = typeof favIndexVersionchangeDatabases01527 !== 'undefined'
    ? favIndexVersionchangeDatabases01527
    : new WeakSet();

function favIndexVersionchangeError01527() {
    return new Error('Favorites index schema changed in another tab. Reload Etsy BetterSearch before continuing database work.');
}

function favIndexClearLaterOpenCaches01527() {
    /* This variable is declared by 61eb later in the production load order.
     * `typeof` keeps the standalone/userscript boundary safe when it is absent,
     * while concatenated extension builds expose the hoisted binding. */
    if (typeof favMultiOwnerRepairPromise01519 !== 'undefined') {
        favMultiOwnerRepairPromise01519 = null;
    }
}

function favIndexInstallVersionchange01527(db) {
    if (!db || favIndexVersionchangeDatabases01527.has(db)) return db;
    favIndexVersionchangeDatabases01527.add(db);
    const previous = typeof db.onversionchange === 'function' ? db.onversionchange : null;

    db.onversionchange = function favIndexVersionchange01527(event) {
        if (previous) {
            try { previous.call(db, event); } catch (_) {}
        }
        favIndexVersionInvalidated01527 = true;
        favIndexDatabasePromise = null;
        favIndexClearLaterOpenCaches01527();
        try { db.close(); } catch (_) {}
        try {
            document.dispatchEvent?.(new CustomEvent('ebsf:favorites-index-versionchange', {
                detail:{
                    oldVersion:Number(event?.oldVersion) || 0,
                    newVersion:event?.newVersion == null ? null : Number(event.newVersion) || 0,
                },
            }));
        } catch (_) {}
        console.warn?.('[Etsy BetterSearch] Favorites index changed version in another tab; database work is paused until reload.');
    };
    return db;
}

var favIndexOpenBefore01527 = favIndexOpen;
favIndexOpen = function favIndexOpen01527() {
    if (favIndexVersionInvalidated01527) return Promise.reject(favIndexVersionchangeError01527());
    return Promise.resolve(favIndexOpenBefore01527()).then((db) => {
        if (favIndexVersionInvalidated01527) {
            try { db?.close?.(); } catch (_) {}
            throw favIndexVersionchangeError01527();
        }
        return favIndexInstallVersionchange01527(db);
    });
};

/* A previous module can legitimately open the database during startup before
 * this boundary is evaluated. Retrofit the same handler onto that connection
 * without forcing a new open when the DB is still unused. */
if (favIndexDatabasePromise) {
    void Promise.resolve(favIndexDatabasePromise)
        .then((db) => {
            if (favIndexVersionInvalidated01527) {
                try { db?.close?.(); } catch (_) {}
                return;
            }
            favIndexInstallVersionchange01527(db);
        })
        .catch(() => {});
}
