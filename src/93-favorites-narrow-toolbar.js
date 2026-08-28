'use strict';

/* v0.12.5 narrow/tablet toolbar polish.
 *
 * Once the Favorites header collapses to stacked copy + controls, the controls
 * row should own the full content width instead of staying visually anchored to
 * the old right-hand desktop column. Search gets the flexible remainder while
 * Filters, Sort and Settings keep compact bounded widths.
 */

GM_addStyle(`
  @media(max-width:760px){
    .ebsf-scope-header{
      grid-template-columns:minmax(0,1fr)!important;
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-copy{
      grid-column:1!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
    }
    .ebsf-scope-controls{
      grid-column:1 / -1!important;
      justify-self:stretch!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
    }
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:grid!important;
      grid-template-columns:auto minmax(72px,.75fr) 40px minmax(120px,1.75fr)!important;
      align-items:center!important;
      justify-content:stretch!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
      transform:none!important;
      gap:6px!important;
    }

    /* Flatten the legacy left-controls wrapper so Filters and Sort can occupy
     * their own grid columns while Search is free to use the remaining width. */
    .ebsf-scope-header .ebsf-search-left-controls{
      display:contents!important;
    }
    .ebsf-scope-header .ebsf-filter-button{
      grid-column:1!important;
      width:auto!important;
      min-width:0!important;
      max-width:112px!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-sort{
      grid-column:2!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-sort>button{
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
    }
    .ebsf-scope-header .ebsf-settings-button{
      grid-column:3!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      grid-column:4!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      margin:0!important;
      justify-self:stretch!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot>form,
    .ebsf-scope-header .ebsf-native-search-slot>.wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot form,
    .ebsf-scope-header .ebsf-native-search-slot .wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot input{
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
  }

  @media(max-width:520px){
    .ebsf-scope-controls .ebsf-toolbar-row{
      grid-template-columns:40px minmax(64px,.65fr) 40px minmax(96px,1.85fr)!important;
      gap:5px!important;
    }
    .ebsf-scope-header .ebsf-filter-button{
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-scope-header .ebsf-filter-button [data-ebsf-filter-label]{
      display:none!important;
    }
  }
`);
