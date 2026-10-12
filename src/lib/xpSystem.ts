/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RankConfig, getRanks } from './rankStorage';
export { calculateBattleXp } from './battleRewards';
import { calculateBattleXp } from './battleRewards';

export interface RankProgressInfo {
  currentRank: RankConfig;
  nextRank: RankConfig | null;
  currentXp: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
  isMaxRank: boolean;
}

/**
 * Calculates XP earned or lost from a battle based on victory status, turn count,
 * surviving player combatants, and total damage dealt to enemy team.
 * Defeat results in a larger XP loss than a typical victory gain.
 */
/**
 * Computes rank progress info for a given XP amount (minimum 0 XP).
 */
export function getRankProgress(xp: number, ranksList?: RankConfig[]): RankProgressInfo {
  const safeXp = Math.max(0, xp);
  const ranks = (ranksList && ranksList.length > 0 ? ranksList : getRanks())
    .slice()
    .sort((a, b) => a.requiredXp - b.requiredXp);

  let currentRank = ranks[0] || {
    id: 'rank_estudante',
    name: 'Estudante de Academia',
    requiredXp: 0,
    color: 'from-slate-500 to-slate-400 border-slate-500/30 text-slate-300'
  };
  let nextRank: RankConfig | null = null;

  for (let i = 0; i < ranks.length; i++) {
    if (safeXp >= ranks[i].requiredXp) {
      currentRank = ranks[i];
      nextRank = ranks[i + 1] || null;
    } else {
      if (!nextRank) nextRank = ranks[i];
      break;
    }
  }

  if (!nextRank) {
    // Max rank reached
    return {
      currentRank,
      nextRank: null,
      currentXp: safeXp,
      xpInCurrentLevel: safeXp - currentRank.requiredXp,
      xpNeededForNextLevel: 0,
      progressPercent: 100,
      isMaxRank: true
    };
  }

  const xpInCurrentLevel = safeXp - currentRank.requiredXp;
  const xpNeededForNextLevel = nextRank.requiredXp - currentRank.requiredXp;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.floor((xpInCurrentLevel / Math.max(1, xpNeededForNextLevel)) * 100))
  );

  return {
    currentRank,
    nextRank,
    currentXp: safeXp,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
    isMaxRank: false
  };
}

/**
 * Checks if a player changed rank (up or down) after XP change.
 */
export function checkRankChange(oldXp: number, newXp: number, ranksList?: RankConfig[]) {
  const safeOldXp = Math.max(0, oldXp);
  const safeNewXp = Math.max(0, newXp);
  const oldProgress = getRankProgress(safeOldXp, ranksList);
  const newProgress = getRankProgress(safeNewXp, ranksList);

  const rankedUp = newProgress.currentRank.requiredXp > oldProgress.currentRank.requiredXp;
  const rankedDown = newProgress.currentRank.requiredXp < oldProgress.currentRank.requiredXp;

  return {
    rankedUp,
    rankedDown,
    oldRank: oldProgress.currentRank,
    newRank: newProgress.currentRank
  };
}

/**
 * Backwards compatible alias for checkRankUp
 */
export function checkRankUp(oldXp: number, newXp: number, ranksList?: RankConfig[]) {
  return checkRankChange(oldXp, newXp, ranksList);
}
