import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateRecurringPoints,
  getCurrentRecurringQuests,
  getRecurringChestClaimId,
  getRecurringChestTiers,
  isRecurringChestUnlocked,
} from '../src/lib/recurringQuests';
import { evaluateAuthoritativeQuestGoal } from '../src/lib/questProgress';
import type { QuestBattleStats } from '../src/lib/questProgress';

test('recurring quests keep IDs within a period and rotate at period boundaries', () => {
  const monday = new Date('2026-10-19T12:00:00.000Z');
  const sameDay = new Date('2026-10-19T23:59:00.000Z');
  const nextDay = new Date('2026-10-20T00:00:00.000Z');
  const nextWeek = new Date('2026-10-26T00:00:00.000Z');

  const first = getCurrentRecurringQuests(monday);
  const repeated = getCurrentRecurringQuests(sameDay);
  const tomorrow = getCurrentRecurringQuests(nextDay);
  const nextMonday = getCurrentRecurringQuests(nextWeek);

  assert.deepEqual(first.map(quest => quest.id), repeated.map(quest => quest.id));
  assert.notEqual(first.find(quest => quest.period === 'daily')?.id, tomorrow.find(quest => quest.period === 'daily')?.id);
  assert.equal(first.find(quest => quest.period === 'weekly')?.id, tomorrow.find(quest => quest.period === 'weekly')?.id);
  assert.notEqual(first.find(quest => quest.period === 'weekly')?.id, nextMonday.find(quest => quest.period === 'weekly')?.id);
  assert.equal(first.filter(quest => quest.period === 'daily').length, 4);
  assert.equal(first.filter(quest => quest.period === 'weekly').length, 8);
  const dailyWins = first.find(quest => quest.id.includes('daily-victory'))!;
  const weeklyWins = first.find(quest => quest.id.includes('weekly-wins'))!;
  assert.equal(dailyWins.goals[0].targetValue, 4);
  assert.equal(dailyWins.rewards[0].value, '400');
  assert.equal(weeklyWins.goals[0].type, 'win_battles_with_chars');
  assert.equal(weeklyWins.goals[0].targetValue, 20);
  assert.equal(weeklyWins.rewards.find(reward => reward.type === 'ryos')?.value, '1500');
});

test('recurring mission points unlock exactly four daily and eight weekly chests', () => {
  const quests = getCurrentRecurringQuests(new Date('2026-10-21T12:00:00.000Z'));
  const daily = quests.filter(quest => quest.period === 'daily');
  const weekly = quests.filter(quest => quest.period === 'weekly');
  const progress = Object.fromEntries([daily[0], weekly[0]].map(quest => [
    quest.id,
    [{ id: quest.goals[0].id, currentValue: quest.goals[0].targetValue }],
  ]));

  assert.equal(daily.length, 4);
  assert.equal(weekly.length, 8);
  assert.equal(daily.every(quest => quest.recurringPoints === 25), true);
  assert.equal(weekly.every(quest => quest.recurringPoints === 25), true);
  assert.equal(calculateRecurringPoints('daily', quests, progress), 25);
  assert.equal(calculateRecurringPoints('weekly', quests, progress), 25);
  assert.equal(getRecurringChestTiers('daily').length, 4);
  assert.equal(getRecurringChestTiers('weekly').length, 8);
  assert.equal(getRecurringChestTiers('weekly').at(-1)?.points, 200);
  assert.equal(getRecurringChestClaimId('daily', 1, new Date('2026-10-21T12:00:00.000Z')), 'daily-2026-10-21-chest-1');
  assert.equal(isRecurringChestUnlocked('daily', 4, 100, []), false);
  assert.equal(isRecurringChestUnlocked('daily', 2, 50, [
    getRecurringChestClaimId('daily', 1),
  ]), true);
});

test('distinct-character skill goals count each character once per battle', () => {
  const quest = getCurrentRecurringQuests(new Date('2026-10-21T12:00:00.000Z'))
    .find(item => item.id.includes('daily-squad'))!;
  const goal = quest.goals[0];
  const stats: QuestBattleStats = {
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
    skillUseRecords: [
      { charName: 'Naruto Uzumaki', tags: [], skillName: 'Rasengan' },
      { charName: ' Naruto Uzumaki ', tags: [], skillName: 'Clone Technique' },
      { charName: 'Sasuke Uchiha', tags: [], skillName: 'Fireball' },
      { charName: 'Sakura Haruno', tags: [], skillName: 'Healing' },
    ],
  };

  assert.equal(evaluateAuthoritativeQuestGoal(goal, false, stats).nextValue, 3);
  assert.equal(evaluateAuthoritativeQuestGoal({ ...goal, currentValue: 3 }, false, stats).nextValue, 3);
});