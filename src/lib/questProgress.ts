import type { QuestGoal } from '../types';

export interface QuestBattleStats {
  damageDealt: number;
  damageReceived: number;
  healingDone: number;
  shieldGenerated: number;
  stunsApplied: number;
  countersReflects?: number;
  skillsUsed: Record<string, number>;
  killsWithSkill: Record<string, number>;
  playerCharactersUsed: string[];
  playerTeamCharacters: Array<{ name: string; tags: string[] }>;
  damageDealtRecords: Array<{ charName: string; tags: string[]; skillName: string; amount: number }>;
  damageReceivedRecords: Array<{ charName: string; tags: string[]; amount: number }>;
  healingDoneRecords: Array<{ charName: string; tags: string[]; skillName: string; amount: number }>;
  shieldGeneratedRecords: Array<{ charName: string; tags: string[]; skillName: string; amount: number }>;
  killRecords: Array<{ charName: string; tags: string[]; skillName: string }>;
  counterRecords: Array<{ charName: string; tags: string[]; skillName: string }>;
  skillUseRecords: Array<{ charName: string; tags: string[]; skillName: string }>;
}

export function evaluateAuthoritativeQuestGoal(
  goal: QuestGoal,
  victory: boolean,
  stats: QuestBattleStats,
): { nextValue: number; nextStreak: number } {
  let valueToAdd = 0;
  let nextStreak = goal.currentStreak || 0;
  let currentValue = goal.singleMatch ? 0 : goal.currentValue;

  const matchesCharacter = (name: string) =>
    !goal.targetCharacters?.length || goal.targetCharacters.includes(name);
  const matchesSkill = (name: string) =>
    !goal.targetSkill?.trim() || name.toLowerCase() === goal.targetSkill.trim().toLowerCase();
  const matchesTags = (tags: string[]) =>
    !goal.targetTags?.length || goal.targetTags.some(tag =>
      tags.some(candidate => candidate.toLowerCase() === tag.toLowerCase()),
    );

  switch (goal.type) {
    case 'win_battles_with_chars': {
      if (victory &&
          (!goal.targetCharacters?.length || goal.targetCharacters.every(name =>
            stats.playerCharactersUsed.includes(name),
          )) &&
          (!goal.targetTags?.length || stats.playerTeamCharacters.some(character =>
            character.tags.some(tag => goal.targetTags!.some(target => tag.toLowerCase() === target.toLowerCase())),
          ))) {
        valueToAdd = 1;
      }
      break;
    }
    case 'win_consecutive_battles_with_chars': {
      const matchesCharacters = !goal.targetCharacters?.length ||
        goal.targetCharacters.every(name => stats.playerCharactersUsed.includes(name));
      const matchesTeamTags = !goal.targetTags?.length ||
        stats.playerTeamCharacters.some(character =>
          character.tags.some(tag => goal.targetTags!.some(target => tag.toLowerCase() === target.toLowerCase())),
        );
      if (matchesCharacters && matchesTeamTags && victory) {
        nextStreak += 1;
        valueToAdd = 1;
      } else if (!victory) {
        nextStreak = 0;
        currentValue = 0;
      }
      break;
    }
    case 'win_battles_with_tag': {
      const requiredTag = goal.targetTags?.[0]?.toLowerCase();
      if (victory && requiredTag && stats.playerTeamCharacters.filter(character =>
        character.tags.some(tag => tag.toLowerCase() === requiredTag || tag.toLowerCase().includes(requiredTag)),
      ).length >= 3) valueToAdd = 1;
      break;
    }
    case 'use_skill':
      valueToAdd = stats.skillUseRecords.filter(record =>
        matchesCharacter(record.charName) && matchesSkill(record.skillName) && matchesTags(record.tags),
      ).length;
      break;
    case 'heal':
      valueToAdd = stats.healingDoneRecords.filter(record =>
        matchesCharacter(record.charName) && matchesSkill(record.skillName) && matchesTags(record.tags),
      ).reduce((sum, record) => sum + record.amount, 0);
      break;
    case 'kill_with_skill':
      valueToAdd = stats.killRecords.filter(record =>
        matchesCharacter(record.charName) && matchesSkill(record.skillName) && matchesTags(record.tags),
      ).length;
      break;
    case 'shield':
      valueToAdd = stats.shieldGeneratedRecords.filter(record =>
        matchesCharacter(record.charName) && matchesSkill(record.skillName) && matchesTags(record.tags),
      ).reduce((sum, record) => sum + record.amount, 0);
      break;
    case 'damage_dealt':
      valueToAdd = stats.damageDealtRecords.filter(record =>
        matchesCharacter(record.charName) && matchesSkill(record.skillName) && matchesTags(record.tags),
      ).reduce((sum, record) => sum + record.amount, 0);
      break;
    case 'damage_received':
      valueToAdd = stats.damageReceivedRecords.filter(record =>
        matchesCharacter(record.charName) && matchesTags(record.tags),
      ).reduce((sum, record) => sum + record.amount, 0);
      break;
    case 'stun_enemy':
      valueToAdd = stats.stunsApplied;
      break;
    case 'counter_cancel_skill':
      valueToAdd = stats.counterRecords.filter(record =>
        matchesCharacter(record.charName) && matchesSkill(record.skillName) && matchesTags(record.tags),
      ).length;
      break;
  }

  return {
    nextValue: Math.min(goal.targetValue, currentValue + valueToAdd),
    nextStreak,
  };
}
