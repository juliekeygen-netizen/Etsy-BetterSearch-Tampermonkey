# Favorites post-v0.15.25 runtime reconciliation — 2026-09-01

Status: current-source reconciliation from production baseline v0.15.25,
`main` `4d0e0317d58711a5e1603ae8d2bf608c3f285c3b`. This is a sanitized source,
test, branch, and built-artifact audit; it contains no Etsy account, query,
listing, or Diagnostics-capture data.

## Method

The review read the current project/handoff/active-work records, the historical
audit index and continuation, the architecture plan, v0.15.19–v0.15.23 release
records, the v0.15.24 metadata and v0.15.25 local-card audits, ordered
userscript/build inputs, current source, regression tests, open PRs, and their
CI state. Historical findings were not treated as current without tracing their
final assignment in the v0.15.25 chain.

The current production userscript order is material. In particular it loads
the v0.15.19/20/22 storage chain around modules 61eb/61ea/61ec, v0.15.18
cross-tab configuration module 66a, v0.15.23 native-query acknowledgement
99a, v0.15.25 heart confirmation 107, then final count/render/metadata
boundaries 104/105/106. Chrome and Firefox bundle this same order from the
userscript; Diagnostics is a separate observational build and does not bundle
the shared production Favorites chain.

## Reconciled findings

| Area | Current final owner / evidence | Status | Next boundary |
| --- | --- | --- | --- |
| Owner/count identity separation | Owner extraction is separate from count evidence; final count model is `favScopeCounts0120` in modules 104 then 105. | CLOSED | Keep final-owner regression coverage. |
| Complete membership generations | `61ea-favorites-immutable-snapshots.js` preserves complete snapshots until a verified replacement transaction commits. | CLOSED | No duplicate snapshot work. |
| Mutable IndexedDB rows | 61ab primitive plus final integration module 74a read and merge current rows in one `readwrite` transaction. | CLOSED | Keep interleaving tests. |
| Multi-owner membership | 61eb owns exact owner/scope membership; 61ha reasserts owner-aware maintenance after 61h. | CLOSED | No global `isFavorite` authority revival. |
| Catalogue coordination/fencing | 61ec replaces executable localStorage election fallback with canonical-scope IndexedDB lease/fence checks. | CLOSED | Do not add another coordinator. |
| Native query acknowledgement | 99a captures exact submissions and accepts only current exact route/SSR/resource evidence. | CLOSED | Preserve changed-but-unverified fail-closed behavior. |
| Destination-sensitive metadata | 106 carries a destination context generation through fetch, live application, IndexedDB hydration, coverage, and render currentness. | CLOSED | Keep v0.15.24 races. |
| Deep queue page-death/BFCache recovery | 83 supplies durable manual pause, ended-worker recovery, lease-expiry retry, and pageshow resume; lease/CAS remains in 75. | CLOSED BY CURRENT PLAN | Do not reimplement from historical audit alone. |
| Native/local heart confirmation | 107 fences module63's old fixed-delay writers with current-card reacquisition, stable evidence, and scope/view/action generations. | CLOSED | PR #67 is a separate local-card behavior gate. |
| Count presentation | 104 chooses native evidence before non-authoritative dataset evidence; 105 permits filtered `shown` only for signed local-render authority. | CLOSED | The old `fix/favorites-count-authority-fail-closed` branch is stale (head `a55972c`, based before current v0.15.x work) and is not active. |
| Collection lifecycle | Current main still has the historical collection model; PR #71 adds the owner/route/create-generation boundary. | IN-FLIGHT PR #71 | Review, do not duplicate. |
| IndexedDB schema-upgrade cooperation | Current main lacked cooperative `versionchange` close/invalidation; PR #72 supplies it. | IN-FLIGHT PR #72 | Review, do not duplicate. |
| Cross-tab settings/policy | 66a plus the extension prelude and userscript value-change listener provide canonical-leaf merge and in-place peer updates. Module83 dynamically reads durable manual pause before claims. | CLOSED | Browser-check delivery parity rather than reimplementing old stale-object audit. |
| Duplicate production delivery runtimes | No shared DOM-visible owner marker existed in `src/`, `extension/`, or the userscript; separate isolated worlds could each start observers, UI, and queue work. | LIVE, SOURCE-PROVEN | This behavior gate adds the narrow Favorites runtime-owner boundary. |
| Filter availability ownership | Final category availability has targeted guards in 102/103/104, but historical legacy/v2 layering remains. No current incorrect outcome was proven by source alone. | NEEDS BROWSER/PROFILING | Gather bounded mutation/availability evidence before a consolidation. |
| Shell/lifecycle wrapper stack | Multiple historical wrappers remain, but final ownership guards reduce several historical no-op paths. | NEEDS BROWSER/PROFILING | Select one measured hot path; do not rewrite broadly. |
| Accessibility/focus lifecycle | Historical concerns are useful test targets, but current final behavior requires real Etsy responsive/focus evidence. | NEEDS BROWSER | Run the existing focused matrix before a UI change. |
| Delivery-target final-owner parity | Userscript order is the Chrome/Firefox build input; Diagnostics is deliberately separate. | PARTIALLY CLOSED | Retain built-artifact checks for fragile final symbols. |

## Open-branch reconciliation

The live GitHub queue was re-read rather than trusting the older `ACTIVE_WORK.md`
snapshot. All five implementation PRs below target `main`, are intentionally
unmerged, and had green CI at audit time:

| PR | Branch / head | Scope | CI run |
| --- | --- | --- | --- |
| #67 | `fix/favorites-v01526-local-card-action-boundary` / `739d5be76dbc29cd8b376b44fba17f9987feb6bc` | local-card Favorite boundary | `33438714693` success |
| #68 | `fix/favorites-v01526-focused-rail-refresh` / `666680fd010114ee150d9013facf881b7acc4da1` | focused rail refresh | `33438909512` success |
| #69 | `fix/favorites-v01526-sort-portal-lifetime` / `6e108b3d905e88c21421cd17d6d11f01d41b9028` | Sort portal lifetime | `33512954260` success |
| #71 | `fix/favorites-collection-lifecycle-generation` / `4c6d84f2b0f5a722922174c41b53b791a7757bc3` | collection owner/operation generation | `33493124151` success |
| #72 | `fix/favorites-db-versionchange-cooperation` / `f023130db25678688b1a6d6ef6076e28537c816a` | cooperative IndexedDB upgrades | `33494033472` success |

PRs #67–#69 must be integrated only by a later coordinated release branch
after independent approval. PRs #71 and #72 are independent from those three
and from the runtime-owner boundary.

## Selected live issue: duplicate Favorites owners

Tampermonkey and browser content scripts have separate JavaScript globals, so
per-runtime flags such as `favState.runtimeObserverBound0121` cannot coordinate
them. Before this gate, neither `src/`, `extension/`, nor the userscript
declared a common DOM owner. Both delivery targets could therefore operate the
same page's Favorites UI and durable work concurrently.

The chosen narrow owner is a document-element marker installed immediately
after Favorites state and before all Favorites identity/data/runtime modules.
The first production runtime marks the document; a later copy in another
isolated world sets `favFavoritesRuntimeActive01527=false`. The existing
`isFavoritesPage()` entry point then prevents scheduled Favorites shell and
catalogue startup. Explicit guards also prevent the lone transplanted-card
capture handler and module83's background deep-queue resume/pagehide paths
from acting in the inactive copy.

This is deliberately Favorites-scoped. It does not invent shared configuration
storage, alter owner/membership/index semantics, or interfere with the
Diagnostics extension. It is document-lifetime-only: normal navigation creates
a new document and therefore a fresh first-owner election.

## Required manual validation after CI

In a disposable browser profile, enable the production extension and
Tampermonkey userscript together, then open own Favorites All and a collection.
Verify exactly one rail/toolbar/grid controller appears, only one warning is
emitted by the losing delivery, no duplicate deep queue runner begins, and the
same result holds after Etsy soft navigation and BFCache Back/Forward. Repeat
with each delivery target individually to confirm its normal Favorites
experience is unchanged. Keep Diagnostics enabled separately to confirm it
remains observational.
