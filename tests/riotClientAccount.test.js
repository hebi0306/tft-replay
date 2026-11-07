import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRiotAccount, readRiotId } from '../desktop/electron/riotClientAccount.cjs';

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
