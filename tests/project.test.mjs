import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ROOT,
  localRequirePaths,
  makeManifest,
  metadataValue,
  parseUserscriptMetadata,
  readUserscript
} from '../scripts/project.mjs';

test('userscript metadata drives extension version and module order', async () => {
  const source = await readUserscript();
  const metadata = parseUserscriptMetadata(source);
  const version = metadataValue(metadata, 'version');
  const modules = localRequirePaths(source);

  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(modules.length >= 1);
  assert.equal(new Set(modules.map((item) => item.path)).size, modules.length);

  for (const module of modules) {
    assert.equal(module.cacheVersion, version);
    await access(resolve(ROOT, module.path));
  }
});

test('package version stays aligned with userscript', async () => {
  const source = await readUserscript();
  const metadata = parseUserscriptMetadata(source);
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, metadataValue(metadata, 'version'));
});

test('Chrome manifest uses MV3 service worker and Etsy host permission', () => {
  const manifest = makeManifest('chrome', {
    version: '1.2.3',
    name: 'Etsy BetterSearch',
    description: 'test'
  });
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(manifest.host_permissions.includes('https://www.etsy.com/*'));
  assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
});

test('Firefox manifest uses background scripts and a stable Gecko id', () => {
  const manifest = makeManifest('firefox', {
    version: '1.2.3',
    name: 'Etsy BetterSearch',
    description: 'test'
  });
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background.scripts, ['background.js']);
  assert.equal(
    manifest.browser_specific_settings.gecko.id,
    'etsy-bettersearch@juliekeygen-netizen.github.io'
  );
});
