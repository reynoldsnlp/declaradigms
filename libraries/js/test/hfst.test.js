'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { initHfst } = require('../index.js');

test('initializes HFST wasm module', async () => {
  const hfst = await initHfst({
    wasmPath: path.join(__dirname, '..', 'libhfst.wasm')
  });

  assert.ok(hfst);
  assert.ok(hfst.FS);
  assert.equal(typeof hfst.HfstInputStream, 'function');
});
