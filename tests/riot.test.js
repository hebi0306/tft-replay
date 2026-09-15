import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRiotProxy } from '../server/riotProxy.js';
import { indexStaticData, resolveStatic } from '../src/services/tftStaticData.js';
import { mapRiotMatchToMatchCard, lastRoundLabel } from '../src/data/riotMatchMapper.js';
import { getMockReplay, getDemoRecords } from '../src/data/mockReplay.js';
import { errorMessage } from '../src/services/riotApi.js';

// Synthetic API contract fixture, not a real Riot match.
const participant = {
  puuid: 'fixture_player_123', placement: 2, level: 8, last_round: 35, gold_left: 0,
  total_damage_to_players: 123, time_eliminated: 1801.3,
  units: [{ character_id: 'TFT17_Test', tier: 3, itemNames: ['TFT_Item_Test'], items: [999] }],
  traits: [{ name: 'TFT17_Trait', num_units: 4, style: 2, tier_current: 2 }, { name: 'UnknownTrait', num_units: 1, style: 0, tier_current: 0 }],
};
const fixture = { metadata: { match_id: 'KR_12345' }, info: { game_datetime: 1700000000000, game_length: 1901.4, game_version: 'Version 16.18.1', participants: [{ puuid: 'other', placement: 1 }, participant] } };
const entry = (id, name) => ({ data: { [`Maps/Shipping/${id}`]: { id, name, image: { full: `${id}.png` } } } });
const catalog = {
  champion: indexStaticData(entry('TFT17_Test', 'Test champion'), '16.18.1', 'champion'),
  item: indexStaticData(entry('TFT_Item_Test', 'Test item'), '16.18.1', 'item'),
  trait: indexStaticData(entry('TFT17_Trait', 'Test trait'), '16.18.1', 'trait'), version: '16.18.1',
};
test('Riot adapter maps the selected PUUID, preserves zeros and never invents positions or round history', () => {
  const match = mapRiotMatchToMatchCard(fixture, participant.puuid, catalog);
  assert.equal(match.placement, 2);
  assert.equal(match.goldLeft, 0);
  assert.equal(match.totalDamage, 123);
  assert.equal(match.duration, '31:41');
  assert.equal(lastRoundLabel(match), 'Round 35');
  assert.equal(match.finalStage, null);
  assert.equal(match.finalComposition[0].name, 'Test champion');
  assert.equal(match.finalComposition[0].star, 3);
  assert.equal(match.finalComposition[0].items[0].name, 'Test item');
  assert.ok(match.finalComposition[0].image.includes('/img/tft-champion/'));
  assert.equal(match.traits[0].active, true);
  assert.equal(match.traits[1].active, false);
  assert.equal(match.traits[1].name, 'Unknown trait');
  assert.equal('position' in match.finalComposition[0], false);
  for (const field of ['rounds', 'hp', 'bench', 'shop', 'changes']) assert.equal(field in match, false);
  const record = { match, replay: getMockReplay() };
  assert.equal(record.replay.source, 'mock');
  assert.equal(record.replay.rounds.length, 25);
  assert.notEqual(record.replay.rounds.at(-1).level, match.level);
  assert.equal(getDemoRecords().length, 5);
});
test('missing values, unknown static IDs and invalid star tiers stay unknown', () => {
  const match = mapRiotMatchToMatchCard({ info: { participants: [{ puuid: 'p', units: [{ tier: 99, items: [111] }] }] } }, 'p', {});
  assert.equal(match.placement, null);
  assert.equal(match.duration, '—');
  assert.equal(match.finalComposition[0].star, null);
  assert.equal(match.finalComposition[0].items[0].name, 'Unknown item');
  assert.deepEqual(match.traits, []);
  assert.equal(resolveStatic({}, 'champion', 'secret-internal-id').name, 'Unknown champion');
  assert.throws(() => mapRiotMatchToMatchCard(fixture, 'missing', catalog), /사용자/);
});

async function proxyTest(t, options) {
  const server = createServer(createRiotProxy(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('proxy routes account -> IDs -> details and forwards token only as an upstream header', async t => {
  const calls = [];
  const base = await proxyTest(t, { apiKey: 'test-only-token', fetchImpl: async (url, options) => {
    calls.push({ url, token: options.headers['X-Riot-Token'] });
    return Response.json(url.includes('/accounts/') ? { puuid: participant.puuid, gameName: '가상 사용자', tagLine: 'KR1' } : url.includes('/ids?') ? ['KR_12345'] : fixture);
  } });
  const account = await fetch(`${base}/api/riot/account?gameName=${encodeURIComponent('가상 사용자')}&tagLine=KR1&region=asia`).then(r => r.json());
  const ids = await fetch(`${base}/api/riot/matches?puuid=${account.puuid}&count=10&region=asia`).then(r => r.json());
  const raw = await fetch(`${base}/api/riot/match/${ids[0]}?region=asia`).then(r => r.json());
  assert.equal(mapRiotMatchToMatchCard(raw, account.puuid, catalog).level, 8);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.startsWith('https://asia.api.riotgames.com/riot/account/'));
  assert.ok(calls[1].url.endsWith('/ids?start=0&count=10'));
  assert.equal(calls[2].url, 'https://asia.api.riotgames.com/tft/match/v1/matches/KR_12345');
  assert.ok(calls.every(call => call.token === 'test-only-token' && !call.url.includes('test-only-token')));
  assert.ok(!JSON.stringify(raw).includes('test-only-token'));
});
test('proxy rejects missing keys, cross-origin access, arbitrary routing and unsupported paths', async t => {
  const base = await proxyTest(t, { fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.deepEqual(await fetch(`${base}/api/health`).then(r => r.json()), { configured: false });
  const missing = await fetch(`${base}/api/riot/account?gameName=A&tagLine=B`);
  assert.equal(missing.status, 503); assert.equal((await missing.json()).error, 'KEY_NOT_CONFIGURED');
  assert.equal((await fetch(`${base}/api/riot/account?gameName=A&tagLine=B`, { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/riot/match/KR_123?region=attacker.example`)).status, 400);
  assert.equal((await fetch(`${base}/api/riot/matches?puuid=bad&count=100`)).status, 400);
  assert.equal((await fetch(`${base}/api/riot/anything`)).status, 404);
});
test('proxy keeps 401/403/404/429/5xx distinct; 429 respects Retry-After without retry storms', async t => {
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    const base = await proxyTest(t, { apiKey: 'test-only', fetchImpl: async () => { calls++; return new Response('private upstream error', { status, headers: { 'Retry-After': '9' } }); } });
    const response = await fetch(`${base}/api/riot/match/KR_123`);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.ok(!JSON.stringify(body).includes('private upstream'));
    assert.ok(errorMessage(status, body.error, body.retryAfter).length > 10);
    if (status === 429) { assert.equal(body.retryAfter, 9); assert.equal((await fetch(`${base}/api/riot/match/KR_123`)).status, 429); assert.equal(calls, 1); }
  }
  const base = await proxyTest(t, { apiKey: 'test-only', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  const response = await fetch(`${base}/api/riot/match/KR_123`);
  assert.equal(response.status, 502); assert.equal((await response.json()).error, 'UPSTREAM_NETWORK');
});
