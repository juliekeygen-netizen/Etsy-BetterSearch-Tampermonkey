import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const pagination = await readFile(new URL('../src/95-favorites-responsive-pagination.js', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/86-favorites-page-shell.js', import.meta.url), 'utf8');

function fixture({ count = 44 } = {}) {
  const rendered = [];
  const records = Array.from({ length:count }, (_, index) => ({ id:String(index + 1) }));
  const classList = { remove() {}, add() {} };
  const context = {
    favCfg: { sort:'price', sortReversed:false, filters:{} },
    favState: {
      localPage:1,
      pageSize:999,
      localPageRouteKey0129:'',
      localPagingKey0144:'',
      localPagination0144:null,
      localGrid0141:null,
      renderMode0141:'native',
      records,
    },
    favNormalizeConfig: (value) => value,
    favDatasetKey: () => 'owner|items||',
    favRenderCurrent() {
      const start = (context.favState.localPage - 1) * context.favState.pageSize;
      const page = records.slice(start, start + context.favState.pageSize);
      rendered.push(page.map((record) => record.id));
      return page;
    },
    favRestoreNative: () => {},
    favNativeMainGrid0141: () => null,
    document: {
      body: { classList },
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({
        className:'', dataset:{}, style:{ removeProperty() {} },
        setAttribute() {}, addEventListener() {}, classList:{ add() {} },
      }),
      createDocumentFragment: () => ({ append() {} }),
    },
    GM_addStyle: () => {},
    requestAnimationFrame: (callback) => { callback(); return 1; },
    JSON,
    Number,
    String,
    Math,
    Array,
    Map,
    Set,
    console,
  };
  vm.createContext(context);
  vm.runInContext(pagination, context);
  return { context, rendered, records };
}

test('44 matching records render as 20 + 20 + 4 instead of one 44-card page', () => {
  const { context, rendered } = fixture({ count:44 });
  context.favRenderCurrent();
  assert.equal(context.favState.pageSize, 20);
  assert.equal(rendered.at(-1).length, 20);
  assert.deepEqual(rendered.at(-1), Array.from({ length:20 }, (_, index) => String(index + 1)));

  context.favState.localPage = 2;
  context.favRenderCurrent();
  assert.equal(rendered.at(-1).length, 20);
  assert.deepEqual(rendered.at(-1), Array.from({ length:20 }, (_, index) => String(index + 21)));

  context.favState.localPage = 3;
  context.favRenderCurrent();
  assert.deepEqual(rendered.at(-1), ['41','42','43','44']);
});

test('local pagination boundaries stay stable for 0/1/19/20/21/39/40/41/44 matches', () => {
  for (const count of [0,1,19,20,21,39,40,41,44]) {
    const pages = Math.max(1, Math.ceil(count / 20));
    const expected = count <= 20 ? 1 : count <= 40 ? 2 : 3;
    assert.equal(pages, expected, `count=${count}`);
  }
});

test('changing the dataset/config generation resets BetterSearch local results to page 1', () => {
  const { context, rendered } = fixture({ count:44 });
  context.favRenderCurrent();
  context.favState.localPage = 3;
  context.favRenderCurrent();
  assert.equal(rendered.at(-1).length, 4);

  context.favCfg.sort = 'title';
  context.favRenderCurrent();
  assert.equal(context.favState.localPage, 1);
  assert.equal(rendered.at(-1).length, 20);
});

test('local pager has its own identity and never impersonates Etsy WtPagination', () => {
  assert.match(pagination, /role', 'navigation'/);
  assert.match(pagination, /BetterSearch filtered favorites pages/);
  assert.doesNotMatch(pagination, /setAttribute\('aria-label', 'Favorite Items Page Results'\)/);
  assert.doesNotMatch(pagination, /location\.(?:assign|replace)|history\.(?:pushState|replaceState)/);
});

test('native/local visual ownership is exclusive even against Etsy display utility rules', () => {
  assert.match(pagination, /nativeGrid\.style\.setProperty\('display', 'none', 'important'\)/);
  assert.match(pagination, /\[data-ebsf-native-hidden="1"\]\{\s*display:none!important/);
  assert.match(pagination, /body\.ebsf-results-active nav\[aria-label="Favorite Items Page Results"\]/);
});

test('the page shell contains no surviving whole-catalogue local page workaround', () => {
  assert.doesNotMatch(shell, /pageSize\s*=\s*Math\.max\(1\s*,\s*favState\.records\.length\)/);
  assert.doesNotMatch(shell, /favState\.localPage\s*=\s*1;favState\.pageSize/);
});
