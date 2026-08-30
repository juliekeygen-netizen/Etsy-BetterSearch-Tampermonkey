import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ROOT } from '../scripts/project.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function loadPreludeHarness() {
  const source = await readFile(resolve(ROOT, 'extension/platform-prelude.js'), 'utf8');
  const stored = {};
  const storageListeners = [];
  const browser = {
    storage: {
      local: {
        async get() { return { ...stored }; },
        async set(values) {
          const changes = {};
          for (const [key, value] of Object.entries(values || {})) {
            changes[key] = { oldValue: stored[key], newValue: value };
            stored[key] = value;
          }
          for (const listener of storageListeners) listener(changes, 'local');
        },
      },
      onChanged: {
        addListener(listener) { storageListeners.push(listener); },
      },
    },
  };
  const runtimeGlobal = { browser, console };
  const execute = new AsyncFunction('globalThis', `${source}\nreturn { GM_getValue, GM_setValue, GM_addValueChangeListener };`);
  const api = await execute(runtimeGlobal);
  return {
    ...api,
    emitRemote(key, newValue) {
      const oldValue = stored[key];
      stored[key] = newValue;
      for (const listener of storageListeners) {
        listener({ [key]: { oldValue, newValue } }, 'local');
      }
    },
  };
}

test('extension value-change bridge distinguishes local echo from remote tab change', async () => {
  const api = await loadPreludeHarness();
  const events = [];
  api.GM_addValueChangeListener('setting', (name, oldValue, newValue, remote) => {
    events.push({ name, oldValue, newValue, remote });
  });

  api.GM_setValue('setting', 1);
  await Promise.resolve();
  assert.deepEqual(events, [
    { name:'setting', oldValue:undefined, newValue:1, remote:false },
  ]);

  api.emitRemote('setting', 2);
  assert.deepEqual(events.at(-1), {
    name:'setting', oldValue:1, newValue:2, remote:true,
  });
  assert.equal(api.GM_getValue('setting', 0), 2);
});
