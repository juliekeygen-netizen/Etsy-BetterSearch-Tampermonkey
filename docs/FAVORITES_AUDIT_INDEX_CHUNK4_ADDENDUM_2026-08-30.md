# Favorites audit index — Chunk 4 addendum — 2026-08-30

This is a narrow continuation of `FAVORITES_AUDIT_INDEX_AND_NEXT_PHASES_2026-08-30.md`.

The canonical index remains unchanged. Read this addendum after its Chunk 3 sections.

Production baseline audited: BetterSearch v0.15.1, `main` at `966a8922f3eff3a15f91c2c7d5601f1b6358d869`.

## New Chunk 4 documents

### `FAVORITES_AUDIT_CHUNK4_2026-08-30.md`

High-level synthesis of the additional runtime-policy, metadata-context, worker-lifecycle and pager findings.

### `FAVORITES_CONFIG_AND_WORKER_POLICY_MULTITAB_AUDIT_2026-08-30.md`

Covers:

- raw extension storage mirror vs stale live `favCfg` / `favUiPrefs`;
- whole-object config lost updates across tabs;
- whole-object layout/UI preference lost updates;
- manual deep pause having stronger propagation than `autoScanMissingMetadata`;
- stale auto-sync/auto-scan policy in already-loaded tabs;
- live propagation and conflict-domain requirements.

### `FAVORITES_METADATA_CONTEXT_GENERATION_AUDIT_2026-08-30.md`

Covers:

- destination-sensitive auxiliary metadata request identity;
- post-await stale guard checking dataset but not destination context;
- out-of-order old-destination response overwriting newer context;
- response-time timestamps not being semantic generation order;
- stale live shipping values reaching filter/sort paths;
- clearer resolved/unresolved/pending coverage semantics;
- required metadata context generation token.

### `FAVORITES_DEEP_QUEUE_INTEREST_AND_BFCACHE_AUDIT_2026-08-30.md`

Covers:

- global listing metadata job identity vs owner/scope interest;
- queued job retirement after one owner's unfavorite;
- required interest-aware retirement after v3 owner-specific membership;
- running metadata write after interest changes;
- manual pause vs worker policy vs job contents separation;
- unconditional `pagehide` ended-worker hint;
- BFCache `event.persisted` lifecycle distinction;
- restored-page stale ownership checks.

### `FAVORITES_PAGER_SEMANTIC_ALIAS_AUDIT_2026-08-30.md`

End-to-end source proof of the v0.15.1 local/native pager alias:

- module 95 correctly excludes `[data-ebsf-local-pagination]` from native pager discovery;
- local pager intentionally retains Etsy's native aria-label;
- module 95a uses the aria-label without the ownership exclusion;
- local visible page can therefore become module-95a native page identity;
- local click is eligible for both local and native semantic handlers;
- existing test fixtures do not model hidden native + visible local pager simultaneously;
- bounded selector fix and dual-pager regression fixture.

## Priority amendments

The original P0 data-integrity order remains:

```text
stable owner identity
-> atomic mutable writes
-> v3 immutable catalogue generations
-> owner-specific membership
```

Add these constraints to that implementation:

### Data Release B

When owner-specific membership lands, update deep-job retirement in the same phase. One owner's unfavorite must not retire a global metadata job still needed by another active owner/scope generation.

### Small independent correctness patch

The module-95a pager marker exclusion is source-proven, bounded, and does not require waiting for the v3 migration. It may be fixed independently with the combined dual-pager fixture.

### Query/metadata generation phase

Treat metadata destination as a first-class generation alongside native query/catalogue generation. Dataset equality alone is not enough to authorize destination-sensitive response mutation.

### Runtime policy phase

Add live config/UI preference propagation and a conflict-safe save protocol before describing auto worker settings as cross-tab authoritative.

### Worker lifecycle phase

Treat `pagehide` ended-worker markers as optimization hints, not final authority. BFCache-persisted documents must not be declared permanently dead.

## Additional required combined tests

Append these to the main audit matrix:

```text
A config write + stale B config write on another field
A UI layout write + stale B preference write
autoScan disabled in B while A is already loaded
destination A request -> context B -> B response -> late A response
owner A unfavorite while owner B still requires listing metadata
pagehide persisted=true -> pageshow restore
hidden native pager page 1 + visible local pager page 2
local pager click -> nativePageIntent must remain unchanged
```

## Short implementation rule

Do not solve these by adding another late compatibility wrapper for each symptom.

Use the ownership boundaries already selected by the main audit:

```text
one semantic native-pager discovery contract
one live configuration propagation/mutation contract
one metadata context generation contract
one durable deep-job lease + interest contract
```

The visual Favorites UI remains frozen unless a behavior fix requires an invisible ownership marker/element-type change.