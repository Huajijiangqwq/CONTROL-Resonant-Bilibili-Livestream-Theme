'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { spawnSync } = require('node:child_process');

test('Mac distribution fixtures preserve signed bundles and gate native DMG verification', () => {
  const python = process.env.CONTROL_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python, ['-B', path.join(__dirname, 'mac-distribution.py')], {
    encoding: 'utf8', windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
