'use strict';

/* Final Favorites collection-model/create-operation ownership boundary.
 *
 * The v0.12 shell kept one unkeyed collectionModel0120 and treated the
 * disappearance of any body dialog as evidence that a Create collection flow
 * had completed. During soft navigation that can reuse profile A's collection
 * model on profile B, or let a stale/unrelated dialog completion fetch the
 * current location and overwrite the wrong profile's model.
 *
 * Keep presentation in the existing module-94 strip owner. This boundary owns
 * only collection data provenance and the bounded native-create operation:
 *   - collection fallback is keyed to the verified profile owner;
 *   - fetched collection models are owner-verified and stay preferred over an
 *     older same-document SSR model until another verified refresh;
 *   - one create operation captures owner + route + dataset + starting URL;
 *   - only a newly opened dialog attributable to that operation is tracked;
 *   - superseding operations and owner/route changes fail closed;
 *   - stale async completion never mutates the live collection model.
 */

favState.collectionModelOwnerKey01526 = String(favState.collectionModelOwnerKey01526 || '');
favState.collectionModelVerified01526 = favState.collectionModelVerified01526 === true;
favState.collectionCreateGeneration01526 = Math.max(0, Number(favState.collectionCreateGeneration01526) || 0);
favState.collectionCreateWatch01526 = favState.collectionCreateWatch01526 || null;

function favCollectionOwnerKey01526(scope = favScope?.()) {
    const owner = String(scope?.owner || '').trim();
    const login = String(scope?.login || favProfileLogin?.() || '').trim().toLowerCase();
    return owner && login ? `${owner}|${login}` : '';
}

function favCollectionRouteKey01526() {
    const route = typeof favRouteIdentity0126 === 'function'
        ? String(favRouteIdentity0126() || '')
        : `${location.pathname || ''}|${location.search || ''}`;
    const dataset = typeof favDatasetKey === 'function' ? String(favDatasetKey() || '') : '';
    return `${route}|${dataset}`;
}

function favCollectionContext01526() {
    const scope = typeof favScope === 'function' ? favScope() : null;
    const ownerKey = favCollectionOwnerKey01526(scope);
    return {
        owner:String(scope?.owner || '').trim(),
        login:String(scope?.login || favProfileLogin?.() || '').trim(),
        ownerKey,
        routeKey:favCollectionRouteKey01526(),
        href:String(location.href || ''),
    };
}

function favCollectionContextCurrent01526(context) {
    if (!context?.ownerKey || !context?.routeKey) return false;
    const current = favCollectionContext01526();
    return current.ownerKey === context.ownerKey && current.routeKey === context.routeKey;
}

function favCollectionPropsCandidate01526(root = document, expectedOwner = '') {
    const wantedOwner = String(expectedOwner || '').trim();
    let candidate = null;
    for (const script of root?.querySelectorAll?.('script[type="text/props"]') || []) {
        const text = String(script?.textContent || '');
        if (!text.includes('"profileOwnerUserId"') || !text.includes('"collectionsTabs"')) continue;
        try {
            const data = JSON.parse(text);
            const owner = String(data?.profileOwnerUserId || '').trim();
            if (!owner || (wantedOwner && owner !== wantedOwner)) continue;
            if (!Array.isArray(data?.collectionsTabs)) continue;
            /* Prefer the last matching payload. During soft navigation Etsy can
             * briefly leave an older props island before mounting the new one. */
            candidate = data;
        } catch (_) {}
    }
    return candidate;
}

function favCollectionEntries01526(entries) {
    return (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry?.__type === 'collection' && entry.url && entry.name)
        .map((entry) => ({
            id:String(entry.id || ''),
            slug:String(entry.slug || ''),
            name:String(entry.name || ''),
            url:String(entry.url || ''),
            privacyLevel:String(entry.privacyLevel || ''),
        }));
}

function favCollectionModelSignature01526(entries) {
    return JSON.stringify(favCollectionEntries01526(entries).map(({ id, slug, name, url }) => [id, slug, name, url]));
}

favCollections0120 = function favCollections01526() {
    const context = favCollectionContext01526();
    if (!context.ownerKey) return [];

    const liveProps = favCollectionPropsCandidate01526(document, context.owner);
    const cacheMatchesOwner = favState.collectionModelOwnerKey01526 === context.ownerKey
        && Array.isArray(favState.collectionModel0120);

    /* A network-verified owner model is newer than the initial same-document
     * SSR props that commonly remain mounted after the Create dialog closes.
     * Keep it until another verified refresh or owner transition. */
    if (cacheMatchesOwner && favState.collectionModelVerified01526) {
        return favCollectionEntries01526(favState.collectionModel0120);
    }

    if (liveProps) {
        favState.collectionModel0120 = liveProps.collectionsTabs;
        favState.collectionModelOwnerKey01526 = context.ownerKey;
        favState.collectionModelVerified01526 = false;
        return favCollectionEntries01526(liveProps.collectionsTabs);
    }

    if (cacheMatchesOwner) return favCollectionEntries01526(favState.collectionModel0120);
    return [];
};

async function favRefreshCollectionModel0120(contextInput = favCollectionContext01526()) {
    const context = { ...contextInput };
    if (!favCollectionContextCurrent01526(context)) return false;

    try {
        const response = await fetch(context.href, {
            credentials:'include',
            headers:{ Accept:'text/html,application/xhtml+xml' },
        });
        if (!response.ok || !favCollectionContextCurrent01526(context)) return false;

        const html = await response.text();
        if (!favCollectionContextCurrent01526(context)) return false;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const props = favCollectionPropsCandidate01526(doc, context.owner);
        if (!props || String(props.profileOwnerUserId || '').trim() !== context.owner) return false;
        if (!favCollectionContextCurrent01526(context)) return false;

        const before = favCollectionModelSignature01526(
            favState.collectionModelOwnerKey01526 === context.ownerKey ? favState.collectionModel0120 : []
        );
        const after = favCollectionModelSignature01526(props.collectionsTabs);
        favState.collectionModel0120 = props.collectionsTabs;
        favState.collectionModelOwnerKey01526 = context.ownerKey;
        favState.collectionModelVerified01526 = true;

        if (before !== after) {
            const sidebar = document.querySelector?.('[data-testid="sidebar"]');
            const content = favFavoritesContentColumn0120?.(sidebar);
            if (content && favCollectionContextCurrent01526(context)) favInstallCollectionStrip0120?.(content);
            return true;
        }
        return false;
    } catch (error) {
        console.warn('[Etsy BetterSearch] Could not refresh the collection selector:', error);
        return false;
    }
}

function favCollectionDialogVisible01526(dialog) {
    return Boolean(
        dialog?.isConnected
        && dialog.hidden !== true
        && dialog.getAttribute?.('aria-hidden') !== 'true'
    );
}

function favCollectionDialogHint01526(dialog) {
    if (!dialog?.matches?.('[role="dialog"]')) return false;
    if (dialog.querySelector?.('[data-testid*="collection" i],[data-test-id*="collection" i],input[name*="collection" i],input[id*="collection" i]')) return true;
    return /\bcollection\b/i.test(String(dialog.getAttribute?.('aria-label') || ''));
}

function favChooseCollectionDialog01526(operation) {
    const dialogs = Array.from(document.querySelectorAll?.('[role="dialog"]') || [])
        .filter((dialog) => !operation.baselineDialogs.has(dialog) && favCollectionDialogVisible01526(dialog));
    if (!dialogs.length) return null;

    if (operation.controlledId) {
        const controlled = dialogs.find((dialog) => String(dialog.id || '') === operation.controlledId);
        if (controlled) return controlled;
    }

    const hinted = dialogs.filter(favCollectionDialogHint01526);
    if (hinted.length === 1) return hinted[0];
    /* If exactly one new dialog appeared immediately after the exact native
     * Create click, bind that node. Multiple ambiguous dialogs fail closed. */
    return dialogs.length === 1 ? dialogs[0] : null;
}

function favStopCollectionCreateWatch01526(operation = favState.collectionCreateWatch01526) {
    if (!operation) return;
    operation.observer?.disconnect?.();
    clearTimeout(operation.timeoutId);
    operation.timeoutId = 0;
    operation.observer = null;
    if (favState.collectionCreateWatch01526 === operation) favState.collectionCreateWatch01526 = null;
}

function favCollectionCreateOperationCurrent01526(operation) {
    return Boolean(
        operation
        && favState.collectionCreateGeneration01526 === operation.generation
        && favCollectionContextCurrent01526(operation.context)
    );
}

function favWatchCollectionCreation0120() {
    favStopCollectionCreateWatch01526();
    const context = favCollectionContext01526();
    if (!context.ownerKey || !context.href) return null;

    const nativeCreate = favNativeCreateButton0120?.() || null;
    const generation = ++favState.collectionCreateGeneration01526;
    const operation = {
        generation,
        context,
        baselineDialogs:new Set(document.querySelectorAll?.('[role="dialog"]') || []),
        controlledId:String(nativeCreate?.getAttribute?.('aria-controls') || '').trim(),
        dialog:null,
        observer:null,
        timeoutId:0,
    };

    const reconcile = () => {
        if (!favCollectionCreateOperationCurrent01526(operation)) {
            favStopCollectionCreateWatch01526(operation);
            return;
        }

        if (!operation.dialog) {
            operation.dialog = favChooseCollectionDialog01526(operation);
            return;
        }
        if (favCollectionDialogVisible01526(operation.dialog)) return;

        favStopCollectionCreateWatch01526(operation);
        /* Preserve the generation while the verified refresh is in flight. A
         * second Create click increments it and makes this completion stale. */
        if (favCollectionCreateOperationCurrent01526(operation)) {
            void favRefreshCollectionModel0120(operation.context);
        }
    };

    operation.observer = new MutationObserver(reconcile);
    operation.observer.observe(document.body, {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['hidden','aria-hidden'],
    });
    operation.timeoutId = setTimeout(() => favStopCollectionCreateWatch01526(operation), 120000);
    favState.collectionCreateWatch01526 = operation;
    return operation;
}
