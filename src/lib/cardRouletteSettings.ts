import type { CardRarity } from '../types';
import {
  CARD_ROULETTE_CHANCES,
  CARD_ROULETTE_COST,
  isValidCardRouletteChances,
  isValidCardRouletteCost,
} from './cardRoulette';
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

export async function fetchCardRouletteCost(): Promise<number> {
  try {
    const response = await fetch('/api/cards/roulette-cost');
    if (!response.ok) {
      console.error(`Falha ao carregar o custo da roleta (HTTP ${response.status}).`);
      return CARD_ROULETTE_COST;
    }
    const result = await response.json() as { success?: boolean; cost?: unknown };
    if (!result.success || !isValidCardRouletteCost(result.cost)) {
      console.error('O servidor retornou um custo de roleta inválido.');
      return CARD_ROULETTE_COST;
    }
    return result.cost;
  } catch (error) {
    console.error('Falha ao consultar o custo da roleta:', error);
    return CARD_ROULETTE_COST;
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

export async function saveCardRouletteCost(cost: number): Promise<void> {
  if (!isValidCardRouletteCost(cost)) {
    throw new Error('O custo da roleta deve ser um número inteiro igual ou maior que zero.');
  }
  const response = await configFetch('/api/cards/roulette-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cost }),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `Falha ao salvar o custo (HTTP ${response.status}).`);
  }
}
