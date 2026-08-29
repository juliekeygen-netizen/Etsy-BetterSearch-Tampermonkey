'use strict';

// Keep the core recorder readable while allowing small, independently tested
// export/control enrichments to layer on top of it. All scripts share this
// classic service-worker global scope.
importScripts(
  'background.js',
  'har-extra-info.js',
  'background-controls.js',
  'background-detach-autoexport.js'
);
