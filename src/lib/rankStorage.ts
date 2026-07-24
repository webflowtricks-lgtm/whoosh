/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RankConfig {
  id: string;
  name: string;
  requiredXp: number;
  color: string;
  imageUrl?: string;
}

export const DEFAULT_RANKS: RankConfig[] = [
  {
    id: 'rank_estudante',
    name: 'Estudante de Academia',
    requiredXp: 0,
    color: 'from-slate-500 to-slate-400 border-slate-500/30 text-slate-300'
  },
  {
    id: 'rank_genin',
    name: 'Genin',
    requiredXp: 1,
    color: 'from-emerald-600 to-teal-500 border-emerald-500/30 text-emerald-400'
  },
  {
    id: 'rank_chunin',
    name: 'Chunin',
    requiredXp: 2,
    color: 'from-blue-600 to-cyan-500 border-blue-500/30 text-blue-400'
  },
  {
    id: 'rank_jonin',
    name: 'Jonin',
    requiredXp: 3,
    color: 'from-indigo-600 to-purple-500 border-indigo-500/30 text-indigo-400'
  },
  {
    id: 'rank_anbu',
    name: 'ANBU',
    requiredXp: 4,
    color: 'from-red-600 to-pink-500 border-red-500/30 text-red-400'
  },
  {
    id: 'rank_hokage',
    name: 'Hokage',
    requiredXp: 5,
    color: 'from-orange-600 to-amber-500 border-orange-500/30 text-orange-400'
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
    const res = await fetch('/api/ranks');
    const data = await res.json();
    if (data.success && Array.isArray(data.ranks) && data.ranks.length > 0) {
      saveRanks(data.ranks);
      return data.ranks.sort((a: RankConfig, b: RankConfig) => a.requiredXp - b.requiredXp);
    }
  } catch (err) {
    console.error('Error fetching ranks from server:', err);
  }
  return getRanks();
}

export function getUserRankFromConfig(xp: number, rankList?: RankConfig[]): string {
  const list = rankList && rankList.length > 0 ? rankList : getRanks();
  const sorted = [...list].sort((a, b) => b.requiredXp - a.requiredXp);
  for (const r of sorted) {
    if (xp >= r.requiredXp) {
      return r.name;
    }
  }
  return list[0]?.name || 'Estudante de Academia';
}
