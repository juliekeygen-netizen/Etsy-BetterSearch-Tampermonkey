'use strict';

// Keep the core recorder readable while allowing small, independently tested
// export/control/session-health enrichments to layer on top of it. All scripts
// share this classic service-worker global scope.
importScripts(
  'background.js',
  'har-extra-info.js',
  'background-controls.js',
  'background-detach-autoexport.js',
  'background-session-health.js',
  'background-streaming-export.js',
  'background-discard-hardening.js'
);
