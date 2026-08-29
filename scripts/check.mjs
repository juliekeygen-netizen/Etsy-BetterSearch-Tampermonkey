import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  ROOT,
  localRequirePaths,
  metadataValue,
  parseUserscriptMetadata,
  readUserscript
} from './project.mjs';

const userscript = await readUserscript();
const metadata = parseUserscriptMetadata(userscript);
const version = metadataValue(metadata, 'version');
const modules = localRequirePaths(userscript);
const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));

if (!version) throw new Error('Missing userscript @version.');
if (pkg.version !== version) {
  throw new Error(`package.json version ${pkg.version} does not match userscript ${version}.`);
}
if (!modules.length) throw new Error('No local @require modules found.');

const moduleSources = [];
for (const module of modules) {
  const path = resolve(ROOT, module.path);
  await access(path);
  if (module.cacheVersion !== version) {
    throw new Error(`${module.path} uses cache-buster ${module.cacheVersion || '(missing)'} instead of ${version}.`);
  }
  moduleSources.push({ path: module.path, source: await readFile(path, 'utf8') });
}

/* The shared Favorites code intentionally uses version-suffixed global helper
 * names across separately maintained source files. JavaScript syntax checking
 * cannot catch a call to a misspelled/renamed global helper; the generated
 * bundle remains syntactically valid and only fails in the browser. Audit the
 * complete module chain for versioned fav...#### identifiers that are referenced
 * but never declared/assigned anywhere. */
const runtimeSource = moduleSources.map(({ source }) => source).join('\n');
const versionedPattern = /\b(fav[A-Za-z0-9_$]*\d{4})\b/g;
const referenced = new Set(Array.from(runtimeSource.matchAll(versionedPattern), (match) => match[1]));
const defined = new Set();
for (const pattern of [
  /\bfunction\s+(fav[A-Za-z0-9_$]*\d{4})\b/g,
  /\b(?:var|let|const)\s+(fav[A-Za-z0-9_$]*\d{4})\b/g,
  /(?<![.\w$])(fav[A-Za-z0-9_$]*\d{4})\s*=/g,
]) {
  for (const match of runtimeSource.matchAll(pattern)) defined.add(match[1]);
}
const missingRuntimeSymbols = [...referenced].filter((name) => !defined.has(name)).sort();
if (missingRuntimeSymbols.length) {
  throw new Error(`Undefined versioned runtime symbol${missingRuntimeSymbols.length === 1 ? '' : 's'}: ${missingRuntimeSymbols.join(', ')}`);
}

const diagnosticsManifest = JSON.parse(await readFile(resolve(ROOT, 'diagnostics-extension/manifest.json'), 'utf8'));
if (diagnosticsManifest.manifest_version !== 3) throw new Error('Diagnostics extension must use Manifest V3.');
if (!diagnosticsManifest.permissions?.includes('debugger')) throw new Error('Diagnostics extension must declare debugger permission.');
if (diagnosticsManifest.background?.service_worker !== 'service-worker.js') {
  throw new Error('Diagnostics extension must use its service-worker wrapper.');
}
const diagnosticsContentScript = diagnosticsManifest.content_scripts?.find((item) => item.run_at === 'document_start');
if (!diagnosticsContentScript) throw new Error('Diagnostics recorder must load at document_start.');
if (diagnosticsContentScript.js?.[0] !== 'transport.js') {
  throw new Error('Diagnostics transport hardening must load before the recorder content script.');
}
if (!diagnosticsContentScript.js?.includes('controls.js')) {
  throw new Error('Diagnostics recorder must load its controls layer.');
}

const checkFiles = [
  'etsy-bettersearch.user.js',
  ...modules.map((item) => item.path),
  'extension/platform-prelude.js',
  'extension/background.js',
  'diagnostics-extension/service-worker.js',
  'diagnostics-extension/background.js',
  'diagnostics-extension/background-controls.js',
  'diagnostics-extension/har-extra-info.js',
  'diagnostics-extension/transport.js',
  'diagnostics-extension/content.js',
  'diagnostics-extension/controls.js',
  'scripts/project.mjs',
  'scripts/build.mjs',
  'scripts/check.mjs',
  'tests/project.test.mjs',
  'tests/favorites.test.mjs',
  'tests/favorites-deep-parser.test.mjs',
  'tests/favorites-deep-queue.test.mjs',
  'tests/favorites-revamp.test.mjs',
  'tests/diagnostics-recorder.test.mjs',
  'tests/diagnostics-har-extra-info.test.mjs',
  'tests/diagnostics-controls.test.mjs',
  'tests/diagnostics-transport.test.mjs'
];

for (const file of checkFiles) {
  const result = spawnSync(process.execPath, ['--check', resolve(ROOT, file)], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    throw new Error(`Syntax check failed: ${file}`);
  }
}

console.log(`Syntax checked ${checkFiles.length} files.`);
console.log(`Verified ${modules.length} userscript modules and v${version} cache-busters.`);
console.log(`Verified ${defined.size} versioned runtime symbol definitions.`);
console.log(`Verified Etsy BetterSearch Diagnostics ${diagnosticsManifest.version} manifest, transport, service worker and document_start wiring.`);
