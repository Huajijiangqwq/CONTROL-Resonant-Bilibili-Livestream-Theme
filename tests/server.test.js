'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http');
const { createPreviewServer } = require('../app/preview-server');

test('isolated preview serves editor, assets, health and rejects private paths', async () => {
  const app = createPreviewServer({
    port: 0,
    release: { name: 'test', identity: 'fixture' },
    stopToken: 'test-only',
    onStop: () => {},
  });
  try {
    const address = await app.listen(),
      base = `http://127.0.0.1:${address.port}`;
    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /theme-editor\.js/);
    for (const file of [
      'live.html',
      'simulation.html',
      'now-playing.html',
      'assets/game-placeholder.svg',
      'now-playing-flow-field.js',
      'now-playing-fft.js',
    ])
      assert.equal((await fetch(base + '/' + file)).status, 200, file);
    assert.equal(
      (await fetch(base + '/api/release-health').then((r) => r.json())).identity,
      'fixture',
    );
    for (const file of [
      'theme-live/secret.json',
      'audio-settings.json',
      'now-playing-settings.json',
      'bilibili-session-store.js',
      'bilibili-qr-auth.js',
      'bilibili-open-store.js',
      'bilibili-session-credentials.enc',
      '.env',
      '%2e%2e/LICENSE',
    ])
      assert.equal((await fetch(base + '/' + file)).status, 404, file);
    assert.equal(
      (
        await fetch(base + '/api/themes', {
          method: 'POST',
          headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal((await fetch(base + '/api/release-stop', { method: 'POST' })).status, 403);
    const range = await fetch(base + '/assets/game-placeholder.svg', {
      headers: { Range: 'bytes=0-9' },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 10);
    const hostile = await new Promise((resolve, reject) => {
      const req = http.get(
        base + '/api/release-health',
        { headers: { Host: 'attacker.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
    });
    assert.equal(hostile, 403);
  } finally {
    app.server.closeAllConnections();
    await app.close();
  }
});
