'use strict';

GM_addStyle(`
  .ebsf-native-favorites-source{display:none!important}
  [data-testid="sidebar"].ebsf-sidebar-permanent{overflow:visible!important}
  [data-testid="sidebar"].ebsf-sidebar-permanent>:not(.ebsf-native-favorites-source):not([data-ebsf-rail]){display:none!important}
  .ebsf-sidebar-permanent>.ebsf-rail{display:block!important}
  .ebsf-filter-heading{margin:0;border:0;background:transparent;color:inherit;font:inherit;font-size:18px;font-weight:600}
  .ebsf-collection-strip{display:flex;align-items:center;gap:8px;width:100%;min-width:0;margin:0 0 12px;color:var(--ebsf-control-color,currentColor);font-family:var(--ebsf-control-font,inherit);font-size:var(--ebsf-control-size,13px)}
  .ebsf-collection-fixed{display:flex;align-items:center;gap:6px;flex:0 0 auto}
  .ebsf-collection-scroll{display:flex;align-items:center;gap:7px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x;padding:2px;cursor:grab;overscroll-behavior-inline:contain}
  .ebsf-collection-scroll::-webkit-scrollbar{display:none}
  .ebsf-collection-scroll.is-dragging{cursor:grabbing;user-select:none}
  .ebsf-collection-pill,.ebsf-collection-add{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;min-height:38px;padding:0 14px;border:1px solid var(--ebsf-control-border,#8d8d8d);border-radius:999px;background:var(--ebsf-control-bg,transparent);color:var(--ebsf-control-color,currentColor);font:600 var(--ebsf-control-size,13px)/1.2 var(--ebsf-control-font,inherit);text-decoration:none;white-space:nowrap;cursor:pointer}
  .ebsf-collection-add{width:38px;padding:0}
  .ebsf-collection-pill:hover,.ebsf-collection-add:hover{box-shadow:0 1px 4px rgba(0,0,0,.18)}
  .ebsf-collection-pill.is-active{box-shadow:inset 0 0 0 1px var(--ebsf-control-color,currentColor);background:color-mix(in srgb,var(--ebsf-control-color,currentColor) 8%,var(--ebsf-control-bg,transparent))}
  .ebsf-collection-pill .etsy-icon,.ebsf-collection-add .etsy-icon{width:18px;height:18px}
  .ebsf-scope-header{display:grid;grid-template-columns:minmax(180px,1fr) minmax(0,auto);gap:18px;align-items:end;width:100%;min-width:0;margin:0 0 14px}
  .ebsf-scope-copy{min-width:0}.ebsf-scope-copy h2,.ebsf-scope-copy p{margin:0}.ebsf-scope-copy p{margin-top:6px;white-space:normal}
  .ebsf-scope-controls{min-width:0;max-width:100%;justify-self:end}.ebsf-scope-controls .ebsf-toolbar-row{width:auto!important;max-width:100%!important;min-width:0!important;margin-left:0!important;justify-content:flex-end!important;flex-wrap:nowrap!important}
  .ebsf-scope-controls .ebsf-search-left-controls{min-width:0!important;flex:0 1 auto!important}.ebsf-scope-controls .ebsf-sort{min-width:0!important;max-width:220px!important}.ebsf-scope-controls .ebsf-sort>button{min-width:0!important;max-width:220px!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ebsf-sidebar-permanent~* .ebsf-toolbar-preserve-search,.ebsf-sidebar-permanent~* .ebsf-toolbar-compact{width:auto!important;max-width:100%!important;margin-left:0!important;justify-content:flex-end!important}
  .ebsf-sidebar-permanent~* .ebsf-native-search-slot,.ebsf-scope-header .ebsf-scope-controls .ebsf-toolbar-row .ebsf-native-search-slot{width:clamp(180px,26vw,380px)!important;max-width:380px!important;min-width:180px!important;flex:0 1 380px!important}
  .ebsf-scope-header .ebsf-scope-controls .ebsf-native-search-slot>form,.ebsf-scope-header .ebsf-scope-controls .ebsf-native-search-slot>.wt-input-btn-group{width:100%!important;max-width:380px!important}
  .ebsf-sidebar-permanent~* .ebsf-native-search-slot .ebsf-sync-progress{inset:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}
  .ebsf-sidebar-permanent~* .ebsf-native-search-slot .ebsf-sync-progress-copy{min-width:0!important;overflow:hidden!important}.ebsf-sidebar-permanent~* .ebsf-native-search-slot .ebsf-sync-progress-copy span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ebsf-filter-button,.ebsf-settings-button,.ebsf-sort>button{border-color:var(--ebsf-control-border,#8d8d8d)!important;background:var(--ebsf-control-bg,transparent)!important;color:var(--ebsf-control-color,currentColor)!important;font-family:var(--ebsf-control-font,inherit)!important}
  .ebsf-v2-drawer-body{gap:9px}.ebsf-v2-option{display:grid;gap:6px}.ebsf-v2-option[hidden]{display:none!important}.ebsf-v2-option>.ebsf-native-group{padding:0}
  .ebsf-shops-link{display:flex!important;align-items:center;gap:7px;margin-top:18px;padding:9px 4px!important;border-top:1px solid #dedede;text-decoration:none;color:inherit}
  .ebsf-shops-link .etsy-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;align-self:center!important;position:static!important;top:auto!important;transform:none!important;vertical-align:middle!important;width:22px!important;height:22px!important;flex:0 0 22px!important;margin:0!important;padding:0!important;line-height:1!important}.ebsf-shops-link .etsy-icon svg{display:block!important;width:22px!important;height:22px!important;margin:0!important}.ebsf-shops-link>span:last-child{display:inline-flex;align-items:center;min-height:22px;line-height:22px}
  .ebsf-empty{grid-column:1/-1!important;list-style:none;display:flex!important;align-items:center;justify-content:center;min-height:240px;width:100%;padding:24px;text-align:center}
  .ebsf-results-loading{list-style:none;display:flex;align-items:center;justify-content:center;width:min(230px,100%);min-height:150px;margin:8px 0;padding:24px;border:1px solid #dedede;border-radius:12px;background:var(--ebsf-control-bg,transparent);font-weight:600}
  .ebsf-layout-row{grid-template-columns:22px 24px minmax(0,1fr) 42px!important}
  .ebsf-layout-label{display:flex;align-items:center;justify-content:space-between;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  button.ebsf-layout-label{width:100%;cursor:pointer!important}
  .ebsf-layout-label>.ebsf-layout-disclosure{display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px}
  .ebsf-layout-label[aria-expanded="true"]>.ebsf-layout-disclosure .ebsf-chevron{transform:rotate(180deg)}
  .ebsf-layout-more{border:0;border-radius:8px;background:transparent;cursor:pointer;min-height:30px}.ebsf-layout-more:hover{background:#ece9e5}
  .ebsf-layout-row.is-drop-before{box-shadow:inset 0 3px 0 #222!important}.ebsf-layout-row.is-drop-after{box-shadow:inset 0 -3px 0 #222!important}
  .ebsf-layout-group.is-drop-inside{outline:2px solid #222;outline-offset:-2px;border-radius:10px;background:#f7f6f4}
  .ebsf-layout-ghost{position:fixed;left:-10000px;top:-10000px;width:420px;z-index:-1;opacity:.82;box-shadow:0 8px 24px rgba(0,0,0,.22);pointer-events:none}
  .ebsf-layout-add-country{display:block;width:calc(100% - 52px);margin:5px 0 10px 52px;padding:9px 12px;border:1px dashed #aaa;border-radius:9px;background:#faf9f7;color:#333;text-align:left;cursor:pointer}.ebsf-layout-add-country:hover{border-color:#555;background:#f3f1ee}
  .ebsf-layout-context button.is-danger{color:#a61b1b}
  .ebsf-layout-context{z-index:2147483647!important}
  .ebsf-rename-modal{width:min(430px,calc(100vw - 24px))}.ebsf-rename-body{padding:20px}.ebsf-rename-body label{display:grid;gap:8px;font-weight:600}
  .ebsf-confirm-modal,.ebsf-country-option-modal{width:min(450px,calc(100vw - 24px))!important}.ebsf-confirm-body,.ebsf-country-option-body{padding:20px}.ebsf-confirm-body p{margin:0;line-height:1.5}.ebsf-country-option-body{display:grid;gap:8px}.ebsf-country-option-body label{font-weight:600}
  .ebsf-confirm-layer,.ebsf-country-option-layer,.ebsf-rename-layer{z-index:2147483647!important}
  @media(min-width:900px){[data-testid="sidebar"].ebsf-sidebar-permanent{display:block!important}.ebsf-filter-button[aria-hidden="true"]{display:none!important}}
  @media(min-width:900px) and (max-width:1200px){
    .ebsf-scope-header{grid-template-columns:minmax(0,1fr);align-items:start;gap:10px}
    .ebsf-scope-controls{grid-column:1;width:min(100%,640px);justify-self:end}
    .ebsf-scope-controls .ebsf-toolbar-row{width:100%!important}
    .ebsf-scope-controls .ebsf-native-search-slot{flex:1 1 220px!important;width:auto!important;max-width:380px!important;min-width:180px!important}
  }
  @media(max-width:899px){
    [data-testid="sidebar"].ebsf-sidebar-permanent{display:none!important}
    .ebsf-collection-strip{margin-top:8px}.ebsf-scope-header{grid-template-columns:1fr}.ebsf-scope-controls{width:100%;justify-self:stretch}
    .ebsf-filter-button[aria-hidden="false"]{display:inline-flex!important}
  }
  @media(max-width:560px){.ebsf-collection-pill{padding-inline:11px;min-height:36px}.ebsf-collection-add{width:36px;min-height:36px}.ebsf-collection-strip{gap:6px}}
`);
