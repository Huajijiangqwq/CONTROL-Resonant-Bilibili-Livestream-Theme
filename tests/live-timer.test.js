'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createPreviewServer } = require('../app/preview-server');
const { createTimer } = require('../app/live-timer-server');
const State = require('../app/live-state');

test('shared clock preserves elapsed time, pause, reset and idempotency across service restarts', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-timer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = 10000, serial = 0;
  const timer = createTimer({ dataRoot: dir, now: () => now });
  const cmd = (action, extra) => timer.command({ action, id: 'request-' + (++serial), ...extra });
  cmd('init', { seed: { elapsedMs: 60000, startedAt: 9000 } });
  now += 2000;
  assert.equal(State.elapsed(cmd('pause'), now), 63000);
  now += 5000;
  assert.equal(State.elapsed(timer.snapshot(), now), 63000);
  cmd('set', { elapsedMs: 90000 });
  assert.equal(timer.snapshot().startedAt, null);
  cmd('resume', { id: 'same-resume' });
  now += 1300;
  const resumed = cmd('resume', { id: 'same-resume' });
  assert.equal(resumed.startedAt, 17000);
  assert.equal(State.elapsed(resumed, now), 91300);
  const other = createTimer({ dataRoot: dir, now: () => now });
  assert.equal(State.elapsed(other.snapshot(), now), 91300);
  assert.notEqual(other.snapshot().instance, resumed.instance);
  other.command({ action: 'init', id: 'old-snapshot', seed: { elapsedMs: 0, startedAt: null } });
  assert.equal(State.elapsed(other.snapshot(), now), 91300, 'reopening an old page cannot replace the live clock');
  cmd('reset'); assert.equal(State.elapsed(timer.snapshot(), now), 0);
  assert.notEqual(timer.snapshot().startedAt, null);
  cmd('pause'); cmd('reset'); assert.equal(timer.snapshot().startedAt, null);
  assert.throws(() => cmd('set', { elapsedMs: -1 }));
  assert.throws(() => cmd('set', { elapsedMs: Infinity }));
});

test('separate OBS and app connections get live events; reconnect gets current state and writes require local origin', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-timer-http-'));
  const app = createPreviewServer({ port: 0, dataRoot: dir });
  t.after(async () => { app.server.closeAllConnections(); await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const { port } = await app.listen(), base = `http://127.0.0.1:${port}`;
  const post = (body, origin = base) => fetch(base + '/api/live-timer', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const viewer = await fetch(base + '/api/live-timer/events', { signal: AbortSignal.timeout(5000) });
  const reader = viewer.body.getReader();
  await reader.read();
  let result = await post({ action: 'init', id: 'preview-init', seed: { elapsedMs: 123000, startedAt: null } });
  assert.equal(result.status, 200);
  const event = new TextDecoder().decode((await reader.read()).value);
  assert.match(event, /"elapsedMs":123000/);
  assert.match(event, /"startedAt":null/);
  result = await post({ action: 'resume', id: 'preview-resume' });
  assert.equal((await result.json()).elapsedMs, 123000);
  await reader.cancel();
  const fresh = await fetch(base + '/api/live-timer').then(r => r.json());
  assert.equal(fresh.elapsedMs, 123000);
  assert.notEqual(fresh.startedAt, null);
  const forbidden = await post({ action: 'reset', id: 'remote-reset' }, 'https://example.com');
  assert.equal(forbidden.status, 403);
  assert.equal((await fetch(base + '/timer-state.json')).status, 404);
  assert(require('../scripts/package').excluded('app/timer-state.json'));
});

test('clients with separate storage receive the same state; old replies never rewind newer SSE revisions', async () => {
  const { create } = require('../app/live-timer-sync');
  let snapshot = { elapsedMs: 42000, startedAt: null, revision: 2, instance: 'session-a', initialized: true };
  const streams = [], observed = [[], []];
  class Events {
    constructor() { this.handlers = {}; streams.push(this); }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    close() {}
    emit(value) { this.handlers.timer({ data: JSON.stringify(value) }); }
  }
  const fetcher = async (_url, options) => {
    if (options?.method === 'POST') {
      const cmd = JSON.parse(options.body);
      snapshot = { ...snapshot, elapsedMs: cmd.elapsedMs, revision: 3 };
      streams.forEach(s => s.emit(snapshot));
      return { ok: true, json: async () => ({ ...snapshot, elapsedMs: 42000, revision: 2 }) };
    }
    return { ok: true, json: async () => snapshot };
  };
  const clients = [0, 1].map(i => create({ writer: i === 0, seed: () => ({ elapsedMs: 0, startedAt: null }),
    apply: value => observed[i].push(value), status() {}, fetcher, Events }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await clients[0].command('set', { elapsedMs: 99000 }), true);
  assert.deepEqual(observed[0].at(-1), observed[1].at(-1));
  assert.equal(observed[1].at(-1).elapsedMs, 99000);
  streams[1].emit({ ...snapshot, instance: 'session-b', revision: 0, elapsedMs: 150000 });
  assert.equal(observed[1].at(-1).elapsedMs, 150000, 'server restart has a new revision domain');
  clients.forEach(client => client.close());
});
