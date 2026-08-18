'use strict';
GM_addStyle(`
  /* Readability pass shared by the Multi-search and Scan Settings dialogs. */
  .ebs-modal-title { font-size:20px; }
  .ebs-modal-meta { font-size:12px; }
  .ebs-columns { font-size:10px; }
  .ebs-modal .ebs-select,.ebs-modal .ebs-input { font-size:13px; }
  .ebs-polarity .ebs-select { font-size:12px; }
  .ebs-check-label { font-size:12px; }
  .ebs-rule-error { font-size:11.5px; }
  .ebs-button { font-size:13px; }
  .ebs-preview { font-size:12px; }
  .ebs-preview pre { font-size:12px; }
  .ebs-draft-note { font-size:11.5px; }
  .ebs-row-menu button { font-size:13px; }

  .ebs-settings-kicker { font-size:11px; }
  .ebs-preset { font-size:13px; }
  .ebs-preset-detail strong { font-size:13px; }
  .ebs-preset-detail span { font-size:12.5px; line-height:1.48; }
  .ebs-preset-summary { font-size:11.5px!important; }
  .ebs-settings-section-header h3 { font-size:12px; }
  .ebs-settings-section-header p { font-size:11.5px; line-height:1.46; }
  .ebs-setting-label { font-size:13px; }
  .ebs-setting-help { font-size:11.5px; line-height:1.48; }
  .ebs-setting-control .ebs-select,.ebs-setting-control .ebs-input { font-size:13px; }
  .ebs-setting-unit { font-size:11px; }
  .ebs-settings-toggle label { font-size:12px; }
  .ebs-settings-warning { font-size:11.5px; line-height:1.5; }

  @media (max-width:760px) {
    .ebs-modal-title { font-size:18px; }
    .ebs-modal-meta { font-size:11px; }
    .ebs-preset { font-size:12.5px; }
    .ebs-setting-help,.ebs-settings-section-header p { font-size:11px; }
  }
`);
