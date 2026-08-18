'use strict';
GM_addStyle(`
  .ebs-gear { appearance:none; display:inline-flex; align-items:center; justify-content:center; flex:0 0 36px; width:36px; height:36px; margin:0; padding:0; border:0; border-radius:999px; background:#f5f5f1; color:#222; cursor:pointer; }
  .ebs-gear:hover,.ebs-gear:focus-visible { background:#ecebe6; }
  .ebs-gear:focus-visible { outline:2px solid rgba(34,34,34,.28); outline-offset:2px; }
  .ebs-gear svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }

  .ebs-scan-settings-modal { width:min(840px,calc(100vw - clamp(20px,4vw,48px))); max-width:840px; }
  .ebs-settings-body { min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:16px 18px 20px; scrollbar-color:#b9b9b3 #f2f1ed; scrollbar-width:thin; }
  .ebs-settings-intro { display:grid; gap:12px; }
  .ebs-settings-kicker { margin:0; color:#777; font-size:10px; letter-spacing:.045em; text-transform:uppercase; }
  .ebs-preset-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
  .ebs-preset { appearance:none; min-width:0; min-height:42px; padding:0 12px; border:1px solid #d2d2cc; border-radius:9px; background:#f7f6f2; color:#222; font:600 12px/1 inherit; cursor:pointer; }
  .ebs-preset:hover { border-color:#aaa; background:#efeee9; }
  .ebs-preset.is-active { border-color:#222; background:#222; color:#fff; }
  .ebs-preset-detail { display:grid; gap:4px; min-height:56px; padding:11px 13px; border:1px solid #dfdfd9; border-radius:9px; background:#faf9f5; }
  .ebs-preset-detail strong { font-size:12px; }
  .ebs-preset-detail span { color:#666; font-size:11px; line-height:1.42; }
  .ebs-preset-summary { color:#777!important; font-size:10px!important; }

  .ebs-custom-settings { display:grid; gap:14px; margin-top:16px; }
  .ebs-settings-section { overflow:hidden; border:1px solid #deded8; border-radius:10px; background:#fff; }
  .ebs-settings-section-header { padding:11px 13px 9px; border-bottom:1px solid #e6e5df; background:#f7f6f2; }
  .ebs-settings-section-header h3 { margin:0; font-size:11px; letter-spacing:.035em; }
  .ebs-settings-section-header p { margin:3px 0 0; color:#777; font-size:10px; line-height:1.4; }
  .ebs-setting-row { display:grid; grid-template-columns:minmax(180px,1fr) minmax(180px,240px); gap:14px 24px; align-items:center; padding:11px 13px; border-top:1px solid #eeeeea; }
  .ebs-setting-row:first-of-type { border-top:0; }
  .ebs-setting-copy { min-width:0; }
  .ebs-setting-label { display:block; margin:0; color:#222; font-size:12px; font-weight:600; }
  .ebs-setting-help { display:block; margin-top:3px; color:#777; font-size:10px; line-height:1.42; }
  .ebs-setting-help strong { color:#555; font-weight:600; }
  .ebs-setting-control { min-width:0; }
  .ebs-setting-control .ebs-select,.ebs-setting-control .ebs-input { min-height:36px; font-size:12px; }
  .ebs-setting-number { display:flex; align-items:center; gap:7px; }
  .ebs-setting-number .ebs-input { flex:1 1 auto; }
  .ebs-setting-unit { flex:0 0 auto; min-width:28px; color:#777; font-size:10px; }
  .ebs-settings-toggle { display:flex; align-items:center; justify-content:flex-start; min-height:36px; }
  .ebs-settings-toggle label { display:inline-flex; align-items:center; gap:8px; color:#333; font-size:11px; cursor:pointer; }
  .ebs-settings-toggle .ebs-check { flex:0 0 15px; }
  .ebs-settings-warning { margin:0; padding:10px 12px; border:1px solid #e7c99a; border-radius:9px; background:#fff7e9; color:#6b4b1e; font-size:10px; line-height:1.45; }
  .ebs-settings-reset { justify-self:start; }

  @media (max-width:760px) {
    .ebs-scan-settings-modal { width:calc(100vw - 12px); max-height:calc(100dvh - 12px)!important; }
    .ebs-settings-body { padding:12px 10px 15px; }
    .ebs-preset-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .ebs-setting-row { grid-template-columns:1fr; gap:7px; padding:10px 11px; }
    .ebs-setting-control { width:100%; }
    .ebs-setting-control .ebs-select,.ebs-setting-control .ebs-input { width:100%; }
  }

  @media (max-width:380px) {
    .ebs-preset-grid { gap:6px; }
    .ebs-preset { padding-inline:8px; font-size:11px; }
    .ebs-settings-section-header,.ebs-setting-row { padding-left:9px; padding-right:9px; }
  }
`);
