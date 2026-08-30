import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const source = await readFile(resolve(ROOT, 'src/103-favorites-v0157-diagnostics-fixes.js'), 'utf8');

function loadWriterHelpers(documentStub) {
  const start = source.indexOf('function favStyleSetValue01514');
  const end = source.indexOf('/* Final privacy-label writers');
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ Array, String, Object, document:documentStub });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.testApi={
    style:favStyleSetValue01514,
    text:favSetElementText01514,
    strong:favSetStrongLabel01514,
  };`, context);
  return context.testApi;
}

function makeStrong(initialText = ' Private collection', extraText = null) {
  const counters = { appends:0, removes:0, valueWrites:0, textCreates:0 };
  const strong = {
    childElementCount:1,
    childNodes:[{ nodeType:1 }],
    append(node) {
      counters.appends += 1;
      node.parentNode = this;
      this.childNodes.push(node);
    },
  };
  const makeTextNode = (value) => {
    let current = value;
    const node = {
      nodeType:3,
      parentNode:strong,
      get nodeValue() { return current; },
      set nodeValue(next) { counters.valueWrites += 1; current = next; },
      remove() {
        counters.removes += 1;
        strong.childNodes = strong.childNodes.filter((candidate) => candidate !== node);
      },
    };
    return node;
  };
  if (initialText !== null) strong.childNodes.push(makeTextNode(initialText));
  if (extraText !== null) strong.childNodes.push(makeTextNode(extraText));
  const documentStub = {
    createTextNode(value) {
      counters.textCreates += 1;
      return makeTextNode(value);
    },
  };
  return { strong, counters, documentStub };
}

test('repeating the same privacy label performs zero child-list or text-value writes', () => {
  const fixture = makeStrong(' Private collection');
  const { strong } = loadWriterHelpers(fixture.documentStub);
  assert.equal(strong(fixture.strong, 'Private collection'), false);
  assert.deepEqual(fixture.counters, { appends:0, removes:0, valueWrites:0, textCreates:0 });
});

test('a real privacy-label change updates the existing text node without replacing children', () => {
  const fixture = makeStrong(' Public collection');
  const { strong } = loadWriterHelpers(fixture.documentStub);
  assert.equal(strong(fixture.strong, 'Private collection'), true);
  assert.deepEqual(fixture.counters, { appends:0, removes:0, valueWrites:1, textCreates:0 });
  assert.equal(fixture.strong.childNodes.length, 2);
  assert.equal(fixture.strong.childNodes[1].nodeValue, ' Private collection');
});

test('legacy duplicate label text is repaired once and then becomes quiescent', () => {
  const fixture = makeStrong(' Private collection', ' stale duplicate');
  const { strong } = loadWriterHelpers(fixture.documentStub);
  assert.equal(strong(fixture.strong, 'Private collection'), true);
  assert.equal(fixture.counters.removes, 1);
  fixture.counters.removes = 0;
  assert.equal(strong(fixture.strong, 'Private collection'), false);
  assert.equal(fixture.counters.removes, 0);
});

test('same CSS custom property value does not call setProperty again', () => {
  let writes = 0;
  const values = new Map([['--x', ['123px', '']]]);
  const node = {
    style:{
      getPropertyValue(name) { return values.get(name)?.[0] || ''; },
      getPropertyPriority(name) { return values.get(name)?.[1] || ''; },
      setProperty(name, value, priority = '') { writes += 1; values.set(name, [value, priority]); },
    },
  };
  const { style } = loadWriterHelpers({ createTextNode() { throw new Error('unused'); } });
  assert.equal(style(node, '--x', '123px'), false);
  assert.equal(writes, 0);
  assert.equal(style(node, '--x', '124px'), true);
  assert.equal(writes, 1);
});

test('final scope-header owner bypasses the destructive historical collection updater', () => {
  const start = source.indexOf('favUpdateScopeHeader0120 = function favUpdateScopeHeader01514');
  const end = source.indexOf('/* The progress node belongs to BetterSearch', start);
  const block = source.slice(start, end);
  assert.match(block, /favApplyScopeMetaDensity0131\(\)/);
  assert.match(block, /favApplyCollectionMetaDensity0126\(\)/);
  assert.doesNotMatch(block, /replaceChildren\s*\(/);
  assert.doesNotMatch(block, /favUpdateScopeHeaderBefore/);
});

test('final collection metadata writer preserves the native subtree and compares count text before writing', () => {
  const start = source.indexOf('favApplyCollectionMetaDensity0126 = function favApplyCollectionMetaDensity01514');
  const end = source.indexOf('/* Do not call the historical module-86 updater', start);
  const block = source.slice(start, end);
  assert.match(block, /favSetStrongLabel01514\(strong/);
  assert.match(block, /countNode\.nodeValue !== countText/);
  assert.doesNotMatch(block, /replaceChildren\s*\(/);
  assert.doesNotMatch(block, /strong\.textContent\s*=/);
});

test('progress and final toolbar custom properties use compare-before-write helpers', () => {
  const progress = source.slice(
    source.indexOf('var favProgressBefore01514'),
    source.indexOf('/* Ships-from options require'),
  );
  assert.match(progress, /favSetElementText01514\(node, text\)/);
  assert.match(progress, /favStyleSetValue01514\(node, '--ebsf-progress-top0134'/);
  assert.match(progress, /favStyleSetValue01514\(node, '--ebsf-progress-height0134'/);

  const toolbar = source.slice(
    source.indexOf('favApplyExactSearchWidth0135 = function favApplyExactSearchWidth0157'),
    source.indexOf('var favInstallPageShellBefore0157'),
  );
  assert.match(toolbar, /favStyleSetValue01514\(document\.documentElement, '--ebsf-shared-sort-width0134'/);
  assert.match(toolbar, /favStyleSetValue01514\(row, '--ebsf-narrow-sort-width'/);
  assert.match(toolbar, /favStyleSetValue01514\(row, '--ebsf-shared-search-width0134'/);
});
