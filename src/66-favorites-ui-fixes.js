'use strict';

/*
 * Favorites layout / modal behavior fixes.
 *
 * This module intentionally loads after the main Favorites styles but before
 * the Favorites runtime starts. It keeps Etsy's native search form intact,
 * makes the BetterSearch controls occupy space to its left, prevents modal
 * scroll chaining into the page, and refreshes accordion disclosure from the
 * actual active filter values whenever the whole rail is shown again.
 */

function ebsfPrepareActiveSectionsForRailOpen() {
    favState.openSections = favActiveSectionKeys(favCfg);
    favState.openSectionsInitialized = true;
}

document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.ebsf-filter-button');
    if (!button || favState.filterOpen) return;
    ebsfPrepareActiveSectionsForRailOpen();
}, true);

function ebsfModalScrollContainer(target) {
    return target?.closest?.('.ebsf-settings-modal > .ebs-modal-editor, .ebs-settings-body, .ebs-modal-body, .ebsf-overlay-body') || null;
}

function ebsfHasOpenModalOrOverlay() {
    return Boolean(document.querySelector('.ebs-modal-layer, .ebsf-overlay'));
}

function ebsfCanConsumeWheel(scroller, deltaY) {
    if (!scroller || !deltaY) return Boolean(scroller);
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (max <= 1) return false;
    if (deltaY < 0) return scroller.scrollTop > 0;
    return scroller.scrollTop < max - 1;
}

document.addEventListener('wheel', (event) => {
    if (!ebsfHasOpenModalOrOverlay()) return;
    const scroller = ebsfModalScrollContainer(event.target);
    if (!ebsfCanConsumeWheel(scroller, event.deltaY)) event.preventDefault();
}, { capture: true, passive: false });

document.addEventListener('touchmove', (event) => {
    if (!ebsfHasOpenModalOrOverlay()) return;
    if (!ebsfModalScrollContainer(event.target)) event.preventDefault();
}, { capture: true, passive: false });

GM_addStyle(`
  /* Desktop: do not consume the native search field's width. The Etsy form
     keeps its own footprint/right edge and BetterSearch lives immediately to
     its left. */
  .ebsf-native-search-anchor {
    position: relative !important;
    display: block !important;
    width: auto !important;
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: visible !important;
  }
  .ebsf-native-search-anchor > .ebsf-search-left-controls {
    position: absolute !important;
    top: 50% !important;
    right: calc(100% + 10px) !important;
    transform: translateY(-50%) !important;
    display: flex !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    z-index: 6;
  }
  .ebsf-native-search-anchor > form,
  .ebsf-native-search-anchor form {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    flex: none !important;
  }

  /* Keep progress text on one row inside exactly the search-field footprint. */
  .ebsf-sync-progress-copy {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    min-width: 0 !important;
    gap: 10px !important;
  }
  .ebsf-sync-progress-copy strong {
    flex: 0 0 auto;
    white-space: nowrap !important;
  }
  .ebsf-sync-progress-copy span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap !important;
    text-align: right;
  }

  /* Settings is a fixed shell with one real internal scroll area. This keeps
     the footer reachable, exposes Deep metadata, and prevents wheel chaining
     into Etsy behind the dialog. */
  .ebsf-settings-layer {
    overflow: hidden !important;
    overscroll-behavior: none !important;
  }
  .ebsf-settings-modal {
    display: flex !important;
    flex-direction: column !important;
    max-height: calc(100dvh - 24px) !important;
    overflow: hidden !important;
  }
  .ebsf-settings-modal > .ebs-modal-header,
  .ebsf-settings-modal > .ebs-modal-footer {
    flex: 0 0 auto !important;
  }
  .ebsf-settings-modal > .ebs-modal-editor {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    scrollbar-gutter: stable;
  }
  .ebsf-settings-body {
    min-height: min-content;
  }
  .ebs-modal-editor,
  .ebs-settings-body,
  .ebs-modal-body,
  .ebsf-overlay-body {
    overscroll-behavior: contain !important;
  }

  /* At narrower desktop/tablet widths there is no safe empty space to the
     left, so keep all controls in one horizontal row and let only the native
     search field shrink. */
  @media (max-width: 1100px) {
    .ebsf-native-search-anchor {
      display: flex !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
      gap: 8px !important;
      width: 100% !important;
    }
    .ebsf-native-search-anchor > .ebsf-search-left-controls {
      position: static !important;
      transform: none !important;
      flex: 0 0 auto !important;
      z-index: auto;
    }
    .ebsf-native-search-anchor > form,
    .ebsf-native-search-anchor form {
      flex: 1 1 auto !important;
      width: auto !important;
      min-width: 150px !important;
    }
  }

  /* Truly small screens may wrap the native field beneath the controls; this
     is preferable to clipping controls or pushing the form beyond the page. */
  @media (max-width: 620px) {
    .ebsf-native-search-anchor {
      flex-wrap: wrap !important;
    }
    .ebsf-native-search-anchor > .ebsf-search-left-controls {
      width: 100%;
      max-width: 100%;
    }
    .ebsf-native-search-anchor > form,
    .ebsf-native-search-anchor form {
      flex: 1 1 100% !important;
      min-width: 0 !important;
    }
  }
`);
