import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const { createCaptureBridge } = createRequire(import.meta.url)('../desktop/electron/captureBridge.cjs');

test('private capture bridge handles requests, rejects unknown commands, and closes the worker', { skip: !existsSync('.capture-venv/Scripts/python.exe') }, async () => {
  const dataPath = await mkdtemp(join(tmpdir(), 'tft-capture-test-'));
  const bridge = createCaptureBridge({ root: resolve('.'), resources: resolve('.'), dataPath, packaged: false });
  try {
    assert.equal((await bridge.request('status')).recording, false);
    assert.deepEqual(await bridge.request('list'), []);
    await assert.rejects(bridge.request('execute', {}), /invalid_command/);
    await assert.rejects(bridge.request('match', { id: '../private' }), /match_missing/);
    assert.equal((await bridge.request('stop')).recording, false);
  } finally {
    await bridge.close();
    await rm(dataPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
