import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

test('deep metadata progress includes failures, remaining work, throughput, and ETA', async () => {
  const source = await readFile(resolve(ROOT, 'src/84-favorites-deep-progress-parity.js'), 'utf8');
  let now = 0;
  const context = vm.createContext({
    console,
    Date,
    performance: { now: () => now },
    favDeepState: { status:'idle', completed:0, failed:0, total:0 },
    favDeepProgressModel: () => ({ title:'Scanning metadata', detail:'', ratio:0 }),
    favRenderDeepProgress: () => {},
    favSearchAnchor: () => null,
    document: {},
  });

  vm.runInContext(`${source}\nglobalThis.testApi={favDeepProgressModel};`, context);

  let model = context.testApi.favDeepProgressModel({ status:'running', completed:0, failed:0, total:10 });
  assert.equal(model.ratio, 0);
  assert.equal(model.remaining, 10);
  assert.match(model.detail, /0 \/ 10/);
  assert.match(model.detail, /10 remaining/);
  assert.match(model.detail, /Calculating speed and ETA/);

  now = 2000;
  model = context.testApi.favDeepProgressModel({ status:'running', completed:2, failed:0, total:10 });
  assert.equal(model.ratio, 0.2);
  assert.equal(model.processed, 2);
  assert.equal(model.remaining, 8);
  assert.match(model.detail, /items\/s/);
  assert.match(model.detail, /ETA/);

  now = 4000;
  model = context.testApi.favDeepProgressModel({ status:'running', completed:3, failed:1, total:10 });
  assert.equal(model.ratio, 0.4);
  assert.equal(model.processed, 4);
  assert.equal(model.remaining, 6);
  assert.match(model.detail, /4 \/ 10/);
  assert.match(model.detail, /6 remaining/);
  assert.match(model.detail, /1 failed/);
  assert.match(model.detail, /items\/s/);
  assert.match(model.detail, /ETA/);
});
