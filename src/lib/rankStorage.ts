/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeFetchJson } from './api';

export interface RankConfig {
  id: string;
  name: string;
  requiredXp: number;
  color: string;
  bgColor?: string;
  iconUrl?: string;
  imageUrl?: string;
  fontColor?: string;
}

export interface RankGradientPreset {
  name: string;
  category: string;
  value: string;
}

export const RANK_GRADIENT_PRESETS: RankGradientPreset[] = [
  // Clássicos
  { name: '🚫 Sem Degradê (Apenas Cor de Fundo)', category: 'Clássicos', value: 'none' },
  { name: 'Cinza (Estudante)', category: 'Clássicos', value: 'from-slate-500 to-slate-400 border-slate-500/30 text-white' },
  { name: 'Verde (Genin)', category: 'Clássicos', value: 'from-emerald-600 to-teal-500 border-emerald-500/30 text-white' },
  { name: 'Azul (Chunin)', category: 'Clássicos', value: 'from-blue-600 to-cyan-500 border-blue-500/30 text-white' },
  { name: 'Roxo (Jonin)', category: 'Clássicos', value: 'from-indigo-600 to-purple-500 border-indigo-500/30 text-white' },
  { name: 'Vermelho (ANBU)', category: 'Clássicos', value: 'from-red-600 to-pink-500 border-red-500/30 text-white' },
  { name: 'Violeta (Sannin)', category: 'Clássicos', value: 'from-purple-600 to-fuchsia-500 border-purple-500/30 text-white' },
  { name: 'Laranja (Hokage)', category: 'Clássicos', value: 'from-orange-600 to-amber-500 border-orange-500/30 text-white' },
  { name: 'Dourado (Lenda)', category: 'Clássicos', value: 'from-yellow-500 to-amber-300 border-yellow-400/50 text-white' },

  // Elementais & Natureza
  { name: 'Chama Sagrada (Katon)', category: 'Elementais & Natureza', value: 'from-amber-500 via-orange-600 to-red-600 border-orange-500/40 text-white' },
  { name: 'Vulcânico / Magma', category: 'Elementais & Natureza', value: 'from-red-600 via-rose-700 to-orange-500 border-red-500/40 text-white' },
  { name: 'Fogo Infernal', category: 'Elementais & Natureza', value: 'from-red-800 via-orange-600 to-amber-400 border-red-600/40 text-white' },
  { name: 'Trovão Dourado (Raikage)', category: 'Elementais & Natureza', value: 'from-yellow-400 via-amber-500 to-yellow-600 border-yellow-400/40 text-white' },
  { name: 'Raios Azuis (Chidori)', category: 'Elementais & Natureza', value: 'from-cyan-400 via-blue-600 to-indigo-700 border-cyan-400/40 text-white' },
  { name: 'Relâmpago Violeta', category: 'Elementais & Natureza', value: 'from-purple-500 via-fuchsia-600 to-indigo-600 border-fuchsia-400/40 text-white' },
  { name: 'Rasengan / Vento (Futon)', category: 'Elementais & Natureza', value: 'from-teal-400 via-cyan-500 to-blue-500 border-cyan-300/40 text-white' },
  { name: 'Névoa Suave', category: 'Elementais & Natureza', value: 'from-sky-400 via-teal-300 to-emerald-400 border-sky-300/40 text-white' },
  { name: 'Floresta Profunda (Mokuton)', category: 'Elementais & Natureza', value: 'from-emerald-700 via-green-600 to-teal-800 border-emerald-500/40 text-white' },
  { name: 'Jardim de Jade', category: 'Elementais & Natureza', value: 'from-emerald-500 via-teal-400 to-green-600 border-emerald-400/40 text-white' },
  { name: 'Terra Seca (Doton)', category: 'Elementais & Natureza', value: 'from-amber-800 via-yellow-800 to-stone-700 border-amber-700/40 text-white' },
  { name: 'Gelo Absoluto (Hyoton)', category: 'Elementais & Natureza', value: 'from-sky-300 via-cyan-400 to-blue-600 border-sky-300/40 text-white' },
  { name: 'Oceano Profundo (Suiton)', category: 'Elementais & Natureza', value: 'from-blue-700 via-indigo-800 to-cyan-600 border-blue-500/40 text-white' },
  { name: 'Veneno Roxo', category: 'Elementais & Natureza', value: 'from-purple-800 via-fuchsia-700 to-indigo-900 border-purple-500/40 text-white' },

  // Místicos & Lendários
  { name: 'Sangue Akatsuki', category: 'Místicos & Lendários', value: 'from-black via-red-950 to-red-600 border-red-600/50 text-white' },
  { name: 'Sábio dos Seis Caminhos', category: 'Místicos & Lendários', value: 'from-amber-300 via-yellow-500 to-amber-600 border-amber-300/50 text-white' },
  { name: 'Ouro Divino / Celestial', category: 'Místicos & Lendários', value: 'from-yellow-300 via-amber-400 to-yellow-500 border-yellow-200/50 text-white' },
  { name: 'Prisma Sagrado', category: 'Místicos & Lendários', value: 'from-pink-500 via-purple-500 to-indigo-500 border-pink-400/40 text-white' },
  { name: 'Galáxia Cósmica', category: 'Místicos & Lendários', value: 'from-slate-900 via-purple-900 to-indigo-900 border-purple-500/40 text-white' },
  { name: 'Aurora Boreal', category: 'Místicos & Lendários', value: 'from-emerald-400 via-teal-500 to-indigo-600 border-teal-300/40 text-white' },
  { name: 'Sol Nascente', category: 'Místicos & Lendários', value: 'from-rose-500 via-orange-400 to-amber-300 border-orange-400/40 text-white' },
  { name: 'Crepúsculo Sombrio', category: 'Místicos & Lendários', value: 'from-violet-900 via-purple-800 to-slate-900 border-violet-500/40 text-white' },
  { name: 'Sombra do Pesadelo', category: 'Místicos & Lendários', value: 'from-neutral-900 via-stone-800 to-zinc-900 border-zinc-700/50 text-white' },
  { name: 'Névoa Fantasma', category: 'Místicos & Lendários', value: 'from-slate-800 via-slate-600 to-slate-800 border-slate-500/40 text-white' },
  { name: 'Visão Susanoo', category: 'Místicos & Lendários', value: 'from-indigo-900 via-purple-800 to-fuchsia-900 border-purple-400/50 text-white' },
  { name: 'Chama Amaterasu', category: 'Místicos & Lendários', value: 'from-black via-zinc-900 to-neutral-800 border-red-500/50 text-white' },

  // Neon & Vibrantes
  { name: 'Neon Cyber / Synthwave', category: 'Neon & Vibrantes', value: 'from-fuchsia-600 via-pink-500 to-cyan-400 border-fuchsia-400/40 text-white' },
  { name: 'Esmeralda Neon', category: 'Neon & Vibrantes', value: 'from-emerald-400 via-green-500 to-lime-400 border-emerald-300/40 text-white' },
  { name: 'Amethyst / Joia Real', category: 'Neon & Vibrantes', value: 'from-purple-600 via-violet-600 to-indigo-600 border-purple-400/40 text-white' },
  { name: 'Safira Brilhante', category: 'Neon & Vibrantes', value: 'from-blue-500 via-sky-400 to-cyan-500 border-blue-400/40 text-white' },
  { name: 'Rubi Imperial', category: 'Neon & Vibrantes', value: 'from-rose-600 via-red-600 to-pink-600 border-rose-400/40 text-white' },
  { name: 'Topázio Cítrico', category: 'Neon & Vibrantes', value: 'from-amber-400 via-orange-500 to-yellow-500 border-amber-400/40 text-white' },
  { name: 'Algodão Doce', category: 'Neon & Vibrantes', value: 'from-pink-400 via-purple-300 to-indigo-400 border-pink-300/40 text-white' },
  { name: 'Pôr do Sol Tropical', category: 'Neon & Vibrantes', value: 'from-rose-500 via-pink-600 to-purple-700 border-pink-400/40 text-white' },
  { name: 'Laser Neon Cyan', category: 'Neon & Vibrantes', value: 'from-cyan-500 via-teal-400 to-blue-600 border-cyan-300/40 text-white' },

  // Metálicos & Especiais
  { name: 'Prata Espelhada', category: 'Metálicos & Especiais', value: 'from-slate-400 via-slate-200 to-slate-400 border-slate-300/50 text-slate-900' },
  { name: 'Ouro Real Rutilante', category: 'Metálicos & Especiais', value: 'from-yellow-500 via-amber-300 to-yellow-600 border-amber-300/60 text-amber-950' },
  { name: 'Platina Brilhante', category: 'Metálicos & Especiais', value: 'from-slate-300 via-zinc-100 to-slate-400 border-white/60 text-slate-950' },
  { name: 'Bronze Antigo', category: 'Metálicos & Especiais', value: 'from-amber-800 via-yellow-700 to-amber-900 border-amber-600/40 text-white' },
  { name: 'Cobre Queimado', category: 'Metálicos & Especiais', value: 'from-orange-800 via-amber-700 to-red-800 border-orange-600/40 text-white' },
  { name: 'Titânio Escuro', category: 'Metálicos & Especiais', value: 'from-zinc-800 via-slate-700 to-neutral-800 border-zinc-600/40 text-white' },
  { name: 'Diamante Azul', category: 'Metálicos & Especiais', value: 'from-cyan-200 via-sky-300 to-blue-400 border-cyan-100/60 text-slate-900' },
  { name: 'Obsidiana Negra', category: 'Metálicos & Especiais', value: 'from-neutral-950 via-slate-900 to-black border-slate-700/50 text-white' },
];

export const DEFAULT_RANKS: RankConfig[] = [
  {
    id: 'rank_estudante',
    name: 'Estudante de Academia',
    requiredXp: 0,
    color: 'from-slate-500 to-slate-400 border-slate-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_genin',
    name: 'Genin',
    requiredXp: 1000,
    color: 'from-emerald-600 to-teal-500 border-emerald-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_chunin',
    name: 'Chunin',
    requiredXp: 3500,
    color: 'from-blue-600 to-cyan-500 border-blue-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_jonin',
    name: 'Jonin',
    requiredXp: 8500,
    color: 'from-indigo-600 to-purple-500 border-indigo-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_anbu',
    name: 'ANBU',
    requiredXp: 18000,
    color: 'from-red-600 to-pink-500 border-red-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_sannin',
    name: 'Sannin Lendário',
    requiredXp: 35000,
    color: 'from-purple-600 to-fuchsia-500 border-purple-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_hokage',
    name: 'Hokage',
    requiredXp: 60000,
    color: 'from-orange-600 to-amber-500 border-orange-500/30 text-white',
    fontColor: '#ffffff'
  },
  {
    id: 'rank_lenda',
    name: 'Lenda Shinobi',
    requiredXp: 100000,
    color: 'from-yellow-500 to-amber-300 border-yellow-400/50 text-white',
    fontColor: '#ffffff'
  }
];

const LOCAL_STORAGE_KEY = 'naruto_unison_ranks';

export function getRanks(): RankConfig[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => a.requiredXp - b.requiredXp);
      }
    }
  } catch (err) {
    console.error('Error reading ranks from localStorage:', err);
  }
  return DEFAULT_RANKS;
}

export function saveRanks(ranks: RankConfig[]): void {
  try {
    const sorted = [...ranks].sort((a, b) => a.requiredXp - b.requiredXp);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sorted));
    
    // Sync with server if available
    fetch('/api/ranks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranks: sorted })
    }).catch(() => {});
  } catch (err) {
    console.error('Error saving ranks to localStorage:', err);
  }
}

export async function fetchRanksFromServer(): Promise<RankConfig[]> {
  try {
    const data = await safeFetchJson<{ success?: boolean; ranks?: RankConfig[] }>('/api/ranks');
    if (data && data.success && Array.isArray(data.ranks) && data.ranks.length > 0) {
      saveRanks(data.ranks);
      return data.ranks.sort((a: RankConfig, b: RankConfig) => a.requiredXp - b.requiredXp);
    }
  } catch (err) {
    console.error('Error fetching ranks from server:', err);
  }
  return getRanks();
}

export function getUserRankFromConfig(xp: number, rankList?: RankConfig[]): string {
  const safeXp = Math.max(0, xp);
  const list = rankList && rankList.length > 0 ? rankList : getRanks();
  const sorted = [...list].sort((a, b) => b.requiredXp - a.requiredXp);
  for (const r of sorted) {
    if (safeXp >= r.requiredXp) {
      return r.name;
    }
  }
  return list[0]?.name || 'Estudante de Academia';
}
