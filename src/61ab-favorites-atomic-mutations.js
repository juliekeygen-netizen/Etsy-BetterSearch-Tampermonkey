'use strict';

/* v0.15.20 atomic mutable-row primitives.
 *
 * IndexedDB serializes overlapping readwrite transactions, but only when the
 * read of the state being mutated happens inside that same transaction. These
 * helpers keep the read/merge/write boundary short and synchronous from the
 * transaction's point of view. Network requests and parsing must happen before
 * entering these helpers.
 */

function favAtomicPut01520(value, result = value) {
    return { write:true, value, result };
}

function favAtomicNoWrite01520(result = null) {
    return { write:false, result };
}

async function favIndexMutateStoreRow01520(storeName, key, mutator) {
    const db = await favIndexOpen();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        let result = null;
        let failure = null;
        let settled = false;

        function rejectOnce(error) {
            if (settled) return;
            settled = true;
            reject(error || new Error(`Favorites ${storeName} mutation failed.`));
        }

        function abortWith(error) {
            failure = error instanceof Error ? error : new Error(String(error || `Favorites ${storeName} mutation failed.`));
            try { transaction.abort(); }
            catch (_) { rejectOnce(failure); }
        }

        request.onsuccess = () => {
            try {
                const outcome = mutator(request.result, { transaction, store });
                result = outcome?.result;
                if (outcome?.write === true) store.put(outcome.value);
            } catch (error) {
                abortWith(error);
            }
        };
        request.onerror = () => abortWith(request.error || new Error(`Favorites ${storeName} read failed.`));
        transaction.oncomplete = () => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        transaction.onerror = () => {
            failure = failure || transaction.error || new Error(`Favorites ${storeName} mutation failed.`);
        };
        transaction.onabort = () => rejectOnce(failure || transaction.error || new Error(`Favorites ${storeName} mutation aborted.`));
    });
}

/* Deep listing metadata also updates the associated shop row. The shop key is
 * learned from the latest listing row, so the shop read is issued from the
 * listing request's success callback while the same readwrite transaction is
 * still active. The mutator must be synchronous and may return:
 *
 *   { listing:<row>, shop:<row|null>, result:<any> }
 *
 * Omitted listing/shop values mean no write for that store. */
async function favIndexMutateListingAndShop01520(listingId, mutator) {
    const idValue = String(listingId || '');
    if (!idValue) throw new Error('Atomic listing mutation requires a listing ID.');
    const db = await favIndexOpen();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['listings', 'shops'], 'readwrite');
        const listingStore = transaction.objectStore('listings');
        const shopStore = transaction.objectStore('shops');
        const listingRequest = listingStore.get(idValue);
        let result = null;
        let failure = null;
        let settled = false;

        function rejectOnce(error) {
            if (settled) return;
            settled = true;
            reject(error || new Error('Favorites listing/shop mutation failed.'));
        }

        function abortWith(error) {
            failure = error instanceof Error ? error : new Error(String(error || 'Favorites listing/shop mutation failed.'));
            try { transaction.abort(); }
            catch (_) { rejectOnce(failure); }
        }

        function applyMutation(listing, shop) {
            try {
                const outcome = mutator(listing, shop, { transaction, listingStore, shopStore }) || {};
                result = outcome.result;
                if (outcome.listing !== undefined) listingStore.put(outcome.listing);
                if (outcome.shop !== undefined && outcome.shop !== null) shopStore.put(outcome.shop);
            } catch (error) {
                abortWith(error);
            }
        }

        listingRequest.onsuccess = () => {
            const listing = listingRequest.result;
            const shopId = String(listing?.shopId || '');
            if (!shopId) {
                applyMutation(listing, null);
                return;
            }
            const shopRequest = shopStore.get(shopId);
            shopRequest.onsuccess = () => applyMutation(listing, shopRequest.result || null);
            shopRequest.onerror = () => abortWith(shopRequest.error || new Error('Favorites shop read failed.'));
        };
        listingRequest.onerror = () => abortWith(listingRequest.error || new Error('Favorites listing read failed.'));
        transaction.oncomplete = () => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        transaction.onerror = () => {
            failure = failure || transaction.error || new Error('Favorites listing/shop mutation failed.');
        };
        transaction.onabort = () => rejectOnce(failure || transaction.error || new Error('Favorites listing/shop mutation aborted.'));
    });
}
