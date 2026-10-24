import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestBattleStats } from '../src/lib/questProgress';
import {
  chooseUchihaEventReward,
  updateTrackedEventProgress,
  withUchihaEvent,
  UCHIHA_EVENT,
  UCHIHA_EVENT_ID,
} from '../src/lib/uchihaEvent';

function createStats(overrides: Partial<QuestBattleStats> = {}): QuestBattleStats {
  return {
    damageDealt: 0,
    damageReceived: 0,
    healingDone: 0,
    shieldGenerated: 0,
    stunsApplied: 0,
    skillsUsed: {},
    killsWithSkill: {},
    playerCharactersUsed: [],
    playerTeamCharacters: [],
    damageDealtRecords: [],
    damageReceivedRecords: [],
    healingDoneRecords: [],
    shieldGeneratedRecords: [],
    killRecords: [],
    counterRecords: [],
    skillUseRecords: [],
    ...overrides,
  };
}

test('Uchiha event tracks wins, skills, damage and team damage received independently', () => {
  const current = updateTrackedEventProgress(undefined, createStats({
    damageReceived: 120,
    playerTeamCharacters: [{ name: 'Sasuke Uchiha (Hebi)', tags: [] }, { name: 'Itachi Uchiha', tags: [] }],
    skillUseRecords: [
      { charName: 'Sasuke Uchiha', tags: [], skillName: 'Chidori' },
      { charName: 'Itachi Uchiha', tags: [], skillName: 'Amaterasu' },
    ],
    damageDealtRecords: [
      { charName: 'Sasuke Uchiha', tags: [], skillName: 'Chidori', amount: 450 },
      { charName: 'Itachi Uchiha', tags: [], skillName: 'Amaterasu', amount: 620 },
    ],
  }), true);
  const progress = current[UCHIHA_EVENT_ID];

  assert.equal(progress['uchiha-sasuke-wins'], 1);
  assert.equal(progress['uchiha-itachi-wins'], 1);
  assert.equal(progress['uchiha-sasuke-skills'], 1);
  assert.equal(progress['uchiha-itachi-skills'], 1);
  assert.equal(progress['uchiha-sasuke-damage'], 450);
  assert.equal(progress['uchiha-itachi-damage'], 620);
  assert.equal(progress['uchiha-sasuke-team-damage'], 120);
});

test('Uchiha event only counts victories on wins and caps progress at each target', () => {
  const current = updateTrackedEventProgress(undefined, createStats({
    playerTeamCharacters: [{ name: 'Sasuke Uchiha', tags: [] }],
    damageDealtRecords: [
      { charName: 'Sasuke Uchiha', tags: [], skillName: 'Chidori', amount: 20_000 },
    ],
  }), false);
  assert.equal(current[UCHIHA_EVENT_ID]['uchiha-sasuke-wins'], 0);
  assert.equal(current[UCHIHA_EVENT_ID]['uchiha-sasuke-damage'], 10_000);

  const repeat = updateTrackedEventProgress(current, createStats({
    playerTeamCharacters: [{ name: 'Sasuke Uchiha', tags: [] }],
  }), true);
  assert.equal(repeat[UCHIHA_EVENT_ID]['uchiha-sasuke-wins'], 1);
  assert.equal(repeat[UCHIHA_EVENT_ID]['uchiha-sasuke-damage'], 10_000);
});

test('Uchiha event reward selection is deterministic and clamps random bounds', () => {
  assert.deepEqual(chooseUchihaEventReward('uchiha-sasuke-wins', () => 0), {
    type: 'ryos',
    value: 500,
    label: '500 Moedas',
  });
  assert.deepEqual(chooseUchihaEventReward('uchiha-sasuke-wins', () => 1), {
    type: 'gems',
    value: 15,
    label: '15 Gems',
  });
  assert.equal(chooseUchihaEventReward('unknown-objective', () => 0), null);
});

test('Uchiha event always uses the dedicated Sasuke and Itachi banner', () => {
  const configured = withUchihaEvent([{ ...UCHIHA_EVENT, bannerUrl: '/old-banner.webp' }]);
  assert.equal(configured.find(event => event.id === UCHIHA_EVENT_ID)?.bannerUrl,
    '/static/img/banners/banner_itachi_sasuke.webp');
});
