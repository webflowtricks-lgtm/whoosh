import type { NinjaEvent } from '../types';
import type { QuestBattleStats } from './questProgress';

export type TrackedEventProgress = Record<string, Record<string, number>>;

export const UCHIHA_EVENT_ID = 'lacos-uchiha-sasuke-itachi';
export const UCHIHA_EVENT_STARTED_AT = '2026-10-24T15:05:00-03:00';

export function getEventTimeRemaining(
  event: Pick<NinjaEvent, 'durationDays' | 'startedAt'>,
  now: number,
): { days: number; hours: number; expired: boolean } | null {
  const durationDays = Number(event.durationDays);
  const startedAt = Date.parse(event.startedAt || '');
  if (!Number.isSafeInteger(durationDays) || durationDays < 1 || !Number.isFinite(startedAt)) return null;

  const remainingMs = startedAt + durationDays * 24 * 60 * 60 * 1000 - now;
  if (remainingMs <= 0) return { days: 0, hours: 0, expired: true };

  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  return {
    days: Math.floor(remainingHours / 24),
    hours: remainingHours % 24,
    expired: false,
  };
}

export const UCHIHA_EVENT: NinjaEvent = {
  id: UCHIHA_EVENT_ID,
  title: 'Laços de Sangue: Sasuke & Itachi',
  subtitle: 'Desafio especial do Clã Uchiha',
  description: 'Lute ao lado dos irmãos Uchiha em batalhas contra a IA e online. Vença, use suas habilidades e prove sua força para conquistar prêmios surpresa.',
  bannerUrl: '/static/img/banners/banner_itachi_sasuke.webp',
  badge: 'EVENTO UCHIHA',
  timeLeft: 'Evento especial',
  durationDays: 30,
  startedAt: UCHIHA_EVENT_STARTED_AT,
  featured: true,
  objectives: [
    {
      id: 'uchiha-sasuke-wins',
      description: 'Vença 5 batalhas com Sasuke na equipe',
      current: 0,
      target: 5,
      rewardType: 'ryos',
      rewardValue: 500,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'win_with_character',
      characterId: 'sasuke',
      rewardOptions: [
        { type: 'ryos', value: 500, label: '500 Moedas' },
        { type: 'ryos', value: 900, label: '900 Moedas' },
        { type: 'gems', value: 15, label: '15 Gems' },
      ],
    },
    {
      id: 'uchiha-itachi-wins',
      description: 'Vença 5 batalhas com Itachi na equipe',
      current: 0,
      target: 5,
      rewardType: 'ryos',
      rewardValue: 500,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'win_with_character',
      characterId: 'itachi',
      rewardOptions: [
        { type: 'ryos', value: 500, label: '500 Moedas' },
        { type: 'ryos', value: 900, label: '900 Moedas' },
        { type: 'gems', value: 15, label: '15 Gems' },
      ],
    },
    {
      id: 'uchiha-sasuke-skills',
      description: 'Use 30 habilidades com Sasuke',
      current: 0,
      target: 30,
      rewardType: 'ryos',
      rewardValue: 500,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'skills_with_character',
      characterId: 'sasuke',
      rewardOptions: [
        { type: 'ryos', value: 600, label: '600 Moedas' },
        { type: 'ryos', value: 1000, label: '1.000 Moedas' },
        { type: 'gems', value: 20, label: '20 Gems' },
      ],
    },
    {
      id: 'uchiha-itachi-skills',
      description: 'Use 30 habilidades com Itachi',
      current: 0,
      target: 30,
      rewardType: 'ryos',
      rewardValue: 500,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'skills_with_character',
      characterId: 'itachi',
      rewardOptions: [
        { type: 'ryos', value: 600, label: '600 Moedas' },
        { type: 'ryos', value: 1000, label: '1.000 Moedas' },
        { type: 'gems', value: 20, label: '20 Gems' },
      ],
    },
    {
      id: 'uchiha-sasuke-damage',
      description: 'Cause 10.000 de dano usando Sasuke',
      current: 0,
      target: 10000,
      rewardType: 'ryos',
      rewardValue: 750,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'damage_with_character',
      characterId: 'sasuke',
      rewardOptions: [
        { type: 'ryos', value: 750, label: '750 Moedas' },
        { type: 'ryos', value: 1250, label: '1.250 Moedas' },
        { type: 'gems', value: 25, label: '25 Gems' },
      ],
    },
    {
      id: 'uchiha-itachi-damage',
      description: 'Cause 10.000 de dano usando Itachi',
      current: 0,
      target: 10000,
      rewardType: 'ryos',
      rewardValue: 750,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'damage_with_character',
      characterId: 'itachi',
      rewardOptions: [
        { type: 'ryos', value: 750, label: '750 Moedas' },
        { type: 'ryos', value: 1250, label: '1.250 Moedas' },
        { type: 'gems', value: 25, label: '25 Gems' },
      ],
    },
    {
      id: 'uchiha-sasuke-team-damage',
      description: 'Receba 5.000 de dano em batalhas com Sasuke na equipe',
      current: 0,
      target: 5000,
      rewardType: 'ryos',
      rewardValue: 750,
      rewardLabel: 'Prêmio surpresa',
      tracker: 'damage_received_with_character',
      characterId: 'sasuke',
      rewardOptions: [
        { type: 'ryos', value: 750, label: '750 Moedas' },
        { type: 'ryos', value: 1250, label: '1.250 Moedas' },
        { type: 'gems', value: 25, label: '25 Gems' },
      ],
    },
  ],
};

export function withUchihaEvent(events: NinjaEvent[] | null | undefined): NinjaEvent[] {
  const configured = Array.isArray(events) ? events : [];
  return configured.some(event => event.id === UCHIHA_EVENT_ID)
    ? configured.map(event => event.id === UCHIHA_EVENT_ID
      ? {
        ...event,
        durationDays: event.durationDays ?? UCHIHA_EVENT.durationDays,
        startedAt: event.startedAt ?? UCHIHA_EVENT.startedAt,
      }
      : event)
    : [...configured, UCHIHA_EVENT];
}

function characterMatches(name: string | undefined, characterId: string): boolean {
  if (!name) return false;
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  return normalizedName === characterId || normalizedName.startsWith(`${characterId} `);
}

export function updateTrackedEventProgress(
  current: TrackedEventProgress | undefined,
  stats: QuestBattleStats,
  victory: boolean,
  event: NinjaEvent = UCHIHA_EVENT,
): TrackedEventProgress {
  const progress: TrackedEventProgress = { ...(current || {}) };
  const eventProgress = { ...(progress[event.id] || {}) };
  const hasCharacter = (characterId: string) =>
    stats.playerTeamCharacters.some(character => characterMatches(character.name, characterId));

  for (const objective of event.objectives) {
    const previous = Math.max(0, Number(eventProgress[objective.id]) || 0);
    let gained = 0;
    if (objective.tracker === 'win_with_character' && victory && hasCharacter(objective.characterId || '')) {
      gained = 1;
    } else if (objective.tracker === 'skills_with_character') {
      gained = stats.skillUseRecords.filter(record =>
        characterMatches(record.charName, objective.characterId || ''),
      ).length;
    } else if (objective.tracker === 'damage_with_character') {
      gained = stats.damageDealtRecords.reduce((total, record) =>
        total + (characterMatches(record.charName, objective.characterId || '') ? record.amount : 0),
      0);
    } else if (
      objective.tracker === 'damage_received_with_character' &&
      hasCharacter(objective.characterId || '')
    ) {
      gained = stats.damageReceived;
    }
    eventProgress[objective.id] = Math.min(objective.target, previous + Math.max(0, Math.trunc(gained)));
  }

  progress[event.id] = eventProgress;
  return progress;
}

export function chooseUchihaEventReward(
  objectiveId: string,
  random: () => number,
  event: NinjaEvent = UCHIHA_EVENT,
): NonNullable<NinjaEvent['objectives'][number]['rewardOptions']>[number] | null {
  const objective = event.objectives.find(item => item.id === objectiveId);
  const options = objective?.rewardOptions?.length
    ? objective.rewardOptions
    : objective && (objective.rewardType === 'ryos' || objective.rewardType === 'gems')
      ? [{ type: objective.rewardType, value: Number(objective.rewardValue), label: objective.rewardLabel }]
      : [];
  if (!options.length) return null;
  const index = Math.min(options.length - 1, Math.max(0, Math.floor(random() * options.length)));
  return options[index];
}
