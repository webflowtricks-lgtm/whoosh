import { safeFetchJson } from './api';

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
  const response = await fetch('/api/ai-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: [{ maxEnemyCharacterNumber: normalizeLimit(settings.maxEnemyCharacterNumber) }],
    }),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || 'Não foi possível salvar as configurações de batalha contra IA.');
  }
}
