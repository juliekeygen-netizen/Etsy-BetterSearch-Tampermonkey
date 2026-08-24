import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const USER_SCRIPT = resolve(ROOT, 'etsy-bettersearch.user.js');

export async function readUserscript() {
  return readFile(USER_SCRIPT, 'utf8');
}

export function parseUserscriptMetadata(source) {
  const metadata = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\/\/\s+@([^\s]+)\s+(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!metadata.has(key)) metadata.set(key, []);
    metadata.get(key).push(value.trim());
  }
  return metadata;
}

export function metadataValue(metadata, key, fallback = '') {
  return metadata.get(key)?.[0] ?? fallback;
}

export function localRequirePaths(source) {
  const paths = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\/\/\s+@require\s+https:\/\/raw\.githubusercontent\.com\/juliekeygen-netizen\/Etsy-BetterSearch-Tampermonkey\/main\/(src\/[^?\s]+)(?:\?v=([^\s]+))?\s*$/);
    if (match) paths.push({ path: match[1], cacheVersion: match[2] || '' });
  }
  return paths;
}

export function makeManifest(target, { version, name, description }) {
  const base = {
    manifest_version: 3,
    name,
    version,
    description,
    permissions: ['storage'],
    host_permissions: ['https://www.etsy.com/*'],
    content_scripts: [
      {
        matches: ['https://www.etsy.com/*'],
        js: ['content.js'],
        run_at: 'document_idle'
      }
    ]
  };

  if (target === 'chrome') {
    return {
      ...base,
      background: { service_worker: 'background.js' }
    };
  }

  if (target === 'firefox') {
    return {
      ...base,
      background: { scripts: ['background.js'] },
      browser_specific_settings: {
        gecko: {
          id: 'etsy-bettersearch@juliekeygen-netizen.github.io',
          strict_min_version: '128.0'
        }
      }
    };
  }

  throw new Error(`Unknown extension target: ${target}`);
}
