import test from 'node:test';
import assert from 'node:assert/strict';
import { translations, translate } from '../frontend/src/i18n/translations.js';
import { errorMessage } from '../frontend/src/services/riotApi.js';
import { lastRoundLabel, matchDate } from '../frontend/src/data/riotMatchMapper.js';

test('English and Korean UI catalogs have matching keys and interpolate values', () => {
  assert.deepEqual(Object.keys(translations.ko).sort(), Object.keys(translations.en).sort());
  assert.equal(translate('en', 'settings'), 'Settings');
  assert.equal(translate('ko', 'settings'), '설정');
  assert.equal(translate('ko', 'unitsDeployed', { count: 3 }), '배치된 유닛 3개');
  assert.equal(translate('missing', 'language'), 'Language');
});

test('dynamic status and match labels follow the selected language', () => {
  assert.match(errorMessage(429, null, 9, 'en'), /9 seconds/);
  assert.match(errorMessage(429, null, 9, 'ko'), /9초/);
  assert.equal(lastRoundLabel({ finalStage: '6-5' }, 'ko'), '스테이지 6-5');
  assert.equal(lastRoundLabel({ lastRound: 35 }, 'en'), 'Round 35');
  const demo = { date: 'Sep 15, 2026 · 10:42' };
  assert.equal(matchDate(demo, 'en'), demo.date);
  assert.equal(matchDate(demo, 'ko'), '2026. 9. 15. · 10:42');
});
