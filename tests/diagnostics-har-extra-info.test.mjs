import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../diagnostics-extension/har-extra-info.js', import.meta.url), 'utf8');

test('HAR enrichment merges CDP extra headers and associated request cookies', () => {
  const seen = { events: null };
  const context = {
    Map,
    String,
    Array,
    Object,
    buildHar(session, events) {
      seen.events = events;
      const requestEvent = events.find((event) => event.type === 'Network.requestWillBeSent');
      const responseEvent = events.find((event) => event.type === 'Network.responseReceived');
      const requestHeaders = requestEvent.data.params.request.headers || {};
      const responseHeaders = responseEvent.data.params.response.headers || {};
      return {
        log: {
          entries: [{
            _requestId: 'r1',
            request: {
              headers: Object.entries(requestHeaders).map(([name, value]) => ({ name, value: String(value) })),
              cookies: []
            },
            response: {
              headers: Object.entries(responseHeaders).map(([name, value]) => ({ name, value: String(value) }))
            }
          }]
        }
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  const events = [
    {
      stream: 'cdp',
      type: 'Network.requestWillBeSentExtraInfo',
      data: {
        method: 'Network.requestWillBeSentExtraInfo',
        params: {
          requestId: 'r1',
          headers: { 'X-Extra': 'yes' },
          associatedCookies: [{ cookie: { name: 'sid', value: 'abc' } }]
        }
      }
    },
    {
      stream: 'cdp',
      type: 'Network.requestWillBeSent',
      data: {
        method: 'Network.requestWillBeSent',
        params: { requestId: 'r1', request: { headers: { Accept: 'application/json' } } }
      }
    },
    {
      stream: 'cdp',
      type: 'Network.responseReceivedExtraInfo',
      data: {
        method: 'Network.responseReceivedExtraInfo',
        params: { requestId: 'r1', headers: { 'X-Response-Extra': 'seen' } }
      }
    },
    {
      stream: 'cdp',
      type: 'Network.responseReceived',
      data: {
        method: 'Network.responseReceived',
        params: { requestId: 'r1', response: { headers: { Server: 'etsy-test' } } }
      }
    }
  ];

  const har = context.buildHar({ sessionId: 's1' }, events);
  const entry = har.log.entries[0];

  assert.ok(seen.events.find((event) => event.type === 'Network.requestWillBeSent').data.params.request.headers['X-Extra'] === 'yes');
  assert.ok(seen.events.find((event) => event.type === 'Network.responseReceived').data.params.response.headers['X-Response-Extra'] === 'seen');
  assert.equal(entry.request.cookies.length, 1);
  assert.equal(entry.request.cookies[0].name, 'sid');
  assert.equal(entry.request.cookies[0].value, 'abc');
  assert.equal(entry._requestExtraInfo.headers['X-Extra'], 'yes');
  assert.equal(entry._responseExtraInfo.headers['X-Response-Extra'], 'seen');
});

test('HAR enrichment source explicitly handles both CDP ExtraInfo event families', () => {
  assert.match(source, /Network\.requestWillBeSentExtraInfo/);
  assert.match(source, /Network\.responseReceivedExtraInfo/);
  assert.match(source, /associatedCookies/);
});
