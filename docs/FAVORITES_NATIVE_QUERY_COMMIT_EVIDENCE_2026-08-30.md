# Favorites native-query commit evidence design — 2026-08-30

**Status:** source + Diagnostics capability audit. No production network interception is implemented by this document.

## Problem statement

BetterSearch needs to distinguish three different things:

```text
text currently typed in Etsy Search
pending/submitted Etsy search intent
query Etsy actually committed to a completed Favorites result generation
```

Current v0.13.1 code improved the original live-input problem but still allows the last transition to be inferred from time alone.

`src/99-favorites-v0131-correctness.js` keeps pending/submitted query state and a native-grid fingerprint. A submitted query is committed when either:

```text
native grid fingerprint changed
OR
~850 ms fallback elapsed
```

Therefore the fallback timeout itself can create a durable dataset/query identity even if no corresponding native result generation has been proven.

The existing test suite explicitly exercises and accepts that behavior by backdating `nativeQuerySubmittedAt0140` and expecting the pending query to become committed.

This contract is too weak for durable scope/cache identity.

---

# 1. Diagnostics already captures the evidence needed to research the real Etsy transition

Current Diagnostics v0.2.7 stores raw CDP `Network.*` events while network capture is enabled.

For each request it already records data including:

- `Network.requestWillBeSent`;
- request ID;
- full request URL;
- initiator information;
- resource type/document URL;
- `Network.responseReceived`;
- response status/headers/timing;
- `Network.loadingFinished`;
- optional response body;
- monotonic + wall-clock timestamps.

The page-side recorder also records:

- click/change/input interactions;
- Enter key presses;
- exact timestamps;
- input **value length**, not raw input value, in interaction records;
- important native/local grid state after interactions/mutations.

This is enough to perform a controlled research pass without adding a production fetch/XHR monkey patch first.

---

# 2. Candidate Etsy Favorites request families to classify

Existing BetterSearch source uses these same-site Favorites families:

```text
/api/v3/ajax/member/users/<owner>/favorites/landing-listings
/api/v3/ajax/bespoke/member/users/<owner>/collections/<collection>/landing-listings-bespoke
```

Generated-group endpoints need equivalent classification if native Etsy search is exposed there.

Likely useful request fields:

```text
owner/path identity
collection/group identity
query parameter
limit
offset
filters/scope parameters
request initiator stack/type
request ID
request start time
response status
response completion time
returned listing count / server total when parseable
```

Do **not** assume every request to one of these URLs was initiated by Etsy's native search UI. BetterSearch itself also calls Favorites endpoints for catalogue work.

The research job is specifically to discover a reliable differentiator.

---

# 3. Diagnostics semantic classifier to add later

Instead of forcing every future audit to manually inspect raw CDP, Diagnostics should derive redacted semantic events.

Example:

```text
native-search-request-candidate {
  requestId
  scopeKind
  ownerPresent
  queryLength
  queryHashWithinSession
  offset
  limit
  initiatorType
  initiatorFrame/urlHint
  observedAt
}

native-search-response-candidate {
  requestId
  status
  completed
  resultCount?
  totalHint?
  queryHashWithinSession
}
```

Use a per-recording salted hash or equivalent redacted token if query correlation is needed. Public docs/fixtures should never contain the user's raw query strings.

The raw private ZIP may still contain the URL because CDP/HAR capture already does; the semantic summary should minimize unnecessary exposure.

---

# 4. Controlled experiment matrix

Capture a short dedicated Diagnostics session for each case.

## A. Native query submit

```text
type query
press Enter / native submit
wait for stable native results
```

Correlate:

```text
interaction timestamp
→ requestWillBeSent
→ responseReceived 2xx
→ loadingFinished
→ native grid identity/fingerprint/card-set transition
```

## B. Clear with Etsy's native X button

Important because the existing false-empty bug occurred around search clear.

Prove whether clear produces:

- a native `search` event;
- a request with empty query;
- a successful response;
- a restored native grid generation.

The empty query must not become durable simply because an 850 ms timer expired.

## C. Fast submit -> clear

Submit query A and clear it before A completes.

Required eventual model:

```text
pending generation A
pending generation B(empty)
late response A arrives
A must not commit
response B arrives
B may commit
```

## D. Fast submit A -> submit B

Proves out-of-order response handling.

## E. No-result query

A legitimate zero-result response must still be a valid committed query generation when the request/response identity is verified.

Zero results are not inherently transient corruption; only unverified or stale zero-result scopes should be treated as unsafe.

## F. Native page navigation while query is active

Determine whether page 2 requests preserve the committed query and how to separate view/page generation from dataset/query generation.

## G. Collection switch while query request is in flight

A late response from the previous collection must never commit into the new collection's query state.

---

# 5. Production query state machine target

Use an explicit monotonic generation.

```text
NativeQueryState {
  scopeGeneration
  committed: {
    value
    generation
    evidence
    committedAt
  }
  pending?: {
    value
    submissionId
    submittedAt
    expectedScopeGeneration
  }
}
```

## Submission

On verified native search submit/clear intent:

```text
submissionId++
pending = { value, submissionId, current scope generation }
```

Typing without submit only updates draft/UI state.

## Acknowledgement

A pending query becomes committed only when evidence belongs to:

```text
same owner/scope generation
same latest submissionId / expected query token
verified Etsy native result request/response generation
```

Late acknowledgements are ignored.

## Timeout

A timeout may do this:

```text
stop spinner / release waiting UI
fall back to native visible state
emit diagnostic timeout
possibly schedule observation/retry
```

It must **not** do this by itself:

```text
create a durable committed query scope
mark a query catalogue complete
hide a useful native grid behind a local result
```

---

# 6. Initial page/SSR query is a different evidence source

Direct navigation/reload may arrive with an already-committed query represented in server HTML/props/URL.

That can initialize committed query state when all of these agree sufficiently:

```text
stable owner/scope generation
trusted native/server query field or route
native current result view
```

Label provenance explicitly, for example:

```text
ssr-initial
native-network-ack
history/navigation-ack
```

Do not mix SSR initialization with later live-input submission logic.

---

# 7. Production observation mechanism: research before choosing

Diagnostics CDP is development-only; BetterSearch production cannot depend on `chrome.debugger`.

After the CDP experiment identifies Etsy's real contract, choose the least invasive production acknowledgement mechanism.

Candidates, from preferred to more invasive:

1. native Etsy props/state transition if it reliably exposes the committed query/result generation;
2. same-origin `PerformanceResourceTiming` / resource observation if it reliably exposes completion URL identity across supported delivery targets;
3. a narrow platform bridge that observes native fetch/XHR only if no stable native state signal exists.

Do not add a general fetch/XMLHttpRequest monkey patch merely because Diagnostics can see the network. A production hook should be justified by the controlled evidence.

Any production mechanism must work in both:

- Tampermonkey shared source;
- Chrome/Firefox extension content bundle;

or sit behind a clearly tested platform adapter.

---

# 8. Interaction/input identity also needs tightening

Current `favIsFavoritesSearchInput0140()` accepts:

- recognized placeholders;
- any input under `.ebsf-native-search-slot`.

This is broader than an exact native-control instance/generation.

Future query state should bind to the actual search form/input pair captured for the current owner/scope generation.

When Etsy replaces that form:

```text
old input events are stale
new input gets a new control generation
```

This prevents unrelated/moved inputs from becoming durable query sources.

---

# 9. Durable query-scope policy

Even a verified query-generation system should not retain every query forever.

Recommended persistence classes:

### Canonical

```text
no-query All
no-query real collection
generated group if intentionally supported
```

Durable.

### Verified query scope

Bounded TTL/LRU, e.g. retain a small recent set per owner/scope.

### Verified zero-result query

Shorter TTL unless repeatedly used.

### Unverified legacy/transient query

Do not use as authoritative cache. Eligible for migration cleanup.

### Invalid identity

Reject/remove:

```text
empty owner for owner-required scope
implausible excessive query length for durable key
malformed scope identity
```

The exact query-length limit should be chosen from real Etsy behavior/product needs, not guessed from the polluted historical dump.

---

# 10. Regression tests required

1. typing only never changes committed query;
2. submitted query with no verified acknowledgement remains pending/unverified even after timeout;
3. timeout cannot create/persist a query scope;
4. verified request/response commits exactly one generation;
5. submit A -> submit B -> late A response cannot overwrite B;
6. submit A -> clear -> late A response cannot restore A;
7. verified empty-query clear commits only after the clear generation is acknowledged;
8. legitimate verified zero-result query commits safely;
9. owner/scope change invalidates pending query generation;
10. old search input replacement invalidates its listeners/intent;
11. query scope persistence records provenance/generation;
12. retention removes stale transient scopes without deleting canonical no-query snapshots.

The current v0.13.1 test that explicitly expects the 850 ms timeout to commit should be replaced; today it locks the weakness into the suite.

---

# 11. Diagnostics acceptance criteria before production implementation

Before choosing the production acknowledgement signal, collect enough short recordings to answer:

```text
Which exact Etsy request corresponds to native submit/clear?
Can it be distinguished from BetterSearch's catalogue requests?
What initiator fields are stable?
Does query appear in URL/request payload consistently?
What response event/body/state proves result commitment?
How are zero-result responses represented?
How does collection search differ from All search?
What happens under out-of-order requests?
What happens on native pagination with active query?
```

Only then promote a specific native-query acknowledgement mechanism into production.