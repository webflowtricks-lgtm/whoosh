import type { QuestGoal } from '../types';

export interface QuestBattleStats {
  damageDealt: number;
  damageReceived: number;
  healingDone: number;
  shieldGenerated: number;
  stunsApplied: number;
  countersReflects?: number;
  chakraGenerated?: number;
  chakraStolen?: number;
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

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function sanitizeRecords<T extends object>(
  value: unknown,
  fields: Array<keyof T>,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const records: T[] = [];
  for (const entry of value.slice(0, 100)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const record: Record<string, unknown> = {};
    for (const field of fields) {
      if (field === 'tags') {
        const tags = (entry as Record<string, unknown>).tags;
        if (!Array.isArray(tags) || tags.length > 50) return null;
        const safeTags = tags.map(tag => boundedString(tag, 80));
        if (safeTags.some(tag => !tag)) return null;
        record.tags = safeTags;
      } else if (field === 'amount') {
        const amount = (entry as Record<string, unknown>).amount;
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
        record.amount = Math.min(1_000_000, Math.trunc(amount));
      } else {
        const text = boundedString((entry as Record<string, unknown>)[String(field)], 100);
        if (!text) return null;
        record[String(field)] = text;
      }
    }
    records.push(record as T);
  }
  return records;
}

export function sanitizeQuestBattleStats(value: unknown): QuestBattleStats | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const playerCharactersUsed = raw.playerCharactersUsed;
  const playerTeamCharacters = raw.playerTeamCharacters;
  const skillsUsed = raw.skillsUsed;
  const killsWithSkill = raw.killsWithSkill;
  if (!Array.isArray(playerCharactersUsed) || playerCharactersUsed.length > 3 ||
      !Array.isArray(playerTeamCharacters) || playerTeamCharacters.length > 3 ||
      !skillsUsed || typeof skillsUsed !== 'object' || Array.isArray(skillsUsed) ||
      !killsWithSkill || typeof killsWithSkill !== 'object' || Array.isArray(killsWithSkill)) {
    return null;
  }
  const safeNames = playerCharactersUsed.map(name => boundedString(name, 100));
  if (safeNames.some(name => !name)) return null;
  const safeTeam = playerTeamCharacters.map(character => {
    if (!character || typeof character !== 'object' || Array.isArray(character)) return null;
    const item = character as Record<string, unknown>;
    const name = boundedString(item.name, 100);
    if (!name || !Array.isArray(item.tags) || item.tags.length > 50) return null;
    const tags = item.tags.map(tag => boundedString(tag, 80));
    if (tags.some(tag => !tag)) return null;
    return { name, tags: tags as string[] };
  });
  if (safeTeam.some(character => !character)) return null;

  const safeCounts = (counts: unknown): Record<string, number> | null => {
    const entries = Object.entries(counts as Record<string, unknown>);
    if (entries.length > 100) return null;
    const result: Record<string, number> = {};
    for (const [name, count] of entries) {
      if (!boundedString(name, 100) || typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        return null;
      }
      result[name.slice(0, 100)] = Math.min(1_000_000, Math.trunc(count));
    }
    return result;
  };
  const safeSkills = safeCounts(skillsUsed);
  const safeKills = safeCounts(killsWithSkill);
  if (!safeSkills || !safeKills) return null;

  const numberField = (field: string) => {
    const number = raw[field];
    return typeof number === 'number' && Number.isFinite(number) && number >= 0
      ? Math.min(1_000_000, Math.trunc(number))
      : null;
  };
  const damageDealt = numberField('damageDealt');
  const damageReceived = numberField('damageReceived');
  const healingDone = numberField('healingDone');
  const shieldGenerated = numberField('shieldGenerated');
  const stunsApplied = numberField('stunsApplied');
  if ([damageDealt, damageReceived, healingDone, shieldGenerated, stunsApplied].some(item => item === null)) {
    return null;
  }

  const damageDealtRecords = sanitizeRecords<QuestBattleStats['damageDealtRecords'][number]>(
    raw.damageDealtRecords, ['charName', 'tags', 'skillName', 'amount'],
  );
  const damageReceivedRecords = sanitizeRecords<QuestBattleStats['damageReceivedRecords'][number]>(
    raw.damageReceivedRecords, ['charName', 'tags', 'amount'],
  );
  const healingDoneRecords = sanitizeRecords<QuestBattleStats['healingDoneRecords'][number]>(
    raw.healingDoneRecords, ['charName', 'tags', 'skillName', 'amount'],
  );
  const shieldGeneratedRecords = sanitizeRecords<QuestBattleStats['shieldGeneratedRecords'][number]>(
    raw.shieldGeneratedRecords, ['charName', 'tags', 'skillName', 'amount'],
  );
  const killRecords = sanitizeRecords<QuestBattleStats['killRecords'][number]>(
    raw.killRecords, ['charName', 'tags', 'skillName'],
  );
  const counterRecords = sanitizeRecords<QuestBattleStats['counterRecords'][number]>(
    raw.counterRecords, ['charName', 'tags', 'skillName'],
  );
  const skillUseRecords = sanitizeRecords<QuestBattleStats['skillUseRecords'][number]>(
    raw.skillUseRecords, ['charName', 'tags', 'skillName'],
  );
  if (!damageDealtRecords || !damageReceivedRecords || !healingDoneRecords ||
      !shieldGeneratedRecords || !killRecords || !counterRecords || !skillUseRecords) {
    return null;
  }

  return {
    damageDealt, damageReceived, healingDone, shieldGenerated, stunsApplied,
    countersReflects: numberField('countersReflects') ?? 0,
    skillsUsed: safeSkills,
    killsWithSkill: safeKills,
    playerCharactersUsed: safeNames as string[],
    playerTeamCharacters: safeTeam as Array<{ name: string; tags: string[] }>,
    damageDealtRecords,
    damageReceivedRecords,
    healingDoneRecords,
    shieldGeneratedRecords,
    killRecords,
    counterRecords,
    skillUseRecords,
  };
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
