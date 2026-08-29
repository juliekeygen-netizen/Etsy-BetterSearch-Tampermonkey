'use strict';

// Keep the core recorder readable while allowing small, independently tested
// export enrichments to layer on top of it. Both scripts share this classic
// service-worker global scope.
importScripts('background.js', 'har-extra-info.js');
