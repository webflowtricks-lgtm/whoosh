import { safeFetchJson, saveGlobalConfig } from './api';

export const DEFAULT_AI_ENEMY_CHARACTER_LIMIT = 69;

export interface AiMatchSettings {
  maxEnemyCharacterNumber: number;
}

function normalizeLimit(value: unknown): number {
  if (!Number.isFinite(value)) return DEFAULT_AI_ENEMY_CHARACTER_LIMIT;
  return Math.max(3, Math.trunc(Number(value)));
}

export async function fetchAiMatchSettings(): Promise<AiMatchSettings> {
  const data = await safeFetchJson<{
    success?: boolean;
    settings?: Array<Partial<AiMatchSettings>>;
  }>('/api/ai-settings');
  if (!data?.success || !Array.isArray(data.settings)) {
    throw new Error('Não foi possível carregar as configurações de batalha contra IA.');
  }
  return {
    maxEnemyCharacterNumber: normalizeLimit(data.settings[0]?.maxEnemyCharacterNumber),
  };
}

export async function saveAiMatchSettings(settings: AiMatchSettings): Promise<void> {
  await saveGlobalConfig('/api/ai-settings', {
    settings: [{ maxEnemyCharacterNumber: normalizeLimit(settings.maxEnemyCharacterNumber) }],
  });
}
