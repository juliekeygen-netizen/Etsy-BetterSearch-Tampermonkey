import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../diagnostics-extension/transport.js', import.meta.url), 'utf8');

function makeContext() {
  const sent = [];
  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      sent.push(message);
      callback?.({ ok: true });
    }
  };
  const context = {
    chrome: { runtime },
    TextEncoder,
    Date,
    JSON,
    Map,
    Set,
    WeakSet,
    Number,
    String,
    Error,
    Object,
    Array,
    console,
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, sent };
}

function send(context, message) {
  return new Promise((resolve) => context.chrome.runtime.sendMessage(message, resolve));
}

test('append_events batches are JSON-sanitized and split into bounded chunks', async () => {
  const { context, sent } = makeContext();
  const circular = { label: 'circular' };
  circular.self = circular;

  const events = Array.from({ length: 145 }, (_, index) => ({
    stream: 'dom-mutation',
    type: 'childList',
    observed: { epochMs: 1000 + index },
    data: index === 10 ? { circular, big: 9n } : { index, text: 'x'.repeat(200) }
  }));

  const response = await send(context, { action: 'append_events', events });
  assert.equal(response.ok, true);
  assert.ok(sent.length >= 3, '145 events should be split into multiple transport messages');
  assert.ok(sent.every((message) => message.action === 'append_events'));
  assert.ok(sent.every((message) => message.events.length <= 60));

  const flattened = sent.flatMap((message) => message.events);
  assert.equal(flattened.length, 145);
  assert.equal(flattened[10].data.circular.self, '[Circular]');
  assert.equal(flattened[10].data.big, '9');
  assert.doesNotThrow(() => JSON.stringify(sent));
});

test('an oversized single event is replaced with a compact omission record', async () => {
  const { context, sent } = makeContext();
  const event = {
    stream: 'dom-mutation',
    type: 'oversized',
    observed: { epochMs: Date.now() },
    data: { huge: 'z'.repeat(700 * 1024) }
  };

  const response = await send(context, { action: 'append_events', events: [event] });
  assert.equal(response.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].events[0].stream, 'recorder');
  assert.equal(sent[0].events[0].type, 'transport-event-omitted');
  assert.equal(sent[0].events[0].data.reason, 'event-too-large');
});

test('marker descriptions are capped before Chrome messaging serialization', async () => {
  const { context, sent } = makeContext();
  const note = 'n'.repeat(20000);
  const response = await send(context, { action: 'marker_note', markerId: 'm1', note });
  assert.equal(response.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].note.length, 12000);
});

test('transport capture gate ignores append batches while paused or stopped and reopens on resume', async () => {
  const { context, sent } = makeContext();
  await send(context, { action: 'pause_recording' });
  const paused = await send(context, { action: 'append_events', events: [{ stream: 'x', type: 'y', data: {} }] });
  assert.equal(paused.ignored, true);
  assert.equal(sent.filter((item) => item.action === 'append_events').length, 0);

  await send(context, { action: 'resume_recording' });
  const resumed = await send(context, { action: 'append_events', events: [{ stream: 'x', type: 'y', data: {} }] });
  assert.equal(resumed.ok, true);
  assert.equal(sent.filter((item) => item.action === 'append_events').length, 1);
});
