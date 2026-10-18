import type { CardRarity } from '../types';
import { CARD_ROULETTE_CHANCES, isValidCardRouletteChances } from './cardRoulette';
import { configFetch } from './api';

export type CardRouletteChances = Record<CardRarity, number>;

export async function fetchCardRouletteChances(): Promise<CardRouletteChances> {
  try {
    const response = await fetch('/api/cards/roulette-settings');
    if (!response.ok) {
      console.error(`Falha ao carregar chances da roleta (HTTP ${response.status}).`);
      return { ...CARD_ROULETTE_CHANCES };
    }
    const result = await response.json() as { success?: boolean; chances?: unknown };
    if (!result.success || !isValidCardRouletteChances(result.chances)) {
      console.error('O servidor retornou chances de roleta inválidas.');
      return { ...CARD_ROULETTE_CHANCES };
    }
    return result.chances;
  } catch (error) {
    console.error('Falha ao consultar as chances da roleta:', error);
    return { ...CARD_ROULETTE_CHANCES };
  }
}

export async function saveCardRouletteChances(chances: CardRouletteChances): Promise<void> {
  if (!isValidCardRouletteChances(chances)) {
    throw new Error('As chances de todas as raridades devem somar 100%.');
  }
  const response = await configFetch('/api/cards/roulette-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chances }),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `Falha ao salvar as chances (HTTP ${response.status}).`);
  }
}
