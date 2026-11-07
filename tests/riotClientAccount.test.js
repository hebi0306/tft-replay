import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRiotAccount, readRiotId, getRiotAccount, readRememberedAccount, rememberRiotAccount } from '../desktop/electron/riotClientAccount.cjs';

test('local session exposes only a valid Riot ID to the renderer', () => {
  const expected = { gameName: 'Fixture', tagLine: 'KR1' };
  assert.deepEqual(readRiotId({ riotID: expected, puuid: 'private-uuid', productContext: { private: true } }), expected);
  assert.deepEqual(readRiotId({ riotID: 'Fixture#KR1' }), expected);
  assert.equal(readRiotId({ puuid: 'private-uuid' }), null);
  assert.equal(readRiotId({ riotID: 'Fixture#KR1#other' }), null);
  assert.equal(readRiotId({ riotID: { gameName: 'Fixture', tagLine: '' } }), null);
});

test('local account detection can be disabled for manual entry', async () => {
  const key = 'TFT_REPLAY_DISABLE_RIOT_ACCOUNT';
  const previous = process.env[key];
  process.env[key] = '1';
  try { assert.equal(await detectRiotAccount(), null); }
  finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});


import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { rm } from 'node:fs/promises';

test('remembered account survives client unavailability and stores only the public Riot ID', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tft-account-'));
  const previous = process.env.TFT_REPLAY_DISABLE_RIOT_ACCOUNT;
  process.env.TFT_REPLAY_DISABLE_RIOT_ACCOUNT = '1';
  try {
    const account = { gameName: 'Fixture', tagLine: 'KR1' };
    rememberRiotAccount(root, { ...account, puuid: 'private', token: 'secret', port: 1234 });
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'riot-account.json'), 'utf8')), account);
    assert.deepEqual(await getRiotAccount(root), account);
    assert.deepEqual(readdirSync(root), ['riot-account.json']);
    rememberRiotAccount(root, { gameName: 'Other account', tagLine: 'KR2' });
    assert.deepEqual(await getRiotAccount(root), { gameName: 'Other account', tagLine: 'KR2' });
  } finally {
    if (previous === undefined) delete process.env.TFT_REPLAY_DISABLE_RIOT_ACCOUNT;
    else process.env.TFT_REPLAY_DISABLE_RIOT_ACCOUNT = previous;
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('tft-account-'));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('invalid remembered data stays unknown and cannot overwrite a valid saved account', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tft-account-'));
  try {
    assert.equal(readRememberedAccount(root), null);
    writeFileSync(join(root, 'riot-account.json'), '{broken');
    assert.equal(readRememberedAccount(root), null);
    writeFileSync(join(root, 'riot-account.json'), JSON.stringify({ gameName: 'bad#name', tagLine: 'KR1' }));
    assert.equal(readRememberedAccount(root), null);
    rememberRiotAccount(root, { gameName: 'Fixture', tagLine: 'KR1' });
    assert.equal(rememberRiotAccount(root, { puuid: 'private' }), null);
    assert.deepEqual(readRememberedAccount(root), { gameName: 'Fixture', tagLine: 'KR1' });
    const blocked = join(root, 'not-a-directory');
    writeFileSync(blocked, 'file');
    assert.deepEqual(rememberRiotAccount(blocked, { gameName: 'Fixture', tagLine: 'KR1' }), { gameName: 'Fixture', tagLine: 'KR1' });
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('tft-account-'));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
