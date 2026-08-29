# Favorites render generation and test-gap audit — 2026-08-30

Status: focused source/test audit against BetterSearch v0.15.1 / `main` baseline `56fa30c4bcf0533f1c9b695f1f0a20fbef35fcdc`.

This document narrows the broader Diagnostics requirement for a signed local render transaction. It separates what the current module-101 signature already protects from what remains unrepresented, and records why several green tests do not cover the real combined lifecycle.

## 1. Current render signature is request identity, not data generation

`favRequestedRenderSignature0143()` currently serializes:

```text
favDatasetKey()
+
favNormalizeConfig(favCfg)
```

This is useful. It prevents a local grid produced for one dataset/filter configuration from being considered authoritative after the dataset or config changes.

It does not encode:

- verified catalogue snapshot/generation;
- committed native-query generation distinct from raw dataset string;
- metadata destination/context generation;
- metadata requirement generation;
- native current-page/view generation;
- record revision/presentation revision;
- local result ID/order signature.

So the signature proves:

```text
"this mounted local grid claims the same dataset/config requested now"
```

not:

```text
"this grid was rendered from the exact current authoritative records + metadata + native-view generation"
```

## 2. The inner reapply pipeline does have useful dataset rechecks

The audit should not overstate the problem.

`favReapply()` captures `requestKey=favDatasetKey()` and checks it after major awaits. `favRenderCurrent()` reads current `favState.records` at render time rather than holding one stale record array from the beginning of the async function.

Therefore this is not a generic "every async reapply renders an old captured array" bug.

The remaining weakness is that same-dataset record/context revisions are not first-class generation tokens.

## 3. Module 101 stamps the signature after the inner reapply returns

The final wrapper performs approximately:

```text
datasetKey = favDatasetKey()
set rendering status
await previous favReapply()
if dataset changed: return
if local grid is mounted:
    renderSignature = favRequestedRenderSignature0143()
```

The signature is recomputed after the await from current dataset/config.

That means it is not evidence about which exact record/catalogue/metadata revision produced the DOM. It is a post-hoc statement that the current request identity still matches the mounted local mode.

Usually the inner pipeline and mutation completion hooks keep those states aligned. The architecture still lacks a proof token when multiple same-dataset generations overlap.

## 4. Render-integrity readiness checks `pending`, not full semantic freshness

`favRenderIntegrityReady0142()` rejects repair while:

```text
metadataCoverage.pending > 0
```

Chunk 4 showed that auxiliary metadata can be unresolved/stale for the active destination while `pending` is zero because `pending` mainly tracks queued deep work.

So render integrity can consider the local view ready while current-context auxiliary values are not semantically current.

This is another reason the render transaction needs a metadata context/requirement generation rather than one pending count.

## 5. Native view generation is not in the local render signature

The dataset intentionally remains the same across native page 1/2/3.

That is correct for the catalogue cache.

But local card presentation can be refreshed from whichever native 20-card view is currently mounted. The renderer and hydration adapter therefore also need a view/presentation generation for operations that depend on native DOM.

The future transaction should distinguish:

```text
catalogue generation: full dataset truth
native view generation: current Etsy page/card presentation
local result generation: filter/sort output over catalogue generation
```

A native page change should not invalidate the catalogue, but it should invalidate stale native-card references and hydration work.

## 6. Suggested render transaction

A local takeover transaction can be represented approximately as:

```text
renderId
ownerGeneration
scope/dataset identity
committedQueryGeneration
catalogueGenerationId
catalogueCompleteness
metadataContextGeneration
metadataRequirementGeneration
filterConfigRevision/hash
sort revision/hash
localResultIds/order hash
nativeViewGeneration used for presentation clones
startedAt
```

Before committing local ownership:

```text
all required generation tokens still current
local result signature matches transaction
native/local pager transaction agrees
```

Then atomically publish:

```text
local grid DOM
local pager state
shown count
renderSignature/renderId
```

## 7. Current tests are mostly static contracts

`favorites-v0141-smoke-regressions.test.mjs` and `favorites-v0142-browser-runtime.test.mjs` mostly read source files as text and assert that:

- signature helpers exist;
- local-grid authority compares signature;
- visibility checks exist;
- native hydration observer is scoped to the native grid;
- shell failure fallback exists;
- local/native variables are not directly assigned to each other.

These tests are valuable for preventing accidental removal of known hardening layers.

They do not execute the combined browser state machine.

## 8. Static separation does not prove semantic isolation

Chunk 4's pager alias is the clearest example.

The test asserts module 95a does not assign:

```text
favState.localPage = target
```

Yet both native/local handlers can still match the same DOM pager because they share the same aria-label and 95a lacks the local marker exclusion.

Likewise, the shell test can prove one observer has an owned-node predicate while another active observer remains completely unfiltered.

Future regression testing should model combined behavior, not only source-symbol separation.

## 9. Missing combined fixtures

### Render generation race

```text
catalogue generation G1 mounted
same dataset begins refresh to G2
filter config unchanged
G2 changes records/order
```

Assert a local grid rendered/marked under G1 cannot remain authoritative after G2 becomes active without a re-render or explicit reconciliation.

### Metadata context race

```text
render generation uses shipping context A
context B becomes current without dataset change
```

Assert A render is no longer authoritative for shipping-dependent filter/sort.

### Native-view presentation race

```text
catalogue stable
native page 1 refs captured
native page changes to 2
old hydration timer fires
```

Assert page-1 native nodes cannot patch page-2/current local presentation.

### Grid/pager atomicity

Assert a render transaction never exposes local grid + native pager or native grid + local pager as committed visible ownership.

### Self-mutation lifecycle

Combine the actual runtime observer with final shell/header writers and verify a no-op reconcile reaches quiescence.

## 10. Add revision counters to development diagnostics

Useful low-cost state for future recordings:

```text
ownerGeneration
catalogueGeneration
queryGeneration
metadataContextGeneration
nativeViewGeneration
localRenderGeneration
shellGeneration
railGeneration
```

Record transitions/reasons, not private query/listing content.

This would make future Diagnostics analysis much easier than inferring generations from DOM timestamps alone.

## 11. Do not make the signature an enormous serialized object

The current config JSON is simple enough, but the future render token should reference stable revision IDs/hashes rather than stringify full catalogue/metadata objects.

Example:

```text
renderKey = ownerGen/catalogueGen/queryGen/metaGen/configRev/viewGen
```

The record/result signature can be a bounded ID/order hash if needed for assertions.

## 12. Priority

This is the semantic glue between the planned data-generation release and the lifecycle/render refactor.

The P0 IndexedDB owner/snapshot integrity work remains first. The bounded pager alias can ship independently. Render-generation work should then consume the new catalogue/query/metadata generation IDs rather than invent another parallel identity system.