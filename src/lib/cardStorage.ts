/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NinjaCard, CardRarity, NinjaPack, Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../data/characters';
import { safeFetchJson } from './api';

const STORAGE_KEY = 'naruto_cards';
const PACKS_STORAGE_KEY = 'naruto_card_packs';

// Raridades (metadados usados na galeria): cor da borda/brilho e pontos.
export const CARD_RARITY_META: Record<CardRarity, {
  label: string;
  points: number;
  border: string;
  glow: string;
  text: string;
  chip: string;
}> = {
  comum: {
    label: 'Comum',
    points: 1,
    border: 'border-slate-500',
    glow: 'shadow-slate-900/40',
    text: 'text-slate-300',
    chip: 'bg-slate-700/40 text-slate-300 border-slate-600',
  },
  raro: {
    label: 'Raro',
    points: 3,
    border: 'border-sky-500',
    glow: 'shadow-sky-500/20',
    text: 'text-sky-400',
    chip: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  },
  epico: {
    label: 'Épico',
    points: 8,
    border: 'border-fuchsia-500',
    glow: 'shadow-fuchsia-500/25',
    text: 'text-fuchsia-400',
    chip: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
  },
  lendario: {
    label: 'Lendário',
    points: 20,
    border: 'border-amber-400',
    glow: 'shadow-amber-400/30',
    text: 'text-amber-300',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
  },
  secreto: {
    label: 'Secreto',
    points: 50,
    border: 'border-red-500',
    glow: 'shadow-red-500/40',
    text: 'text-red-400',
    chip: 'bg-red-500/15 text-red-300 border-red-500/40',
  },
};

export const RARITY_ORDER: CardRarity[] = ['comum', 'raro', 'epico', 'lendario', 'secreto'];

// Classes de animação para raridades especiais (aplicadas nas figurinhas).
// Retorna { frame, sweep } com as classes de animação do frame e da linha de luz brilhante.
export function rarityFx(rarity: CardRarity): { frame: string; sweep: string } | null {
  switch (rarity) {
    case 'epico':
      return { frame: 'card-fx-epico', sweep: 'card-fx-sweep' };
    case 'lendario':
      return { frame: 'card-fx-lendario', sweep: 'card-fx-sweep' };
    case 'secreto':
      return { frame: 'card-fx-secreto', sweep: 'card-fx-sweep' };
    default:
      return null;
  }
}

// Gera um card comum padrão a partir de um personagem do roster.
function baseCard(char: Character, index: number): NinjaCard {
  return {
    id: `${char.id}-base`,
    characterId: char.id,
    characterName: char.name,
    slug: char.folder || char.id,
    rarity: 'comum',
    title: 'Figura Clássica',
    description: char.description || 'Figura colecionável do ninja lendário.',
    imageUrl: char.portrait || undefined,
    points: CARD_RARITY_META.comum.points,
  };
}

// Cards "estendidos": variantes de maior raridade para dar sabor à coleção.
// id fica atrelado ao personagem + variante (ex: kakashi-anbu).
interface VariantSeed {
  characterId: string;
  slug: string;
  rarity: CardRarity;
  title: string;
  description: string;
  variant: string;
}

const VARIANT_SEEDS: VariantSeed[] = [
  {
    characterId: 'kakashi',
    slug: 'kakashi',
    rarity: 'lendario',
    title: 'O Ninja Copiador',
    description: 'Guerreiro lendário de Konoha, mestre de mil jutsus, eterno mestre do Time 7.',
    variant: 'Lenda de Konoha',
  },
  {
    characterId: 'naruto',
    slug: 'naruto',
    rarity: 'secreto',
    title: 'Modo Sábio',
    description: 'O Jinchuriki da Nove Caudas desperta o modo sábio dos sapos para proteger a Vila.',
    variant: 'Modo Sábio',
  },
  {
    characterId: 'sasuke',
    slug: 'sasuke',
    rarity: 'secreto',
    title: 'Hereditariedade Amaldiçoada',
    description: 'O último Uchiha que tudo segue pelo poder do Sharingan e da maldição de Orochimaru.',
    variant: 'Marca Amaldiçoada',
  },
  {
    characterId: 'sakura',
    slug: 'sakura',
    rarity: 'epico',
    title: 'Punho da Sakura',
    description: 'A genin que superou os próprios limites com força sobre-humana e domínio da Força Bruta.',
    variant: 'Força Bruta',
  },
  {
    characterId: 'itachi',
    slug: 'itachi',
    rarity: 'lendario',
    title: 'Gênio da Akatsuki',
    description: 'O protetor secreto de Konoha, portador do Mangekyou Sharingan, mestre do Tsukuyomi.',
    variant: 'Genjutsu Supremo',
  },
];

// Constrói a lista completa de cards padrão: 1 comum por personagem + variantes raras.
export function buildDefaultCards(chars: Character[] = DEFAULT_CHARACTERS): NinjaCard[] {
  const cards: NinjaCard[] = chars.map((c, i) => baseCard(c, i));
  VARIANT_SEEDS.forEach(seed => {
    const base = chars.find(c => c.id === seed.characterId);
    if (!base) return;
    const meta = CARD_RARITY_META[seed.rarity];
    cards.push({
      id: `${base.id}-${seed.variant.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      characterId: base.id,
      characterName: base.name,
      slug: base.folder || base.id,
      rarity: seed.rarity,
      title: seed.title,
      description: seed.description,
      variant: seed.variant,
      imageUrl: base.portrait || undefined,
      points: meta.points,
    });
  });
  return cards;
}

export function getCards(): NinjaCard[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as NinjaCard[];
      }
    } catch (e) {
      console.error('Erro ao ler cards do localStorage:', e);
    }
  }
  return buildDefaultCards();
}

export async function fetchCardsFromServer(): Promise<NinjaCard[]> {
  try {
    const data = await safeFetchJson<{ success?: boolean; cards?: NinjaCard[] }>('/api/cards');
    if (data && data.success && Array.isArray(data.cards) && data.cards.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.cards));
      } catch (e) {
        console.warn('Falha ao salvar cards no localStorage:', e);
      }
      return data.cards;
    }
  } catch (e) {
    console.error('Falha ao buscar cards do servidor:', e);
  }
  return getCards();
}

export function saveCards(cards: NinjaCard[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (e) {
    console.warn('Falha ao salvar cards no localStorage:', e);
  }
  fetch('/api/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  }).catch(err => console.error('Falha ao sincronizar cards com o servidor:', err));
}

// 🎁 PACOTES — agrupam cards por raridade/foco. Guardados separadamente.
export const DEFAULT_PACKS: NinjaPack[] = [
  {
    id: 'pack-basico',
    name: 'Pacote Básico',
    description: 'Figuras comuns e raras de todos os ninjas. Ótimo para completar a coleção.',
    currency: 'gems',
    price: 20,
    cardsPerPack: 3,
    allowedRarities: ['comum', 'raro'],
    badge: 'BÁSICO',
  },
  {
    id: 'pack-epico',
    name: 'Pacote Épico',
    description: 'Maiores chances de figuras épicas e lendárias.',
    currency: 'gems',
    price: 60,
    cardsPerPack: 3,
    allowedRarities: ['epico', 'lendario'],
    badge: 'ÉPICO',
  },
  {
    id: 'pack-lendario',
    name: 'Pacote Lendário',
    description: 'Garante figuras lendárias e secretas — o ápice da coleção.',
    currency: 'gems',
    price: 120,
    cardsPerPack: 2,
    allowedRarities: ['lendario', 'secreto'],
    badge: 'LENDÁRIO',
  },
];

export function getPacks(): NinjaPack[] {
  const stored = localStorage.getItem(PACKS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed as NinjaPack[];
    } catch (e) {
      console.error('Erro ao ler pacotes do localStorage:', e);
    }
  }
  return DEFAULT_PACKS;
}

export async function fetchPacksFromServer(): Promise<NinjaPack[]> {
  try {
    const data = await safeFetchJson<{ success?: boolean; packs?: NinjaPack[] }>('/api/cards/packs');
    if (data && data.success && Array.isArray(data.packs) && data.packs.length > 0) {
      try {
        localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify(data.packs));
      } catch {}
      return data.packs;
    }
  } catch {}
  return getPacks();
}

export function savePacks(packs: NinjaPack[]): void {
  try {
    localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify(packs));
  } catch (e) {
    console.warn('Falha ao salvar pacotes no localStorage:', e);
  }
  fetch('/api/cards/packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packs }),
  }).catch(err => console.error('Falha ao sincronizar pacotes com o servidor:', err));
}
