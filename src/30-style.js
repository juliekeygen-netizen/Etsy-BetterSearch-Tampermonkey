'use strict';
GM_addStyle(`
    #ebs-controls { display:inline-flex; align-items:center; gap:6px; flex:0 0 auto; height:100%; margin-right:6px; white-space:nowrap; }
    #ebs-controls button, .ebs-modal button, .ebs-modal select, .ebs-modal input { font-family:inherit; }
    .ebs-split { display:inline-flex; height:36px; overflow:hidden; border-radius:999px; background:#f5f5f1; color:#222; }
    .ebs-split.ebs-active { background:#222; color:#fff; }
    .ebs-main,.ebs-caret,.ebs-pill { appearance:none; min-height:36px; margin:0; border:0; font-size:13px; font-weight:500; line-height:1; white-space:nowrap; cursor:pointer; }
    .ebs-main { padding:0 10px 0 12px; background:transparent; color:inherit; }
    .ebs-caret { width:30px; padding:0; border-left:1px solid rgba(34,34,34,.14); background:transparent; color:inherit; }
    .ebs-split.ebs-active .ebs-caret { border-left-color:rgba(255,255,255,.28); }
    .ebs-pill { padding:0 12px; border-radius:999px; background:#f5f5f1; color:#222; }
    .ebs-pill.ebs-active { background:#222; color:#fff; }
    .ebs-main:hover,.ebs-caret:hover,.ebs-pill:hover { filter:brightness(.96); }
    .ebs-strict-popup { position:fixed; z-index:100002; width:218px; box-sizing:border-box; padding:14px; border:1px solid rgba(34,34,34,.14); border-radius:12px; background:#fff; color:#222; box-shadow:0 6px 24px rgba(34,34,34,.16); font:14px/1.35 inherit; }
    .ebs-popup-title { margin:0 0 9px; font-weight:600; }
    .ebs-option { display:flex; align-items:center; gap:8px; min-height:30px; cursor:pointer; user-select:none; }
    .ebs-option input { width:16px; height:16px; margin:0; accent-color:#222; }
    .ebs-popup-note { margin:9px 0 0; color:#707070; font-size:12px; line-height:1.4; }
    .ebs-result-text { white-space:nowrap; }
    .ebs-empty { width:100%!important; max-width:none!important; flex-basis:100%!important; padding:30px 0 40px!important; text-align:center; color:#595959; list-style:none; }
    body.ebs-results-active [data-appears-component-name="search_pagination"], body.ebs-results-active [data-no-results] { display:none!important; }
    .ebs-favorite-frame { position:fixed!important; left:-10000px!important; top:-10000px!important; width:2px!important; height:2px!important; opacity:.001!important; pointer-events:none!important; border:0!important; }
    .ebs-favorite-working { opacity:.55!important; cursor:progress!important; }
    .ebs-favorited svg { color:#a61a2d!important; fill:#a61a2d!important; }
    .ebs-favorited svg path { fill:currentColor!important; }

    .ebs-scan-panel { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; width:100%; min-height:min(52vh,560px); box-sizing:border-box; padding:52px 18px 64px; color:#222; text-align:center; }
    .ebs-scan-spinner { width:30px; height:30px; box-sizing:border-box; border:3px solid #deded8; border-top-color:#222; border-radius:50%; animation:ebs-spin .8s linear infinite; }
    .ebs-scan-copy { display:grid; justify-items:center; gap:5px; }
    .ebs-scan-copy strong { font-size:16px; line-height:1.25; font-weight:600; }
    .ebs-scan-copy span { color:#6f6f6f; font-size:12px; line-height:1.4; }
    body.ebs-scan-active [data-search-results-region] [data-results-grid-container],
    body.ebs-scan-active [data-appears-component-name="search_pagination"],
    body.ebs-scan-active [data-no-results] { display:none!important; }
    @keyframes ebs-spin { to { transform:rotate(360deg); } }
    @media (prefers-reduced-motion:reduce) { .ebs-scan-spinner { animation:none; border-top-color:#777; } }

    .ebs-modal-layer { position:fixed; inset:0; z-index:100000; display:grid; place-items:center; padding:clamp(10px,2vw,24px); background:rgba(34,34,34,.48); box-sizing:border-box; }
    html.ebs-page-scroll-locked, body.ebs-page-scroll-locked { overflow:hidden!important; overscroll-behavior:none!important; }
    .ebs-modal { display:flex; flex-direction:column; width:min(1092px,calc(100vw - clamp(20px,4vw,48px))); max-width:1092px; max-height:calc(100vh - clamp(20px,4vw,48px)); overflow:hidden; border:1px solid #d8d8d2; border-radius:12px; background:#fffdf9; color:#222; box-shadow:0 18px 60px rgba(0,0,0,.22); }
    .ebs-modal-header { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:8px 24px; padding:18px 20px 12px; border-bottom:1px solid #deded8; }
    .ebs-modal-title { margin:0; padding:0; font-size:18px; font-weight:700; letter-spacing:.015em; }
    .ebs-modal-meta { display:grid; justify-items:end; gap:2px; color:#767676; font-size:10px; }
    .ebs-modal-meta p { margin:0; }
    .ebs-modal-editor { min-height:0; display:flex; flex:1; flex-direction:column; overflow:hidden; }
    .ebs-modal-body { --ebs-cols:28px 24px 96px minmax(130px,145px) 106px minmax(150px,170px) minmax(220px,1fr) 30px; display:grid; gap:8px; min-height:0; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; padding:12px 18px 18px; scrollbar-color:#b9b9b3 #f2f1ed; scrollbar-width:thin; }
    .ebs-columns,.ebs-rule-primary,.ebs-rule-secondary { display:grid; grid-template-columns:var(--ebs-cols); align-items:center; gap:8px; min-width:0; }
    .ebs-columns { min-height:22px; padding:0 9px; color:#777; font-size:9px; letter-spacing:.035em; }
    .ebs-columns .is-logic { grid-column:3; } .ebs-columns .is-field { grid-column:4; } .ebs-columns .is-polarity { grid-column:5; white-space:nowrap; } .ebs-columns .is-condition { grid-column:6; }
    .ebs-rule { position:relative; min-width:0; display:block; padding:7px 8px; border:1px solid #deded8; border-radius:8px; background:#f7f6f2; }
    .ebs-rule.is-invalid { border-color:#b3261e; }
    .ebs-rule-primary > * { min-width:0; }
    .ebs-drag { grid-column:1; } .ebs-check-wrap { grid-column:2; } .ebs-logic { grid-column:3; } .ebs-field { grid-column:4; } .ebs-polarity { grid-column:5; } .ebs-condition { grid-column:6; } .ebs-value { grid-column:7; } .ebs-menu-toggle { grid-column:8; }
    .ebs-select,.ebs-input { width:100%; min-width:0; box-sizing:border-box; min-height:34px; border:1px solid #cfcfc8; border-radius:8px; background:#fff; color:#222; font-size:12px; outline:none; }
    .ebs-select { padding:0 29px 0 10px; cursor:pointer; }
    .ebs-input { padding:0 10px; }
    .ebs-select:hover,.ebs-input:hover { border-color:#a9a9a2; }
    .ebs-select:focus,.ebs-input:focus { border-color:#222; box-shadow:0 0 0 1px #222; }
    .ebs-select:disabled { color:#777; cursor:default; background:#efeee9; }
    .ebs-logic .ebs-select { min-width:96px; }
    .ebs-polarity .ebs-select { min-width:100px; font-size:11px; }
    .ebs-drag,.ebs-menu-toggle { display:inline-flex; align-items:center; justify-content:center; width:28px; min-width:28px; min-height:28px; padding:0; border:0; border-radius:6px; background:transparent; color:#777; line-height:1; }
    .ebs-drag { cursor:grab; font-size:16px; touch-action:none; } .ebs-drag:active,.ebs-drag.is-dragging { cursor:grabbing; }
    .ebs-menu-toggle { cursor:pointer; font-size:15px; } .ebs-menu-toggle:hover,.ebs-menu-toggle:focus-visible { background:#ecebe6; }
    .ebs-check-wrap { display:inline-flex; align-items:center; justify-content:center; width:24px; min-height:28px; }
    .ebs-check { appearance:none; width:15px; height:15px; margin:0; border:1px solid #888; border-radius:4px; background:#fff; cursor:pointer; }
    .ebs-check:checked { border-color:#222; background:#222 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='m3.5 8 3 3 6-7'/%3E%3C/svg%3E") center/13px no-repeat; }
    .ebs-check:focus-visible { outline:2px solid rgba(34,34,34,.3); outline-offset:2px; }
    .ebs-rule-secondary { margin-top:6px; padding:0 0 1px; }
    .ebs-text-options { grid-column:7; display:grid; grid-template-columns:repeat(3,max-content); align-items:center; justify-content:start; gap:8px 14px; min-width:0; }
    .ebs-check-label { display:inline-flex; align-items:center; gap:6px; color:#5c5c5c; font-size:10px; white-space:nowrap; cursor:pointer; }
    .ebs-rule-error { margin:6px 38px 0 288px; color:#b3261e; font-size:10px; }
    .ebs-rule.is-drop-before::before,.ebs-rule.is-drop-after::after { content:""; position:absolute; left:4px; right:4px; height:2px; border-radius:2px; background:#222; }
    .ebs-rule.is-drop-before::before { top:-5px; } .ebs-rule.is-drop-after::after { bottom:-5px; }
    .ebs-actions { display:flex; gap:9px; margin-top:5px; }
    .ebs-button { appearance:none; min-height:32px; padding:0 20px; border:1px solid transparent; border-radius:8px; background:#e9e9e4; color:#222; font-size:12px; font-weight:600; cursor:pointer; }
    .ebs-button:hover { background:#dfdfd9; } .ebs-button.is-quiet { border-color:#d3d3cd; background:transparent; } .ebs-button.is-primary { background:#222; color:#fff; } .ebs-button.is-primary:hover { background:#3b3b3b; }
    .ebs-preview { margin:4px 0 8px; color:#686868; font-size:10px; }
    .ebs-preview summary { width:max-content; max-width:100%; cursor:pointer; list-style-position:inside; }
    .ebs-preview pre { margin:9px 0 0 18px; white-space:pre-wrap; color:#444; font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
    .ebs-modal-footer { display:flex; align-items:center; gap:8px; flex:0 0 auto; padding:11px 20px; border-top:1px solid #deded8; background:#fffdf9; }
    .ebs-draft-note { margin-right:auto; color:#777; font-size:10px; }
    .ebs-row-menu { position:fixed; z-index:100004; display:grid; width:164px; gap:2px; padding:5px; border:1px solid #d4d4ce; border-radius:9px; background:#fff; box-shadow:0 8px 24px rgba(0,0,0,.16); }
    .ebs-row-menu button { appearance:none; width:100%; min-height:31px; padding:0 9px; border:0; border-radius:6px; background:transparent; color:#222; text-align:left; font-size:12px; cursor:pointer; }
    .ebs-row-menu button:hover:not(:disabled),.ebs-row-menu button:focus-visible { background:#efeee9; } .ebs-row-menu button:disabled { opacity:.4; cursor:default; } .ebs-row-menu button.is-danger { color:#b3261e; }

    @media (max-width:899px) {
        #ebs-controls { gap:4px; margin-right:4px; } .ebs-main,.ebs-caret,.ebs-pill { font-size:12px; } .ebs-main,.ebs-pill { padding-left:9px; padding-right:9px; }
    }
    @media (max-width:760px) {
        .ebs-scan-panel { min-height:48dvh; padding:38px 14px 48px; }
        .ebs-scan-copy strong { font-size:15px; }
        .ebs-modal-layer { place-items:center!important; padding:6px!important; }
        .ebs-modal { align-self:center; justify-self:center; width:calc(100vw - 12px); height:auto!important; max-height:calc(100dvh - 12px)!important; }
        .ebs-modal-header { grid-template-columns:minmax(0,1fr) auto; gap:6px 10px; padding:13px 11px 9px; }
        .ebs-modal-title { font-size:16px; }
        .ebs-modal-editor { min-height:0; max-height:calc(100dvh - 145px); overflow:hidden!important; }
        .ebs-modal-body { flex:1 1 auto; min-height:0; max-height:calc(100dvh - 145px); overflow-x:hidden; overflow-y:auto!important; padding:9px 8px 12px; }
        .ebs-columns { display:none; }
        .ebs-rule-primary { grid-template-columns:22px 22px minmax(68px,84px) minmax(0,1fr) 30px!important; grid-template-areas:"drag check logic field menu" "polarity polarity polarity polarity polarity" "condition condition condition condition condition" "value value value value value"!important; column-gap:7px; row-gap:7px; }
        .ebs-rule .ebs-drag { grid-area:drag!important; } .ebs-rule .ebs-check-wrap { grid-area:check!important; } .ebs-rule .ebs-logic { grid-area:logic!important; } .ebs-rule .ebs-field { grid-area:field!important; } .ebs-rule .ebs-menu-toggle { grid-area:menu!important; } .ebs-rule .ebs-polarity { grid-area:polarity!important; margin-top:1px; } .ebs-rule .ebs-condition { grid-area:condition!important; } .ebs-rule .ebs-value { grid-area:value!important; grid-column:auto!important; }
        .ebs-rule .ebs-polarity >*,.ebs-rule .ebs-condition >*,.ebs-rule .ebs-value >* { width:100%; min-width:0!important; max-width:100%; }
        .ebs-logic .ebs-select,.ebs-polarity .ebs-select { min-width:0!important; }
        .ebs-rule-secondary { display:block!important; padding-left:0!important; margin-top:7px; }
        .ebs-rule-secondary .ebs-text-options { width:100%; grid-template-columns:repeat(2,minmax(0,1fr))!important; }
        .ebs-rule-error { margin:7px 0 0!important; }
        .ebs-actions { position:static!important; display:grid; grid-template-columns:1fr; width:100%; margin-top:4px; }
        .ebs-actions .ebs-button { width:100%; min-width:0; }
        .ebs-modal-footer { flex-wrap:wrap; gap:8px; padding:9px 10px max(9px,env(safe-area-inset-bottom)); }
        .ebs-draft-note { flex:1 1 100%; }
    }
    @media (max-width:380px) {
        .ebs-rule-primary { grid-template-columns:20px 20px minmax(62px,76px) minmax(0,1fr) 28px!important; }
        .ebs-modal-meta { font-size:9px; }
    }
`);
