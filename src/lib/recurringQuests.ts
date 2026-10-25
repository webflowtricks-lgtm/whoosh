import type { Quest, QuestGoal, QuestReward, RecurringQuestSettings } from '../types';

type RecurringQuestTemplate = Pick<Quest, 'id' | 'title' | 'desc' | 'goals' | 'rewards' | 'recurringPoints'>;

const DAILY_TEMPLATES: RecurringQuestTemplate[] = [
  {
    id: 'daily-victory',
    title: 'Ritual Diário: Vitórias',
    desc: 'Vença 5 batalhas.',
    goals: [{ id: 'win', type: 'win_battles_with_chars', targetValue: 5, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '400' }],
    recurringPoints: 25,
  },
  {
    id: 'daily-technique',
    title: 'Ritual Diário: Treinamento',
    desc: 'Use 40 habilidades em batalhas.',
    goals: [{ id: 'skills', type: 'use_skill', targetValue: 40, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '350' }],
    recurringPoints: 25,
  },
  {
    id: 'daily-squad',
    title: 'Ritual Diário: Trabalho em Equipe',
    desc: 'Use habilidades com 3 personagens diferentes em uma mesma batalha.',
    goals: [{
      id: 'characters',
      type: 'use_skill',
      targetValue: 3,
      currentValue: 0,
      distinctCharacters: true,
      singleMatch: true,
    }],
    rewards: [{ type: 'ryos', value: '500' }],
    recurringPoints: 25,
  },
  {
    id: 'daily-damage',
    title: 'Ritual Diário: Pressão Ofensiva',
    desc: 'Cause 1.500 pontos de dano em batalhas.',
    goals: [{ id: 'damage', type: 'damage_dealt', targetValue: 1500, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '400' }],
    recurringPoints: 25,
  },
];

const WEEKLY_TEMPLATES: RecurringQuestTemplate[] = [
  {
    id: 'weekly-wins',
    title: 'Desafio Semanal: Maratona Shinobi',
    desc: 'Vença 20 batalhas contra a IA ou outros jogadores durante a semana.',
    goals: [{ id: 'wins', type: 'win_battles_with_chars', targetValue: 20, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1500' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-technique',
    title: 'Desafio Semanal: Domínio de Chakra',
    desc: 'Use 250 habilidades em batalhas durante a semana.',
    goals: [{ id: 'skills', type: 'use_skill', targetValue: 250, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1200' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-damage',
    title: 'Desafio Semanal: Campo de Batalha',
    desc: 'Cause 25.000 pontos de dano em batalhas durante a semana.',
    goals: [{ id: 'damage', type: 'damage_dealt', targetValue: 25000, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1500' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-shield',
    title: 'Desafio Semanal: Defesa Inabalável',
    desc: 'Gere 6.000 pontos de escudo durante a semana.',
    goals: [{ id: 'shield', type: 'shield', targetValue: 6000, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1500' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-healing',
    title: 'Desafio Semanal: Apoio Médico',
    desc: 'Cure 3.000 pontos de vida durante a semana.',
    goals: [{ id: 'healing', type: 'heal', targetValue: 3000, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1200' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-stuns',
    title: 'Desafio Semanal: Controle de Campo',
    desc: 'Atordoe inimigos 25 vezes durante a semana.',
    goals: [{ id: 'stuns', type: 'stun_enemy', targetValue: 25, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1200' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-kills',
    title: 'Desafio Semanal: Caçador de Shinobi',
    desc: 'Derrote 15 inimigos usando habilidades durante a semana.',
    goals: [{ id: 'kills', type: 'kill_with_skill', targetValue: 15, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1500' }],
    recurringPoints: 25,
  },
  {
    id: 'weekly-counters',
    title: 'Desafio Semanal: Resposta Perfeita',
    desc: 'Contra-ataque, anule ou reflita 20 habilidades durante a semana.',
    goals: [{ id: 'counters', type: 'counter_cancel_skill', targetValue: 20, currentValue: 0 }],
    rewards: [{ type: 'ryos', value: '1500' }],
    recurringPoints: 25,
  },
];

function getIsoWeek(date: Date): string {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function instantiate(
  templates: RecurringQuestTemplate[],
  period: 'daily' | 'weekly',
  periodKey: string,
  settings: RecurringQuestSettings,
): Quest[] {
  return templates.map(template => {
    const id = `${period}-${periodKey}-${template.id}`;
    const goals: QuestGoal[] = template.goals.map(goal => ({
      ...goal,
      id: `${id}-${goal.id}`,
      currentValue: 0,
      currentStreak: 0,
    }));
    return {
      ...template,
      id,
      desc: `${template.desc} Renova ${period === 'daily' ? 'diariamente (UTC)' : 'toda segunda-feira (UTC)'}.`,
      coverUrl: '/static/img/icon/default.jpg',
      minRank: 'Estudante de Academia',
      category: period,
      period,
      recurringKey: template.id,
      requiredQuestIds: [],
      goals,
      rewards: (settings.missionRewards[template.id] || template.rewards).map(reward => ({ ...reward })),
      recurringPoints: template.recurringPoints,
      completed: false,
    };
  });
}

export function getCurrentRecurringQuests(
  now = new Date(),
  settings = getDefaultRecurringQuestSettings(),
): Quest[] {
  const dailyKey = now.toISOString().slice(0, 10);
  return [
    ...instantiate(DAILY_TEMPLATES, 'daily', dailyKey, settings),
    ...instantiate(WEEKLY_TEMPLATES, 'weekly', getIsoWeek(now), settings),
  ];
}

export interface RecurringChestTier {
  tier: number;
  points: number;
  rewards: QuestReward[];
}

const DAILY_CHESTS: RecurringChestTier[] = [
  { tier: 1, points: 25, rewards: [{ type: 'ryos', value: '400' }] },
  { tier: 2, points: 50, rewards: [{ type: 'ryos', value: '650' }] },
  { tier: 3, points: 75, rewards: [{ type: 'ryos', value: '900' }] },
  { tier: 4, points: 100, rewards: [{ type: 'ryos', value: '1500' }, { type: 'gems', value: '2' }] },
];

const WEEKLY_CHESTS: RecurringChestTier[] = [
  { tier: 1, points: 25, rewards: [{ type: 'ryos', value: '1500' }] },
  { tier: 2, points: 50, rewards: [{ type: 'ryos', value: '2500' }] },
  { tier: 3, points: 75, rewards: [{ type: 'ryos', value: '3500' }] },
  { tier: 4, points: 100, rewards: [{ type: 'ryos', value: '5000' }, { type: 'gems', value: '5' }] },
  { tier: 5, points: 125, rewards: [{ type: 'ryos', value: '6500' }] },
  { tier: 6, points: 150, rewards: [{ type: 'ryos', value: '8000' }, { type: 'gems', value: '10' }] },
  { tier: 7, points: 175, rewards: [{ type: 'ryos', value: '10000' }, { type: 'gems', value: '15' }] },
  { tier: 8, points: 200, rewards: [{ type: 'ryos', value: '15000' }, { type: 'gems', value: '25' }] },
];

export function getDefaultRecurringQuestSettings(): RecurringQuestSettings {
  return {
    missionRewards: Object.fromEntries([...DAILY_TEMPLATES, ...WEEKLY_TEMPLATES].map(template => [
      template.id,
      template.rewards.map(reward => ({ ...reward })),
    ])),
    chestRewards: {
      daily: DAILY_CHESTS.map(chest => chest.rewards.map(reward => ({ ...reward }))),
      weekly: WEEKLY_CHESTS.map(chest => chest.rewards.map(reward => ({ ...reward }))),
    },
  };
}

export function getRecurringChestTiers(
  period: 'daily' | 'weekly',
  settings = getDefaultRecurringQuestSettings(),
): RecurringChestTier[] {
  const defaults = period === 'daily' ? DAILY_CHESTS : WEEKLY_CHESTS;
  return defaults.map((chest, index) => ({
    ...chest,
    rewards: (settings.chestRewards[period][index] || chest.rewards).map(reward => ({ ...reward })),
  }));
}

export function isValidRecurringQuestRewards(value: unknown): value is QuestReward[] {
  const rewardTypes: QuestReward['type'][] = [
    'title', 'unlock_character', 'frame', 'banner', 'card', 'skill_skin', 'card_pack', 'ryos', 'gems',
  ];
  return Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const reward = item as Record<string, unknown>;
    if (!rewardTypes.includes(reward.type as QuestReward['type']) ||
        typeof reward.value !== 'string' || !reward.value.trim() || reward.value.length > 2048) return false;
    if (reward.type === 'ryos' || reward.type === 'gems' || reward.type === 'card_pack') {
      const amount = Number(reward.value);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > (reward.type === 'card_pack' ? 50 : 1_000_000_000)) {
        return false;
      }
    }
    if (reward.imageUrl !== undefined && (typeof reward.imageUrl !== 'string' || reward.imageUrl.length > 2048)) {
      return false;
    }
    return true;
  });
}

export function isValidRecurringQuestSettings(value: unknown): value is RecurringQuestSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  const defaults = getDefaultRecurringQuestSettings();
  const missionRewards = settings.missionRewards;
  const chestRewards = settings.chestRewards;
  if (!missionRewards || typeof missionRewards !== 'object' || Array.isArray(missionRewards) ||
      !chestRewards || typeof chestRewards !== 'object' || Array.isArray(chestRewards)) return false;
  const missions = missionRewards as Record<string, unknown>;
  const chests = chestRewards as Record<string, unknown>;
  if (!Object.keys(defaults.missionRewards).every(key => isValidRecurringQuestRewards(missions[key]))) return false;
  return (['daily', 'weekly'] as const).every(period => {
    const rewards = chests[period];
    return Array.isArray(rewards) && rewards.length === defaults.chestRewards[period].length &&
      rewards.every(isValidRecurringQuestRewards);
  });
}

export function getRecurringPeriodId(period: 'daily' | 'weekly', now = new Date()): string {
  const key = period === 'daily' ? now.toISOString().slice(0, 10) : getIsoWeek(now);
  return `${period}-${key}`;
}

export function getRecurringChestClaimId(
  period: 'daily' | 'weekly',
  tier: number,
  now = new Date(),
): string {
  return `${getRecurringPeriodId(period, now)}-chest-${tier}`;
}

export function isRecurringChestUnlocked(
  period: 'daily' | 'weekly',
  tier: number,
  points: number,
  claimedIds: string[],
  now = new Date(),
): boolean {
  const chest = getRecurringChestTiers(period).find(item => item.tier === tier);
  if (!chest || points < chest.points) return false;
  return tier === 1 || claimedIds.includes(getRecurringChestClaimId(period, tier - 1, now));
}

export function calculateRecurringPoints(
  period: 'daily' | 'weekly',
  quests: Quest[],
  progress: Record<string, Array<{ id: string; currentValue: number }>>,
): number {
  return quests
    .filter(quest => quest.period === period && quest.recurringPoints)
    .reduce((total, quest) => {
      const savedGoals = new Map((progress[quest.id] || []).map(goal => [goal.id, goal.currentValue]));
      const complete = quest.goals.length > 0 && quest.goals.every(goal =>
        Number(savedGoals.get(goal.id)) >= goal.targetValue,
      );
      return total + (complete ? quest.recurringPoints || 0 : 0);
    }, 0);
}