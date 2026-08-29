# Favorites local-card action delegation audit — 2026-08-30

Status: focused source audit. This document records behavior/risk discovered while reviewing how v0.15.1 BetterSearch-owned local cards forward heart/cart interactions when the corresponding Etsy native card is or is not mounted.

This is not evidence that every risk below occurred in the recorded Diagnostics session. Confidence is labeled per finding. No account/listing identifiers are committed.

## Why this matters

BetterSearch local filtering/sorting can render records from the complete cached catalogue while Etsy only keeps the current native Favorites page's cards mounted.

Therefore there are two interaction cases:

```text
local card corresponds to native card currently mounted
-> delegate to Etsy's live native control

local card is from another native page / no native counterpart mounted
-> fallback behavior required
```

The second case is common by design when a global filter/sort produces local page 2/3 or surfaces a cached favorite that is not in Etsy's current native 20-card view.

Relevant code:

- `src/63-favorites-runtime.js`
- `src/25-scan-favorite.js`

---

## 1. Current heart behavior when a live native counterpart exists — SOURCE-PROVEN

`favNativeActionForOwnedCard0141()` looks up the local card's ID in `favState.nativeNodes` and requires the matching native node to still be connected.

If a live native favorite button exists, the local click handler:

1. marks the local heart working;
2. calls the real Etsy native button's `.click()`;
3. waits a fixed ~900 ms;
4. reads favorite state from the same stored native button reference;
5. updates the local heart visual;
6. removes the local record if the native button appears unfavorited.

This is a good ownership principle: Etsy remains the real mutation owner where possible.

### Risk: fixed-time state inference — SOURCE-PROVEN WEAKNESS

The completion check is time-based rather than state/event based.

If Etsy takes longer than the fixed delay, or if Preact replaces the native button/node during the action, the old stored button reference can still expose stale favorite state.

Possible result:

```text
real Etsy unfavorite eventually succeeds
but BetterSearch reads old/connected-or-detached button too early
-> local card remains until later reconciliation
```

or the inverse if an optimistic native state changes and later rolls back.

Recommended improvement:

- observe/await a bounded authoritative native state transition rather than one fixed timeout;
- reacquire the matching native card/button by listing ID before final state read;
- if native control disappears/replaces during action, reconcile from current native/IndexedDB/API evidence instead of trusting the old node object;
- retain a timeout only as failure/fallback, not as the normal success proof.

Regression tests should simulate delayed native mutation and native-button replacement.

---

## 2. Off-page heart fallback uses Etsy's listing page in a hidden iframe — SOURCE-PROVEN

When `favState.nativeNodes` has no connected card for the local listing, `favHandleTransplantedClick()` falls back to the shared `bridgeFavorite(card, button)` helper from `src/25-scan-favorite.js`.

The bridge:

1. derives listing ID and listing URL from the reconstructed/local card;
2. computes the desired favorite state from the local heart;
3. creates a hidden same-origin iframe with the listing URL;
4. waits for load;
5. scans iframe buttons for a semantic Favorite control;
6. clicks it if the current iframe state differs from the desired state;
7. waits ~900 ms;
8. updates the local heart and removes the iframe.

This means off-page heart removal is not inherently unsupported. BetterSearch deliberately falls back to Etsy's own listing-page interaction instead of inventing a private favorite API request.

The fallback is expensive compared with a mounted native click because it loads a full listing page, but it only runs from an explicit user action.

---

## 3. The iframe heart bridge does not verify listing identity — SOURCE-PROVEN CORRECTNESS RISK

The bridge derives a `listingId`, but currently uses that ID only for job de-duplication (`state.favoriteJobs`).

After the iframe loads, it does **not** prove that the loaded page still corresponds to the requested listing before locating/clicking a Favorite button.

This is notably weaker than the deep metadata scanner, which already compares requested listing identity against parsed product/listing identity and rejects a mismatch.

Potential cases include:

- listing URL redirects;
- removed/unavailable listing lands on another Etsy surface;
- an unexpected authentication/challenge/interstitial page exposes unrelated controls;
- Etsy changes listing routing/fallback behavior;
- a stale cached URL no longer identifies the intended listing.

The current helper simply searches the resulting document for favorite-like controls and prefers one outside `[data-results-grid-container]`.

### Required invariant

Before changing favorite state through an iframe:

```text
requested listing ID
==
verified loaded listing/product ID
```

If identity cannot be verified, do not click anything. Keep the local state unchanged and direct the user to the listing page/manual action.

Reuse the same identity extraction concepts as the deep scanner where possible rather than creating another parser.

### Regression tests

- requested listing loads same listing -> action allowed;
- requested listing redirects to different listing -> no click;
- requested listing redirects to generic Etsy page -> no click;
- challenge/sign-in/interstitial -> no click;
- recommendation cards contain heart buttons but requested listing identity is not proven -> no click.

---

## 4. Iframe Favorite-control selection is semantic but still broad — SOURCE-PROVEN RISK

`waitForIframeFavorite()` gathers buttons whose labels/titles look like Add/Remove Favorite/Favourite, then prefers a button that is not under `[data-results-grid-container]`.

This is better than clicking the first heart SVG, but it is still a page-wide heuristic.

Identity validation from section 3 is the first required guard. After identity is proven, the selector should also prefer a listing-primary Favorite control from a known semantic listing container and reject recommendation/module hearts.

Do not solve this by keying to unstable SVG paths.

---

## 5. Off-page Add to cart / Multiple options intentionally degrades to opening the listing — SOURCE-PROVEN BEHAVIOR/PARITY LIMITATION

For local-card buttons matching Add to cart / Multiple options / Select options:

```text
matching live native card exists
-> click Etsy's native button

no matching native card exists
-> open the listing URL in a new tab
```

This is not currently a silent failure and may be the safest fallback, especially for variation-dependent listings. It is therefore recorded as a parity limitation rather than a confirmed bug.

Product decision to make later:

- keep the safe listing-page fallback and make it explicit/consistent in UI; or
- build a verified native/action API bridge only if Etsy exposes a stable safe mechanism.

Do not invent cart requests from stale cached card data.

---

## 6. Local clones intentionally do not retain native event listeners — SOURCE-PROVEN / CORRECT

`favNodeForRecord()` may clone a live native card's DOM into the BetterSearch-owned sibling grid. DOM `cloneNode(true)` does not clone JavaScript event listeners.

The local card is then marked `data-ebsf-owned-card="1"`, and BetterSearch's document-level action handler handles the heart/cart controls explicitly.

This is the correct general model. Attempting to preserve Etsy/Preact listener internals on cloned DOM would create a much more fragile ownership violation.

The audit concern is therefore the correctness of the explicit delegation/fallback contract, not the absence of cloned listeners.

---

## 7. Action generation should be tied to current record identity

The broader audit found that render authority currently lacks a complete catalogue/query generation token. Action delegation should inherit the future render token rather than trusting only DOM dataset IDs.

Before mutating state from a local card, verify at least:

```text
card listing ID exists in current recordsById
card belongs to current committed local render generation
current scope/dataset still matches that generation
button action has not already been superseded
```

If a filter/query/scope changes while an iframe/native action is in flight, the mutation may still complete on Etsy, but the old local node should not blindly mutate the new view. Trigger authoritative reconciliation instead.

---

## 8. Suggested Diagnostics instrumentation for local actions

Record one compact action lifecycle:

```text
local-action-start
  listing-id hash/redacted token
  render generation
  action kind
  delegation = live-native | iframe | listing-open-fallback

local-action-native-reacquired
local-action-iframe-identity-verified
local-action-state-observed
local-action-complete
local-action-timeout
local-action-identity-mismatch
local-action-stale-generation
```

Do not capture private listing/account content unnecessarily; stable hashed/redacted IDs inside a single capture are enough for correlation.

---

## 9. Priority

This audit does **not** outrank the current P0 snapshot-atomicity, local/native pager alias, or semantic render-generation fixes.

Recommended order:

1. fix authoritative data-generation/snapshot integrity;
2. fix local/native pager semantic alias;
3. make local render takeover generation-safe;
4. then harden action delegation with listing identity verification and event/state-based completion.

The off-page cart listing-open fallback can remain unless product behavior explicitly requires stronger parity.
