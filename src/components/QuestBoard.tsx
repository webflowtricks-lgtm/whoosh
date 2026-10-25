/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { safeFetchJson } from '../lib/api';
import { matchFetch } from '../lib/matchFetch';
import { 
  Award, 
  Lock, 
  CheckCircle, 
  Play, 
  ArrowLeft, 
  Filter,
  Search,
  User, 
  Star, 
  ChevronDown,
  ChevronUp,
  ChevronRight, 
  ChevronLeft,
  Compass, 
  BookOpen, 
  Image,
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Swords,
  Shield,
  X,
  Zap,
  Eye,
} from 'lucide-react';
import { Quest, UserProfile, Character, QuestReward, QuestGoal, NinjaCard, ShopItem } from '../types';
import SkinMedia from './SkinMedia';
import { getGoalDescription } from '../lib/questUtils';
import MangekyoLoader from './MangekyoLoader';
import { RankConfig, getRanks, getUserRankFromConfig, fetchRanksFromServer } from '../lib/rankStorage';
import { getCharacters } from '../lib/characterStorage';
import { CARD_RARITY_META, fetchCardsFromServer, getCards } from '../lib/cardStorage';
import { fetchShopItemsFromServer, getShopItems } from '../lib/shopStorage';
import { useLanguage } from '../lib/i18n';

function renderHighlightedGoalDescription(goal: QuestGoal) {
  const description = getGoalDescription(goal);
  const terms = [...new Set([...(goal.targetCharacters || []), goal.targetSkill || '']
    .map(term => term.trim())
    .filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return description;

  const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = description.split(new RegExp(`(${escapedTerms.join('|')})`, 'gi'));

  return parts.map((part, index) =>
    terms.some(term => term.toLocaleLowerCase() === part.toLocaleLowerCase())
      ? <span key={index} className="font-bold text-orange-600">{part}</span>
      : part
  );
}

interface QuestBoardProps {
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
  onSelectQuest: (quest: Quest) => void;
  onBack: () => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  playUahSound: () => void;
  playWinSound: () => void;
}

export function getUserRank(completedCount: number, customRanks?: RankConfig[]): string {
  return getUserRankFromConfig(completedCount, customRanks);
}

const RANK_COLORS: Record<string, string> = {
  'Estudante da Academia': 'from-slate-500 to-slate-400 border-slate-500/30 text-slate-300',
  'Genin': 'from-emerald-600 to-teal-500 border-emerald-500/30 text-emerald-400',
  'Chunin': 'from-blue-600 to-cyan-500 border-blue-500/30 text-blue-400',
  'Jonin': 'from-indigo-600 to-purple-500 border-indigo-500/30 text-indigo-400',
  'ANBU': 'from-red-600 to-pink-500 border-red-500/30 text-red-400',
  'Hokage': 'from-orange-600 to-amber-500 border-orange-500/30 text-orange-400 shadow-orange-500/10'
};

const RANK_XP_REQUIREMENTS = {
  'Estudante da Academia': 0,
  'Genin': 1,
  'Chunin': 2,
  'Jonin': 3,
  'ANBU': 4,
  'Hokage': 5,
};

export default function QuestBoard({
  user,
  onUpdateUser,
  onSelectQuest,
  onBack,
  playClickSound,
  playScrollSound,
  playUahSound,
  playWinSound,
}: QuestBoardProps) {
  const { t } = useLanguage();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [allCards, setAllCards] = useState<NinjaCard[]>(() => getCards());
  const [skillSkinItems, setSkillSkinItems] = useState<ShopItem[]>(() =>
    getShopItems().filter(item => item.category === 'skill_skin'),
  );
  const [ranksList, setRanksList] = useState<RankConfig[]>(getRanks());
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'missoes' | 'perfil'>('missoes');
  const [activeTab, setActiveTab] = useState<'available' | 'completed' | 'all'>('available');
  const [rankFilter, setRankFilter] = useState<string>('');
  const [questSearch, setQuestSearch] = useState('');
  const [showQuestFilters, setShowQuestFilters] = useState(false);
  const [claimedRewardId, setClaimedRewardId] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState('');
  const rewardCarouselRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [rewardModalData, setRewardModalData] = useState<{
    questTitle: string;
    unlockedCharacters: Character[];
    otherRewards: QuestReward[];
  } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const skillOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    const allChars = getCharacters();
    allChars.forEach(c => {
      c.skills.forEach(sk => {
        if (!map.has(sk.name)) {
          map.set(sk.name, c.name);
        }
      });
    });
    return map;
  }, []);

  useEffect(() => {
    fetchQuests();
    fetchRanksFromServer().then(r => setRanksList(r));
    fetchCardsFromServer().then(setAllCards);
    fetchShopItemsFromServer().then(items => {
      setSkillSkinItems(items.filter(item => item.category === 'skill_skin'));
    });
  }, []);

  useEffect(() => {
    if (rewardModalData) rewardCarouselRef.current?.scrollTo({ left: 0 });
  }, [rewardModalData]);

  const fetchQuests = async () => {
    try {
      setLoading(true);
      const data = await safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests');
      if (data && data.success && Array.isArray(data.quests)) {
        // Sync completed quests with user profile
        const userCompletedIds = user.completedQuestIds || [];
        let synced = data.quests.map((q: Quest) => {
          const progressByGoal = new Map(
            (user.questProgress?.[q.id] || []).map(progress => [progress.id, progress]),
          );
          return {
            ...q,
            goals: q.goals.map(goal => {
              const progress = progressByGoal.get(goal.id);
              return progress
                ? { ...goal, currentValue: progress.currentValue, currentStreak: progress.currentStreak }
                : { ...goal, currentValue: 0, currentStreak: 0 };
            }),
            completed: userCompletedIds.includes(q.id),
          };
        });

        // Missões bloqueadas (e as novas que ainda não desbloquearam) só começam a
        // contar a meta a partir do momento em que são desbloqueadas. Zera o progresso
        // acumulado delas para que vitórias/batalhas anteriores ao desbloqueio não contem.
        const lockedIds = computeLockedQuestIds(synced, user, ranksList);
        let resetProgress = false;
        synced = synced.map(q => {
          if (lockedIds.has(q.id) && q.goals?.some(g => (g.currentValue || 0) > 0 || (g.currentStreak || 0) > 0)) {
            resetProgress = true;
            return {
              ...q,
              goals: q.goals.map(g => ({ ...g, currentValue: 0, currentStreak: 0 }))
            };
          }
          return q;
        });

        setQuests(synced);

        if (resetProgress) {
          onUpdateUser({
            ...user,
            questProgress: {
              ...user.questProgress,
              ...Object.fromEntries(synced
                .filter(q => lockedIds.has(q.id))
                .map(q => [q.id, q.goals.map(({ id, currentValue, currentStreak }) => ({
                  id, currentValue, currentStreak,
                }))])),
            },
          });
        }
      }
    } catch (err) {
      console.error('Error fetching quests:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentRank = getUserRankFromConfig(user.xp || 0, ranksList);

  // Compute which quests are locked for the current user (rank + required quests)
  const computeLockedQuestIds = (qList: Quest[], u: UserProfile, rList: RankConfig[]): Set<string> => {
    const lockedIds = new Set<string>();
    const playerRankName = getUserRankFromConfig(Math.max(0, u.xp || 0), rList);
    const playerRankIdx = rList.findIndex(r => r.name.toLowerCase() === playerRankName.toLowerCase());
    const userXp = Math.max(0, u.xp || 0);
    const completedIds = u.completedQuestIds || [];

    for (const q of qList) {
      const requiredRankIdx = rList.findIndex(r => r.name.toLowerCase() === (q.minRank || '').toLowerCase());
      const requiredRankObj = rList.find(r => r.name.toLowerCase() === (q.minRank || '').toLowerCase());
      let locked = false;

      if (requiredRankObj && userXp < requiredRankObj.requiredXp) {
        locked = true;
      } else if (requiredRankIdx !== -1 && playerRankIdx !== -1 && playerRankIdx < requiredRankIdx) {
        locked = true;
      }

      if (!locked) {
        for (const reqId of q.requiredQuestIds || []) {
          if (!completedIds.includes(reqId)) {
            locked = true;
            break;
          }
        }
      }

      if (locked) lockedIds.add(q.id);
    }
    return lockedIds;
  };

  // Check if a quest is locked based on minRank and requiredQuestIds
  const isQuestLocked = (quest: Quest): { locked: boolean; reason?: string } => {
    const playerRankName = getUserRankFromConfig(user.xp || 0, ranksList);
    const playerRankIdx = ranksList.findIndex(r => r.name.toLowerCase() === playerRankName.toLowerCase());
    const requiredRankIdx = ranksList.findIndex(r => r.name.toLowerCase() === (quest.minRank || '').toLowerCase());
    const requiredRankObj = ranksList.find(r => r.name.toLowerCase() === (quest.minRank || '').toLowerCase());
    const userXp = Math.max(0, user.xp || 0);

    if (requiredRankObj && userXp < requiredRankObj.requiredXp) {
      return { locked: true, reason: `Requer Rank: ${quest.minRank}` };
    } else if (requiredRankIdx !== -1 && playerRankIdx !== -1 && playerRankIdx < requiredRankIdx) {
      return { locked: true, reason: `Requer Rank: ${quest.minRank}` };
    }

    const completedIds = user.completedQuestIds || [];
    for (const reqId of quest.requiredQuestIds) {
      if (!completedIds.includes(reqId)) {
        const reqQuest = quests.find(q => q.id === reqId);
        return { 
          locked: true, 
          reason: `Requer conclusão de: ${reqQuest?.title || 'Missão Anterior'}` 
        };
      }
    }

    return { locked: false };
  };

  // Claim reward once all goals are completed
  const handleClaimReward = async (quest: Quest) => {
    playUahSound();
    const allGoalsMet = quest.goals.every(g => g.currentValue >= g.targetValue);
    if (!allGoalsMet) return;
    setClaimedRewardId(quest.id);
    playWinSound();

    setTimeout(async () => {
      try {
        const response = await matchFetch('/api/quests/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.username, questId: quest.id }),
        });
        const result = await response.json().catch(() => ({})) as {
          error?: string;
          user?: UserProfile;
          grantedRewards?: QuestReward[];
        };
        if (!response.ok || !result.user) {
          throw new Error(result.error || `Falha ao resgatar recompensa (HTTP ${response.status}).`);
        }

        onUpdateUser({ ...user, ...result.user });
        setQuests(current => current.map(item =>
          item.id === quest.id ? { ...item, completed: true } : item,
        ));

        const allChars = getCharacters();
        const unlockedCharacters: Character[] = [];
        const otherRewards: QuestReward[] = [];
        for (const reward of result.grantedRewards || []) {
          if (reward.type !== 'unlock_character') {
            otherRewards.push(reward);
            continue;
          }
          const character = allChars.find(item =>
            item.name.toLowerCase() === reward.value.toLowerCase() ||
            item.id.toLowerCase() === reward.value.toLowerCase() ||
            item.folder.toLowerCase() === reward.value.toLowerCase(),
          );
          unlockedCharacters.push(character || {
            id: reward.value,
            name: reward.value,
            description: 'Novo Shinobi desbloqueado para batalhas!',
            tags: ['Vila da Folha', 'Shinobi Desbloqueado'],
            skills: [],
            portrait: '/static/img/icon/default.jpg',
            folder: reward.value,
          });
        }
        setRewardModalData({
          questTitle: quest.title,
          unlockedCharacters,
          otherRewards,
        });
        playScrollSound();
      } catch (error) {
        console.error('Falha ao resgatar recompensa de missão:', error);
        setRewardError(error instanceof Error ? error.message : 'Não foi possível resgatar a recompensa.');
        window.setTimeout(() => setRewardError(''), 5000);
      } finally {
        setClaimedRewardId(null);
      }
    }, 800);
  };

  const handleEquipTitle = (titleName: string) => {
    playClickSound();
    onUpdateUser({
      ...user,
      title: user.title === titleName ? undefined : titleName
    });
  };

  const handleStartQuest = (quest: Quest) => {
    playClickSound();
    onSelectQuest(quest);
  };

  // Build reward modal data (display-only, no claim) for completed quests
  const buildRewardModalData = (quest: Quest) => {
    const allChars = getCharacters();
    const unlockedChars: Character[] = [];
    const otherRewardsList: QuestReward[] = [];

    quest.rewards.forEach(r => {
      if (r.type === 'title') {
        otherRewardsList.push(r);
      } else if (r.type === 'unlock_character') {
        const found = allChars.find(c => 
          c.name.toLowerCase() === r.value.toLowerCase() || 
          c.id.toLowerCase() === r.value.toLowerCase() ||
          c.folder.toLowerCase() === r.value.toLowerCase()
        );
        if (found) {
          unlockedChars.push(found);
        } else {
          unlockedChars.push({
            id: r.value,
            name: r.value,
            description: 'Novo Shinobi desbloqueado para batalhas!',
            tags: ['Vila da Folha', 'Shinobi Desbloqueado'],
            skills: [],
            portrait: '/static/img/icon/default.jpg',
            folder: r.value
          });
        }
      } else if (r.type === 'frame' || r.type === 'banner' || r.type === 'card' || r.type === 'skill_skin' || r.type === 'ryos' || r.type === 'gems') {
        otherRewardsList.push(r);
      }
    });

    setRewardModalData({
      questTitle: quest.title,
      unlockedCharacters: unlockedChars,
      otherRewards: otherRewardsList
    });
  };

  // Replay reward animation for a completed quest (no re-claim)
  const handleViewCompletedRewards = (quest: Quest) => {
    playClickSound();
    playWinSound();
    playScrollSound();
    buildRewardModalData(quest);
  };

  // Filter lists
  const RANK_LIST = ranksList.map(r => r.name);
  const filteredQuests = quests.filter(quest => {
    const isCompleted = user.completedQuestIds?.includes(quest.id) || quest.completed;
    if (activeTab === 'completed') return isCompleted;
    if (activeTab === 'available') return !isCompleted;
    return true; // 'all'
  }).filter(quest => {
    if (!rankFilter) return true;
    return (quest.minRank || '').toLowerCase() === rankFilter.toLowerCase();
  }).filter(quest => {
    const normalizedTitle = quest.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalizedSearch = questSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return normalizedTitle.includes(normalizedSearch);
  });

  const totalPages = Math.ceil(filteredQuests.length / ITEMS_PER_PAGE);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedQuests = filteredQuests.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const modalCollectibleRewards = rewardModalData?.otherRewards.filter(reward => reward.type === 'card') || [];
  const modalOtherRewards = rewardModalData?.otherRewards.filter(reward => reward.type !== 'card') || [];

  return (
    <div className="quest-div-pai min-h-screen w-full relative">
      <div className="absolute inset-0 pointer-events-none z-0" />
      <AnimatePresence>
        {rewardError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-xl border border-red-400/50 bg-red-950/95 px-4 py-3 text-center text-xs font-bold text-red-100 shadow-xl"
          >
            {rewardError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Modals inside the Arena/Quartel Shinobi Hub */}
      <AnimatePresence>
        {rewardModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-blue-950/75 backdrop-blur-xl overflow-y-auto select-none">
            {/* Ambient Background Rays & Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-400/20 via-blue-600/10 to-transparent pointer-events-none animate-pulse" />

            {/* Floating Sparkles Particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(16)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 800),
                    y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 600),
                    scale: Math.random() * 0.6 + 0.4,
                    opacity: 0.1
                  }}
                  animate={{
                    y: [null, '-=120px'],
                    opacity: [0.1, 0.9, 0],
                    scale: [null, 1.3, 0.3]
                  }}
                  transition={{
                    duration: Math.random() * 3 + 2.5,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: Math.random() * 2
                  }}
                  className="absolute w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-sky-300 via-blue-400 to-orange-400 shadow-md shadow-sky-400/60"
                />
              ))}
            </div>

            {/* Main Reward Cards Container */}
            <motion.div
              initial={false}
              animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
              exit={{ scale: 0.2, opacity: 0, y: 50, rotate: 7 }}
              transition={{ type: "spring", damping: 14, stiffness: 125, bounce: 0.35 }}
              ref={rewardCarouselRef}
              className="relative flex w-full max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-6rem)] flex-row flex-nowrap snap-x snap-mandatory items-stretch justify-start gap-3 overflow-x-auto overflow-y-auto z-10 my-auto"
            >
              {/* Character Reward Card */}
              <div className="quest-reward-card relative shrink-0 snap-start bg-white border-2 border-sky-200 rounded-3xl p-3.5 sm:p-4 shadow-[0_0_70px_rgba(37,99,235,0.22)] flex flex-col items-center text-center space-y-2.5">
              {/* Outer Pulsing Glow Aura */}
              <div className="absolute -inset-1 rounded-[26px] bg-gradient-to-r from-blue-500 via-sky-400 to-orange-400 opacity-30 blur-lg -z-10 animate-pulse" />

              {/* Close button top right */}
              <button
                onClick={() => {
                  playClickSound();
                  setRewardModalData(null);
                }}
                className="absolute top-4 right-4 p-2 text-blue-500 hover:text-orange-600 hover:bg-sky-50 rounded-full transition cursor-pointer z-20"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Top Badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-sky-50 via-blue-50 to-orange-50 border border-sky-200 shadow-lg shadow-blue-500/10">
                <img src="/static/img/icon/star.svg" alt="Loading" className="w-3 h-3 animate-spin object-contain" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 font-sans">
                  {rewardModalData.unlockedCharacters.length > 0
                    ? 'NOVO PERSONAGEM'
                    : 'RECOMPENSA RESGATADA!'}
                </span>
                <img src="/static/img/icon/star.svg" alt="Loading" className="w-3 h-3 animate-spin object-contain" />
              </div>

              {/* Character Unlocked View */}
              {rewardModalData.unlockedCharacters.length > 0 ? (
                <div className="w-full space-y-2">
                  {rewardModalData.unlockedCharacters.map((char) => {
                    const skinImg = char.skins?.[0]?.image || char.selectedSkinUrl;
                    const displayImg = skinImg || char.portrait;

                    return (
                      <div key={char.id} className="flex flex-col items-center space-y-2">
                        {/* BIG PHOTO / ARTWORK FRAME (Foto bem grande) */}
                        <div                         className="relative w-full h-36 sm:h-40 max-w-[240px] mx-auto rounded-2xl overflow-hidden border-2 border-sky-300 shadow-[0_10px_35px_rgba(37,99,235,0.25)] bg-blue-950 flex items-center justify-center group">
                          {/* Inner Radial Aura */}
                          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-400/35 via-blue-700/25 to-blue-950 z-0" />
                          
                          {/* Animated Lighting Rays inside Card */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-sky-400/10 via-transparent to-orange-300/10 opacity-70 animate-pulse pointer-events-none z-10" />

                          {/* Large Floating Character Image */}
                          <motion.div
                            initial={false}
                            animate={{ scale: 1, opacity: 1, y: [0, -8, 0] }}
                            transition={{
                              scale: { duration: 0.5 },
                              opacity: { duration: 0.5 },
                              y: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                            }}
                            className="relative z-20 w-full h-full"
                          >
                            <SkinMedia
                              src={displayImg}
                              alt={char.name}
                              className="w-full h-full object-contain p-2 filter drop-shadow-[0_12px_28px_rgba(37,99,235,0.45)]"
                              autoPlay
                              onImageError={e => {
                                if (e.currentTarget.src !== char.portrait) e.currentTarget.src = char.portrait;
                              }}
                            />
                          </motion.div>

                          {/* Bottom Dark Gradient Overlay for Typography contrast */}
                          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-30" />

                          {/* Character Name Label over Image */}
                          <div className="absolute bottom-2 left-0 right-0 z-40 px-2 text-center">
                            <h2 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-100 to-orange-300 font-sans tracking-wider uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]">
                              {char.name}
                            </h2>
                          </div>
                        </div>

                        {/* Character Tags */}
                        {char.tags && char.tags.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {char.tags.map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-50 text-blue-700 border border-sky-200 uppercase tracking-wider shadow-sm"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Character Description */}
                        <p className="text-xs text-blue-950 leading-relaxed max-w-md font-sans line-clamp-3">
                          {char.description}
                        </p>

                        {/* Skills Showcase */}
                        {char.skills && char.skills.length > 0 && (
                          <div className="w-full bg-sky-50 p-2.5 rounded-xl border border-sky-200 space-y-1.5 text-left">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-blue-700 font-bold flex items-center gap-1 justify-center">
                              <Zap className="w-3 h-3 text-orange-500" />
                              <span>Habilidades</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {char.skills.slice(0, 4).map((sk, skIdx) => (
                                <img
                                  key={skIdx}
                                  src={sk.icon || null}
                                  alt={sk.name}
                                  className="w-full aspect-square rounded-lg object-cover border border-sky-200 bg-white"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback if no character unlocked */
                <div className="py-4 space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 p-1 shadow-2xl shadow-blue-500/25 flex items-center justify-center">
                    <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                      <Award className="w-8 h-8 text-orange-500" />
                    </div>
                  </div>
                  <h2 className="text-lg font-black text-blue-800 uppercase font-sans">
                    Recompensas Obtidas
                  </h2>
                  <p className="text-[11px] text-blue-900">
                    Parabéns por completar os objetivos da missão!
                  </p>
                </div>
              )}

              <div className="w-full pt-1">
                <button
                  onClick={() => {
                    playClickSound();
                    setRewardModalData(null);
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-700 via-sky-600 to-blue-700 hover:brightness-110 active:scale-95 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-xl shadow-blue-500/25 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <img src="/static/img/icon/confirm-cloud.svg" alt="" className="w-6 h-6 object-contain" />
                  <span>INCRÍVEL! EXCELENTE</span>
                </button>
              </div>
              </div>

              {/* Other Rewards Card (do lado do card do personagem) */}
              {modalCollectibleRewards.map((reward, rewardIndex) => {
                const cardIndexById = allCards.findIndex(item => item.id === reward.value);
                const cardIndexByImage = reward.imageUrl
                  ? allCards.findIndex(item => item.imageUrl === reward.imageUrl)
                  : -1;
                const cardIndex = cardIndexById >= 0 ? cardIndexById : cardIndexByImage;
                const card = cardIndex >= 0 ? allCards[cardIndex] : undefined;
                const artUrl = card?.imageUrl || reward.imageUrl ||
                  (card ? `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${card.slug}/icon.jpg` : '');
                const rarity = card?.rarity || reward.rarity;
                const rarityMeta = rarity ? CARD_RARITY_META[rarity] : undefined;
                const hasAnimatedRarity = rarity === 'lendario' || rarity === 'secreto';

                return (
                  <div key={`${reward.value}-${rewardIndex}`} className="flex h-full w-[min(280px,calc(100vw-2rem))] shrink-0 snap-start flex-col items-center self-stretch text-center">
                    <div className="relative flex min-h-0 w-full flex-1 overflow-hidden rounded-xl">
                      {artUrl ? (
                        <img
                          src={artUrl}
                          alt={`${card?.characterName || 'Figura colecionável'}${card?.title ? ` — ${card.title}` : ''}`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <img src="/static/img/icon/ninja-card-icon.svg" alt="Figura colecionável" className="h-20 w-20 object-contain" />
                        </div>
                      )}
                      {rarity === 'secreto' && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                          {Array.from({ length: 10 }, (_, particleIndex) => (
                            <motion.span
                              key={particleIndex}
                              className="absolute bottom-0 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]"
                              style={{
                                left: `${8 + ((particleIndex * 37) % 84)}%`,
                                width: particleIndex % 3 === 0 ? 4 : 3,
                                height: particleIndex % 3 === 0 ? 4 : 3,
                              }}
                              initial={{ y: 0, opacity: 0, scale: 0.6 }}
                              animate={{ y: -260, opacity: [0, 0.9, 0.75, 0], scale: [0.6, 1.1, 0.8] }}
                              transition={{
                                duration: 2.8 + (particleIndex % 4) * 0.35,
                                delay: particleIndex * 0.32,
                                ease: 'easeOut',
                                repeat: Infinity,
                                repeatDelay: 0.2,
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {hasAnimatedRarity && (
                        <motion.div
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-y-1/4 left-0 z-30 w-3/4"
                          initial={{ x: '-140%', rotate: -18 }}
                          animate={{ x: '200%', rotate: -18 }}
                          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0 }}
                          style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.26) 42%, rgba(255,255,255,0.68) 50%, rgba(255,255,255,0.26) 58%, rgba(255,255,255,0.06) 75%, transparent 100%)',
                            filter: 'blur(3px) drop-shadow(0 0 12px rgba(255,255,255,0.65))',
                            mixBlendMode: 'screen',
                          }}
                        />
                      )}
                      <div className="absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
                      <motion.span
                        animate={rarity === 'secreto'
                          ? { scale: [1, 1.04, 1], boxShadow: ['0 0 0px rgba(239,68,68,0.25)', '0 0 10px rgba(239,68,68,0.8)', '0 0 0px rgba(239,68,68,0.25)'] }
                          : undefined}
                        transition={rarity === 'secreto' ? { duration: 1.8, ease: 'easeInOut', repeat: Infinity } : undefined}
                        className={`absolute left-2 top-2 z-50 rounded-md border px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider ${
                          rarity === 'secreto'
                            ? 'border-red-300 bg-red-600/95 text-white'
                            : rarityMeta?.chip || 'border-sky-300/60 bg-slate-950/65 text-sky-100'
                        }`}
                      >
                        ◆ {rarityMeta?.label || 'Figura'}
                      </motion.span>
                      <div className="absolute bottom-2 left-2 right-2 z-50 text-center">
                        <p className="truncate text-sm font-black text-white">
                          {card?.characterName || 'Figura colecionável'}
                        </p>
                        <p className={`text-sm font-mono font-black uppercase tracking-wider ${rarityMeta?.text || 'text-sky-200'}`}>
                          #{cardIndex >= 0 ? String(cardIndex + 1).padStart(3, '0') : 'NOVA'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {modalOtherRewards.length > 0 && (
                <div className="relative w-full max-w-[280px] shrink-0 snap-start self-stretch overflow-hidden rounded-3xl border-2 border-sky-200 bg-white p-4 shadow-[0_12px_35px_rgba(37,99,235,0.16)] flex flex-col gap-4">
                  <div className="flex items-center gap-3 border-b border-sky-100 pb-3 text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                      <Award className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-black uppercase tracking-wider text-blue-800">
                        Outras recompensas
                      </h3>
                      <p className="mt-0.5 text-[10px] font-medium text-blue-500">
                        {modalOtherRewards.length} item{modalOtherRewards.length === 1 ? '' : 's'} desbloqueado{modalOtherRewards.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2">
                    {modalOtherRewards.map((r, rIdx) => {
                      const foundCard = r.type === 'card' ? allCards.find(c => c.id === r.value) : undefined;
                      const foundSkillSkin = r.type === 'skill_skin'
                        ? skillSkinItems.find(item => item.id === r.value)
                        : undefined;
                      const rewardName = r.type === 'title' ? 'Título' :
                        r.type === 'banner' ? 'Banner' :
                        r.type === 'card' ? 'Figura colecionável' :
                        r.type === 'skill_skin' ? 'Skin de habilidade' :
                        r.type === 'ryos' ? 'Moedas' :
                        r.type === 'gems' ? 'Ryos' : 'Moldura';
                      const rewardValue = r.type === 'card' && foundCard
                        ? `${foundCard.characterName} — ${foundCard.title}`
                        : r.type === 'skill_skin'
                          ? foundSkillSkin?.name || r.value
                          : r.type === 'ryos' || r.type === 'gems'
                          ? `${Number(r.value).toLocaleString('pt-BR')} ${rewardName}`
                          : r.value;

                      return (
                        <div
                          key={rIdx}
                          className="flex min-w-0 items-center gap-3 rounded-2xl border border-sky-100 border-l-4 border-l-orange-400 bg-sky-50/80 px-3 py-2.5 text-left"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-sky-100">
                            {r.type === 'title' ? <Award className="h-4 w-4" /> :
                             r.type === 'banner' ? <Image className="h-4 w-4" /> :
                             r.type === 'card' ? <img src="/static/img/icon/ninja-card-icon.svg" alt="" className="h-5 w-5 object-contain" /> :
                             r.type === 'skill_skin' ? <Sparkles className="h-4 w-4" /> :
                             r.type === 'ryos' ? <img src="/static/img/icon/gold.webp" alt="" className="h-5 w-5 object-contain" /> :
                             r.type === 'gems' ? <img src="/static/img/icon/ryo.webp" alt="" className="h-5 w-5 object-contain" /> :
                             <Shield className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-blue-500">
                              {rewardName}
                            </p>
                            {r.type === 'banner' && r.imageUrl ? (
                              <img
                                src={r.imageUrl}
                                alt={r.value || 'Banner da recompensa'}
                                className="mt-1 h-10 w-full max-w-36 rounded-md border border-sky-200 object-cover"
                              />
                            ) : (
                              <p className="break-words text-xs font-bold leading-snug text-blue-950">
                                {rewardValue || 'Recompensa desbloqueada'}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
            <button
              onClick={() => {
                playClickSound();
                setRewardModalData(null);
              }}
              className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[60] flex w-[min(280px,calc(100vw-2rem))] -translate-x-1/2 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 via-sky-600 to-blue-700 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-blue-500/25 transition hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <img src="/static/img/icon/confirm-cloud.svg" alt="" className="h-6 w-6 object-contain" />
              <span>RESGATAR</span>
            </button>
          </div>
        )}

      </AnimatePresence>

      <div className="relative z-10 max-w-7xl w-full mx-auto p-4 pb-20 sm:p-6 sm:pb-24 space-y-5">
      {/* Main Tab View 1: MISSÕES */}
      {mainTab === 'missoes' && (
        <div className="space-y-3">
          {showQuestFilters && (
          <div id="quest-filter-panel" className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/85 p-3 shadow-xl backdrop-blur sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={questSearch}
                onChange={event => {
                  setQuestSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t('Pesquisar missão pelo nome...', 'Search missions by name...')}
                aria-label={t('Pesquisar missão pelo nome', 'Search missions by name')}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('Status', 'Status')}</span>
              <select
                value={activeTab}
                onChange={event => {
                  setActiveTab(event.target.value as 'available' | 'completed' | 'all');
                  setCurrentPage(1);
                }}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs font-semibold text-slate-100 outline-none focus:border-orange-500"
              >
                <option value="available">{t('Disponíveis', 'Available')}</option>
                <option value="completed">{t('Concluídas', 'Completed')}</option>
                <option value="all">{t('Todas', 'All')}</option>
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('Rank', 'Rank')}</span>
              <select
                value={rankFilter}
                onChange={event => {
                  setRankFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs font-semibold text-slate-100 outline-none focus:border-orange-500"
              >
                <option value="">{t('Todos os ranks', 'All ranks')}</option>
                {RANK_LIST.map(rank => <option key={rank} value={rank}>{rank}</option>)}
              </select>
            </label>

          </div>
          )}

          {/* Quests Listing */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <img src="/static/img/icon/star.svg" alt="Loading" className="w-8 h-8 animate-spin object-contain" />
              <p className="text-slate-400 text-xs font-mono">Buscando missões secretas na névoa...</p>
            </div>
) : filteredQuests.length > 0 ? (
            <>
              <div
                className="quest-carousel flex gap-4 overflow-x-auto overflow-y-hidden"
                role="region"
                aria-label={t('Missões — deslize horizontalmente para navegar', 'Missions — swipe horizontally to browse')}
                tabIndex={0}
              >
                <AnimatePresence>
                  {paginatedQuests.map((quest) => {
                    const lockCheck = isQuestLocked(quest);
                  const isCompleted = user.completedQuestIds?.includes(quest.id) || quest.completed;
                  const allGoalsMet = quest.goals.every(g => g.currentValue >= g.targetValue);

                  return (
                    <motion.div
                      key={quest.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.25 }}
                      onClick={() => {
                        if (isCompleted) handleViewCompletedRewards(quest);
                      }}
                      className={`quest-carousel-card bg-white rounded-2xl border flex flex-col justify-between relative shadow-xl ${
                        isCompleted
                          ? 'border-sky-200 shadow-sky-950/10 cursor-pointer hover:border-sky-400 hover:shadow-sky-500/20 transition-all duration-300'
                          : lockCheck.locked
                            ? 'border-blue-100 opacity-65'
                            : allGoalsMet
                              ? 'border-orange-400 shadow-orange-500/20 animate-[pulse_3s_infinite]'
                              : 'border-blue-100 hover:border-sky-300 hover:shadow-2xl hover:shadow-sky-900/10 transition-all duration-300'
                      }`}
                    >
                      {/* Quest Cover Image */}
                      <div className="h-40 w-full relative overflow-hidden rounded-t-2xl group">
                        <img
                          src={quest.coverUrl || '/static/img/ui/pergaminho.webp'}
                          alt={quest.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-blue-950/80 via-blue-950/20 to-transparent" />
                        
                        {/* Status badge top right */}
                        <div className="absolute top-3 right-3">
                          {isCompleted ? (
                            <div className="flex items-center gap-1 bg-white/95 border border-sky-200 text-blue-700 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase shadow-md">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Concluída</span>
                            </div>
                          ) : lockCheck.locked ? (
                            <div className="flex items-center gap-1 bg-white/95 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-lg text-[10px] font-mono shadow-md">
                              <Lock className="w-3.5 h-3.5 text-blue-500" />
                              <span>Bloqueada</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Quest Title over cover */}
                        <div className="absolute bottom-3 left-4 right-4">
                          <h3 className="font-extrabold text-lg text-white leading-snug drop-shadow-md">
                            {quest.title}
                          </h3>
                        </div>
                      </div>

                      {/* Quest Body / Content */}
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                        <div className="space-y-4">
                          <div>
                            <p className={`text-xs text-blue-950 leading-relaxed font-sans ${!expandedDesc[quest.id] ? 'line-clamp-2' : ''}`}>
                              {quest.desc}
                            </p>
                            {quest.desc.length > 200 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedDesc(prev => ({ ...prev, [quest.id]: !prev[quest.id] })); }}
                                className="text-[10px] font-mono uppercase tracking-wider text-orange-600 hover:text-orange-700 transition-colors cursor-pointer -mt-0.5"
                              >
                                {expandedDesc[quest.id] ? 'Ver menos' : 'Ler tudo'}
                              </button>
                            )}
                          </div>

                          {/* Goals Checklist */}
                          <div className="space-y-3">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-blue-700 font-bold border-b border-sky-100 pb-1.5 flex justify-between items-center">
                              <span>Metas da Missão</span>
                              {(() => {
                                if (!quest.minRank) return null;
                                const qRankLower = quest.minRank.trim().toLowerCase();
                                const r = ranksList.find(rr => {
                                  const nameLower = rr.name.trim().toLowerCase();
                                  return nameLower === qRankLower || nameLower.includes(qRankLower) || qRankLower.includes(nameLower);
                                });
                                const isNone = !r?.color || r.color === 'none';
                                const bgClass = isNone
                                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                                  : (r.color.includes('bg-gradient') ? r.color : `bg-gradient-to-r ${r.color}`);
                                return (
                                  <div
                                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono uppercase tracking-wider font-extrabold shadow-md flex items-center gap-1.5 overflow-hidden relative ${bgClass}`}
                                    style={{
                                      ...(r?.bgColor ? { backgroundColor: r.bgColor } : {}),
                                      color: r?.fontColor || '#ffffff'
                                    }}
                                  >
                                    {r?.imageUrl && <img src={r.imageUrl} alt="" className="rank-bg-img absolute inset-0 w-full h-full object-cover opacity-40" />}
                                    {r?.iconUrl ? (
                                      <img src={r.iconUrl} alt="" className="w-3.5 h-3.5 object-contain relative z-10" />
                                    ) : (
                                      <Award className="w-3.5 h-3.5 relative z-10" />
                                    )}
                                    <span className="relative z-10">{r?.name || quest.minRank}</span>
                                  </div>
                                );
                              })()}
                            </div>
                            {quest.goals.slice(0, expandedGoals[quest.id] ? quest.goals.length : 3).map((goal) => {
                              const met = goal.currentValue >= goal.targetValue;
                              const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
                              
                              return (
                                <div key={goal.id} className="space-y-1.5">
                                  <div className="flex justify-between items-start text-xs">
                                    <span className="text-blue-950 font-medium">
                                      {renderHighlightedGoalDescription(goal)}
                                    </span>
                                    <span className={`font-mono font-bold text-[11px] ${met ? 'text-blue-700' : 'text-orange-600'}`}>
                                      {goal.currentValue} / {goal.targetValue}
                                    </span>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="h-1.5 w-full bg-sky-50 rounded-full overflow-hidden border border-sky-100">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        met 
                                          ? 'bg-blue-600'
                                          : 'bg-gradient-to-r from-orange-500 to-amber-400'
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            {quest.goals.length > 3 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedGoals(prev => ({ ...prev, [quest.id]: !prev[quest.id] })); }}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50/70 py-2 text-[10px] font-bold uppercase tracking-wider text-orange-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 cursor-pointer"
                              >
                                {expandedGoals[quest.id] ? (
                                  <>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                    <span>Mostrar menos metas</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                    <span>Ver todas as metas ({quest.goals.length})</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {/* Rewards */}
                          {quest.rewards && quest.rewards.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-sky-100">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-blue-700">
                                Recompensas
                              </div>
                              {quest.rewards.some(reward => reward.type === 'unlock_character') && (
                                <div className="grid grid-cols-2 gap-2">
                                  {quest.rewards.map((r, rIdx) => {
                                    if (r.type !== 'unlock_character') return null;
                                    const ch = getCharacters().find(c => c.name === r.value || c.id === r.value);
                                    const characterName = ch?.name || r.value;

                                    return (
                                      <div
                                        key={rIdx}
                                        title={characterName}
                                        className="min-w-0 px-2.5 py-1 rounded-lg border border-orange-200 bg-orange-50 text-orange-800 text-[11px] font-bold flex items-center gap-1.5 shadow-sm"
                                      >
                                        {ch ? (
                                          <div className="electric-border relative w-10 h-10 overflow-hidden flex-shrink-0 bg-blue-50 rounded-md">
                                            <MangekyoLoader src={ch.portrait} alt={characterName} className="w-full h-full" imgClassName="electric-content" iconScale={0.55} />
                                          </div>
                                        ) : (
                                          <Award className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                                        )}
                                        <span className="min-w-0 truncate">{characterName}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {quest.rewards.some(reward => reward.type === 'ryos' || reward.type === 'gems') && (
                                <div className="grid grid-cols-2 gap-2">
                                  {(['gems', 'ryos'] as const).flatMap(type =>
                                    quest.rewards
                                      .map((reward, index) => ({ reward, index }))
                                      .filter(({ reward }) => reward.type === type)
                                      .map(({ reward, index }) => (
                                        <div
                                          key={`${type}-${index}`}
                                          title={type === 'gems' ? 'Ryos' : 'Moedas'}
                                          aria-label={`${type === 'gems' ? 'Ryos' : 'Moedas'}: ${Number(reward.value).toLocaleString('pt-BR')}`}
                                          className={`flex min-h-12 min-w-0 items-center gap-2 rounded-lg border px-2 py-2 shadow-sm ${
                                            type === 'gems'
                                              ? 'border-violet-200 bg-violet-50 text-violet-950'
                                              : 'border-amber-200 bg-amber-50 text-amber-950'
                                          }`}
                                        >
                                          <img
                                            src={type === 'gems' ? '/static/img/icon/ryo.webp' : '/static/img/icon/gold.webp'}
                                            alt=""
                                            className="h-8 w-8 flex-shrink-0 object-contain drop-shadow-sm"
                                          />
                                          <span className="text-sm font-black tabular-nums">
                                            {Number(reward.value).toLocaleString('pt-BR')}
                                          </span>
                                        </div>
                                      ))
                                  )}
                                </div>
                              )}
                              {quest.rewards.some(reward => reward.type !== 'unlock_character' && reward.type !== 'ryos' && reward.type !== 'gems') && (
                                <div className="flex flex-col gap-2">
                                  {quest.rewards.map((r, rIdx) => r.type === 'unlock_character' || r.type === 'ryos' || r.type === 'gems' ? null : (
                                    <div
                                      key={rIdx}
                                      className="w-full min-w-0 px-2.5 py-1 rounded-lg border border-sky-100 bg-sky-50 text-blue-800 text-[11px] font-bold flex items-center gap-1.5 shadow-sm"
                                    >
                                      {r.type === 'banner' ? (
                                        <Image className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                      ) : r.type === 'card' ? (
                                        <img src="/static/img/icon/ninja-card-icon.svg" alt="" className="w-3.5 h-3.5 flex-shrink-0" />
                                      ) : r.type === 'skill_skin' ? (
                                        <Sparkles className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                                      ) : (
                                        <Award className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                      )}
                                      <span className="min-w-0 truncate">
                                        {r.type === 'title' ? `Título: « ${r.value} »` :
                                          r.type === 'banner' ? 'Banner' :
                                            r.type === 'card' ? 'Figura colecionável' :
                                                r.type === 'skill_skin' ? `Skin de habilidade: ${skillSkinItems.find(item => item.id === r.value)?.name || r.value}` :
                                                r.type === 'frame' ? `Moldura: ${r.value}` :
                                                `Recompensa: ${r.value}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                )}
                            </div>
                          )}
                        </div>

                        {/* Button Action */}
                        <div className="pt-4 mt-auto">
                          {isCompleted ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewCompletedRewards(quest); }}
                              className="w-full py-2.5 bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 font-sans uppercase tracking-wider shadow-md shadow-emerald-950/20 transition cursor-pointer active:scale-95"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Missão Concluída</span>
                            </button>
                          ) : lockCheck.locked ? (
                            <div className="w-full py-2.5 bg-slate-950 border border-slate-800 text-slate-500 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 font-sans uppercase tracking-wider" title={lockCheck.reason}>
                              <Lock className="w-3.5 h-3.5 text-slate-600" />
                              <span>{lockCheck.reason}</span>
                            </div>
                          ) : allGoalsMet ? (
                            <button
                              onClick={() => handleClaimReward(quest)}
                              disabled={claimedRewardId === quest.id}
                              data-sound="uah"
                              className="w-full py-2.5 bg-gradient-to-r from-blue-700 to-sky-500 hover:brightness-110 active:scale-95 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer font-sans uppercase tracking-wider shadow-lg shadow-blue-500/20"
                            >
                              {claimedRewardId === quest.id ? (
                                <img src="/static/img/icon/star.svg" alt="Loading" className="w-4 h-4 animate-spin object-contain" />
                              ) : (
                                <Sparkles className="w-4 h-4 fill-white text-white" />
                              )}
                              <span>Resgatar Recompensa</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartQuest(quest)}
                              className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:brightness-110 active:scale-95 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer font-sans uppercase tracking-wider shadow-lg shadow-orange-500/20"
                            >
                              <img src="/static/img/icon/cloud.svg" alt="" className="w-7 h-7 brightness-0 invert" />
                              <span>Iniciar Missão</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <button
                    onClick={() => {
                      playScrollSound();
                      setCurrentPage(p => Math.max(1, p - 1));
                    }}
                    data-sound="Scroll"
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-sky-50 text-blue-800 border border-sky-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => {
                        playScrollSound();
                        setCurrentPage(page);
                      }}
                      data-sound="Scroll"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                        page === currentPage
                          ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-white font-black shadow-md shadow-orange-600/10'
                          : 'bg-white hover:bg-sky-50 text-blue-800 border border-sky-200'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      playScrollSound();
                      setCurrentPage(p => Math.min(totalPages, p + 1));
                    }}
                    data-sound="Scroll"
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white hover:bg-sky-50 text-blue-800 border border-sky-200"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-20 border border-dashed border-slate-800 rounded-2xl text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-xs font-mono">Nenhuma missão encontrada para esta categoria.</p>
            </div>
          )}
        </div>
      )}

      {/* Main Tab View 2: PERFIL */}
      {mainTab === 'perfil' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cartão Shinobi (Pergaminho Frame) */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-between min-h-[230px] group select-none">
            {/* Background Pergaminho Image (Crisp & Natural) */}
            <img 
              src="/static/img/ui/pergaminho.webp" 
              alt="Pergaminho Shinobi" 
              className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none"
            />

            {/* Card Content (Parchment Styled Dark Text) */}
            {(() => {
              const completedCount = quests.filter(q => q.completed || user.completedQuestIds?.includes(q.id)).length;
              return (
            <div className="relative z-10 px-10 sm:px-12 py-10 flex flex-col justify-between h-full min-h-[220px]">
              {/* Top Section: Avatar + Name Info */}
              <div className="flex items-center gap-3.5">
                <img
                  src={user.photoUrl || null}
                  alt={user.name}
                  className="w-14 h-14 rounded-full border-2 border-[#5a381a] object-cover shadow-md bg-stone-200"
                  referrerPolicy="no-referrer"
                />
                <div className="text-left leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-stone-900 tracking-tight font-sans">
                      {user.name}
                    </span>
                    <span className="text-xs text-stone-800">❖</span>
                  </div>
                  
                  {user.title ? (
                    <p className="text-xs text-amber-900 font-bold tracking-wide">
                      « {user.title} »
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-700 font-semibold">
                      Sem titulo equipado
                    </p>
                  )}
                  
                  <p className="text-xs font-mono font-bold uppercase text-stone-900 tracking-wider pt-0.5">
                    @{user.username}
                  </p>
                </div>
              </div>

              {/* Middle Section: Rank Box */}
              <div className="my-2 pt-2 border-t border-stone-900/20">
                <div className="flex items-center gap-3">
                  {(() => {
                    const r = ranksList.find(rr => rr.name === currentRank || rr.name.toLowerCase() === currentRank.toLowerCase());
                    const isNone = !r?.color || r.color === 'none';
                    const bgClass = isNone
                      ? ''
                      : (r.color.includes('bg-gradient') ? r.color : `bg-gradient-to-r ${r.color}`);
                    return (
                      <div
                        className={`relative px-3 py-1 rounded-md font-black text-xs uppercase tracking-wider shadow-sm flex items-center gap-1.5 overflow-hidden ${bgClass}`}
                        style={{
                          ...(r?.bgColor ? { backgroundColor: r.bgColor } : {}),
                          color: r?.fontColor || '#ffffff'
                        }}
                      >
                        {r?.imageUrl && <img src={r.imageUrl} alt="" className="rank-bg-img absolute inset-0 w-full h-full object-cover opacity-40" />}
                        {r?.iconUrl ? (
                          <img src={r.iconUrl} alt="" className="w-3.5 h-3.5 object-contain relative z-10" />
                        ) : (
                          <Award className="w-3.5 h-3.5 relative z-10 text-amber-400" />
                        )}
                        <span className="relative z-10">{currentRank}</span>
                      </div>
                    );
                  })()}
                  <span className="text-xs font-bold text-stone-800 tracking-wide">
                    Rank Atual
                  </span>
                </div>
              </div>

              {/* Bottom Section: Missions & Level */}
              <div className="pt-2 border-t border-stone-900/20 flex items-center justify-between text-stone-950 font-sans">
                <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                  <Star className="w-4 h-4 text-amber-600 fill-amber-500" />
                  <span>{completedCount} Missões Feitas</span>
                </div>
                
                <div className="font-black text-xs sm:text-sm text-stone-950">
                  Nível {completedCount + 1}
                </div>
              </div>
            </div>
            );
          })()}
          </div>

          {/* Unlocked Titles Area */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between backdrop-blur-md">
            <div className="space-y-3">
              <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                <Award className="w-4 h-4 text-orange-400" />
                <span>Seus Títulos Desbloqueados</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Conclua missões de rank alto para destravar títulos honorários. Clique em um título abaixo para equipá-lo no seu cartão.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {user.unlockedTitles && user.unlockedTitles.length > 0 ? (
                  user.unlockedTitles.map((tName) => {
                    const isEquipped = user.title === tName;
                    return (
                      <button
                        key={tName}
                        onClick={() => handleEquipTitle(tName)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          isEquipped 
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black shadow-md shadow-orange-500/20 scale-105'
                            : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60'
                        }`}
                      >
                        <span>{tName}</span>
                        {isEquipped && <Sparkles className="w-3 h-3 fill-slate-950 text-slate-950" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-xs text-slate-500 italic py-2">
                    Nenhum título desbloqueado ainda. Conclua missões na aba "Missões" para ganhar títulos!
                  </div>
                )}
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-mono pt-4 border-t border-slate-800/40 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-500" />
              <span>Títulos equipados aparecem no menu principal e na arena de combate.</span>
            </div>
          </div>
        </div>
      )}

      </div>
      {mainTab === 'missoes' && (
        <button
          type="button"
          onClick={() => {
            playClickSound();
            setShowQuestFilters(open => !open);
          }}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full border border-sky-300/70 bg-slate-950/90 text-sky-200 shadow-xl shadow-slate-950/60 backdrop-blur transition hover:scale-105 hover:bg-slate-900 hover:text-white"
          aria-label={showQuestFilters ? t('Ocultar filtros', 'Hide filters') : t('Mostrar filtros', 'Show filters')}
          aria-expanded={showQuestFilters}
          aria-controls="quest-filter-panel"
        >
          <Filter className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        onClick={onBack}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 grid h-12 w-12 place-items-center rounded-full border border-orange-400/70 bg-slate-950/90 text-orange-300 shadow-xl shadow-slate-950/60 backdrop-blur transition hover:scale-105 hover:bg-slate-900 hover:text-orange-200"
        aria-label={t('Voltar ao lobby', 'Back to lobby')}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
    </div> 
  );
}
