/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { safeFetchJson } from '../lib/api';
import { 
  Award, 
  Lock, 
  CheckCircle, 
  Play, 
  ArrowLeft, 
  User, 
  Star, 
  ChevronRight, 
  ChevronLeft,
  Compass, 
  BookOpen, 
  Sparkles,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  Swords,
  Calendar,
  ShoppingBag,
  Shield,
  X,
  Zap
} from 'lucide-react';
import { Quest, UserProfile, Character, QuestReward } from '../types';
import { getGoalDescription } from '../lib/questUtils';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import { RankConfig, getRanks, getUserRankFromConfig, fetchRanksFromServer } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { getCharacters } from '../lib/characterStorage';
import { useLanguage } from '../lib/i18n';

interface QuestBoardProps {
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
  onSelectQuest: (quest: Quest) => void;
  onGoToBattle: () => void;
  onBack: () => void;
  playClickSound: () => void;
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
  onGoToBattle,
  onBack,
  playClickSound,
  playWinSound,
}: QuestBoardProps) {
  const { t } = useLanguage();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [ranksList, setRanksList] = useState<RankConfig[]>(getRanks());
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'missoes' | 'perfil'>('missoes');
  const [activeTab, setActiveTab] = useState<'available' | 'completed' | 'all'>('available');
  const [rankFilter, setRankFilter] = useState<string>('');
  const [claimedRewardId, setClaimedRewardId] = useState<string | null>(null);

  // Modals state
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
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
  }, []);

  const fetchQuests = async () => {
    try {
      setLoading(true);
      const data = await safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests');
      if (data && data.success && Array.isArray(data.quests)) {
        // Sync completed quests with user profile
        const userCompletedIds = user.completedQuestIds || [];
        let synced = data.quests.map((q: Quest) => ({
          ...q,
          completed: userCompletedIds.includes(q.id)
        }));

        // Missões bloqueadas (e as novas que ainda não desbloquearam) só começam a
        // contar a meta a partir do momento em que são desbloqueadas. Zera o progresso
        // acumulado delas para que vitórias/batalhas anteriores ao desbloqueio não contem.
        const lockedIds = computeLockedQuestIds(synced, user, ranksList);
        let changed = false;
        synced = synced.map(q => {
          if (lockedIds.has(q.id) && q.goals?.some(g => (g.currentValue || 0) > 0 || (g.currentStreak || 0) > 0)) {
            changed = true;
            return {
              ...q,
              goals: q.goals.map(g => ({ ...g, currentValue: 0, currentStreak: 0 }))
            };
          }
          return q;
        });

        setQuests(synced);

        // Persiste o progresso zerado no servidor para que a missão comece do zero quando desbloquear
        if (changed) {
          try {
            await safeFetchJson('/api/quests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quests: synced })
            });
          } catch (err) {
            console.error('Error persisting zeroed locked quest progress:', err);
          }
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
    playClickSound();
    
    // Check if goals are fully completed
    const allGoalsMet = quest.goals.every(g => g.currentValue >= g.targetValue);
    if (!allGoalsMet) return;

    // Trigger visual feedback
    setClaimedRewardId(quest.id);
    playWinSound();

    setTimeout(async () => {
      const updatedCompletedIds = [...(user.completedQuestIds || []), quest.id];
      const updatedUnlockedChars = [...(user.unlockedCharacterNames || [])];
      const updatedUnlockedTitles = [...(user.unlockedTitles || [])];
      const updatedUnlockedFrames = [...(user.unlockedFrames || [])];
      const updatedUnlockedFrameUrls = [...(user.unlockedFrameUrls || [])];
      const updatedUnlockedBanners = [...(user.unlockedBanners || [])];
      const updatedUnlockedBannerUrls = [...(user.unlockedBannerUrls || [])];

      let equippedFrame = user.equippedFrame;
      let equippedFrameUrl = user.equippedFrameUrl;
      let equippedBannerUrl = user.equippedBannerUrl;

      const allChars = getCharacters();
      const unlockedChars: Character[] = [];
      const otherRewardsList: QuestReward[] = [];

      // Process rewards
      quest.rewards.forEach(r => {
        if (r.type === 'title' && !updatedUnlockedTitles.includes(r.value)) {
          updatedUnlockedTitles.push(r.value);
          otherRewardsList.push(r);
        } else if (r.type === 'unlock_character') {
          if (!updatedUnlockedChars.includes(r.value)) {
            updatedUnlockedChars.push(r.value);
          }
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
        } else if (r.type === 'frame') {
          if (!updatedUnlockedFrames.includes(r.value)) {
            updatedUnlockedFrames.push(r.value);
          }
          if (r.imageUrl && !updatedUnlockedFrameUrls.includes(r.imageUrl)) {
            updatedUnlockedFrameUrls.push(r.imageUrl);
          }
          if (!equippedFrameUrl && r.imageUrl) {
            equippedFrame = r.value;
            equippedFrameUrl = r.imageUrl;
          }
          otherRewardsList.push(r);
        } else if (r.type === 'banner') {
          if (!updatedUnlockedBanners.includes(r.value)) {
            updatedUnlockedBanners.push(r.value);
          }
          if (r.imageUrl && !updatedUnlockedBannerUrls.includes(r.imageUrl)) {
            updatedUnlockedBannerUrls.push(r.imageUrl);
          }
          if (!equippedBannerUrl && r.imageUrl) {
            equippedBannerUrl = r.imageUrl;
          }
          otherRewardsList.push(r);
        }
      });

      const updatedUser: UserProfile = {
        ...user,
        completedQuestIds: updatedCompletedIds,
        unlockedCharacterNames: updatedUnlockedChars,
        unlockedTitles: updatedUnlockedTitles,
        unlockedFrames: updatedUnlockedFrames,
        unlockedFrameUrls: updatedUnlockedFrameUrls,
        unlockedBanners: updatedUnlockedBanners,
        unlockedBannerUrls: updatedUnlockedBannerUrls,
        equippedFrame,
        equippedFrameUrl,
        equippedBannerUrl,
      };

      // Save user profile locally
      onUpdateUser(updatedUser);

      // Save synced quests on server
      const updatedQuestsList = quests.map(q => q.id === quest.id ? { ...q, completed: true } : q);
      setQuests(updatedQuestsList);

      try {
        await safeFetchJson('/api/quests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quests: updatedQuestsList })
        });
      } catch (err) {
        console.error('Error saving claimed quest on server:', err);
      }

      setClaimedRewardId(null);

      // Open character reward card modal
      setRewardModalData({
        questTitle: quest.title,
        unlockedCharacters: unlockedChars,
        otherRewards: otherRewardsList
      });
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
      } else if (r.type === 'frame' || r.type === 'banner') {
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
  });

  const totalPages = Math.ceil(filteredQuests.length / ITEMS_PER_PAGE);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedQuests = filteredQuests.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="quest-div-pai min-h-screen w-full relative">
      <div className="absolute inset-0 pointer-events-none z-0" />

      {/* Interactive Modals inside the Arena/Quartel Shinobi Hub */}
      <AnimatePresence>
        {rewardModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 backdrop-blur-xl overflow-y-auto select-none">
            {/* Ambient Background Rays & Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/25 via-orange-600/10 to-transparent pointer-events-none animate-pulse" />

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
                  className="absolute w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-300 via-yellow-400 to-orange-500 shadow-md shadow-amber-400/60"
                />
              ))}
            </div>

            {/* Main Reward Cards Container */}
            <motion.div
              initial={{ scale: 0.15, opacity: 0, y: 70, rotate: -7 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
              exit={{ scale: 0.2, opacity: 0, y: 50, rotate: 7 }}
              transition={{ type: "spring", damping: 14, stiffness: 125, bounce: 0.35 }}
              className="relative flex flex-col sm:flex-row items-center sm:items-stretch justify-center gap-3 z-10 my-auto"
            >
              {/* Character Reward Card */}
              <div className="quest-reward-card relative bg-slate-900/95 border-2 border-amber-400/90 rounded-3xl p-3.5 sm:p-4 shadow-[0_0_70px_rgba(245,158,11,0.4)] flex flex-col items-center text-center space-y-2.5">
              {/* Outer Pulsing Glow Aura */}
              <div className="absolute -inset-1 rounded-[26px] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-300 opacity-40 blur-lg -z-10 animate-pulse" />

              {/* Close button top right */}
              <button
                onClick={() => {
                  playClickSound();
                  setRewardModalData(null);
                }}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition cursor-pointer z-20"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Top Badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/30 to-amber-500/20 border border-amber-400/70 shadow-lg shadow-amber-500/20">
                <img src="/static/img/icon/star.webp" alt="Loading" className="w-3 h-3 animate-spin object-contain" />
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-sans">
                  {rewardModalData.unlockedCharacters.length > 0
                    ? 'NOVO PERSONAGEM'
                    : 'RECOMPENSA RESGATADA!'}
                </span>
                <img src="/static/img/icon/star.webp" alt="Loading" className="w-3 h-3 animate-spin object-contain" />
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
                        <div className="relative w-full h-36 sm:h-40 max-w-[240px] mx-auto rounded-2xl overflow-hidden border-2 border-amber-400/90 shadow-[0_10px_35px_rgba(245,158,11,0.35)] bg-slate-950 flex items-center justify-center group">
                          {/* Inner Radial Aura */}
                          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/35 via-orange-600/15 to-slate-950 z-0" />
                          
                          {/* Animated Lighting Rays inside Card */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-amber-300/10 opacity-70 animate-pulse pointer-events-none z-10" />

                          {/* Large Floating Character Image */}
                          <motion.img
                            src={displayImg || null}
                            alt={char.name}
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1, y: [0, -8, 0] }}
                            transition={{
                              scale: { duration: 0.5 },
                              opacity: { duration: 0.5 },
                              y: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                            }}
                            className="relative z-20 w-full h-full object-contain p-2 filter drop-shadow-[0_12px_28px_rgba(245,158,11,0.5)]"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              if (e.currentTarget.src !== char.portrait) {
                                e.currentTarget.src = char.portrait;
                              }
                            }}
                          />

                          {/* Bottom Dark Gradient Overlay for Typography contrast */}
                          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-30" />

                          {/* Character Name Label over Image */}
                          <div className="absolute bottom-2 left-0 right-0 z-40 px-2 text-center">
                            <h2 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-100 to-orange-400 font-sans tracking-wider uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]">
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
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase tracking-wider shadow-sm"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Character Description */}
                        <p className="text-xs text-slate-300 leading-relaxed max-w-md font-sans line-clamp-3">
                          {char.description}
                        </p>

                        {/* Skills Showcase */}
                        {char.skills && char.skills.length > 0 && (
                          <div className="w-full bg-slate-950/90 p-2.5 rounded-xl border border-amber-500/30 space-y-1.5 text-left">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1 justify-center">
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span>Habilidades</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {char.skills.slice(0, 4).map((sk, skIdx) => (
                                <img
                                  key={skIdx}
                                  src={sk.icon || null}
                                  alt={sk.name}
                                  className="w-full aspect-square rounded-lg object-cover border border-amber-500/40 bg-slate-900"
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
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 p-1 shadow-2xl shadow-amber-500/30 flex items-center justify-center">
                    <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center">
                      <Award className="w-8 h-8 text-amber-400" />
                    </div>
                  </div>
                  <h2 className="text-lg font-black text-amber-300 uppercase font-sans">
                    Recompensas Obtidas
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Parabéns por completar os objetivos da missão!
                  </p>
                </div>
              )}

              {/* Confirm Button */}
              <div className="w-full pt-1">
                <button
                  onClick={() => {
                    playClickSound();
                    setRewardModalData(null);
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:brightness-110 active:scale-95 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-xl shadow-orange-500/30 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
                  <span>INCRÍVEL! EXCELENTE</span>
                </button>
              </div>
              </div>

              {/* Other Rewards Card (do lado do card do personagem) */}
              {rewardModalData.otherRewards && rewardModalData.otherRewards.length > 0 && (
                <div className="relative w-full max-w-[220px] bg-slate-900/95 border-2 border-amber-400/90 rounded-3xl p-3.5 sm:p-4 shadow-[0_0_70px_rgba(245,158,11,0.4)] flex flex-col items-center text-center space-y-2.5">
                  {/* Top Badge */}
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/30 to-amber-500/20 border border-amber-400/70 shadow-lg shadow-amber-500/20">
                    <img src="/static/img/icon/star.webp" alt="Loading" className="w-3 h-3 animate-spin object-contain" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-sans">
                      OUTRAS RECOMPENSAS
                    </span>
                    <img src="/static/img/icon/star.webp" alt="Loading" className="w-3 h-3 animate-spin object-contain" />
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    {rewardModalData.otherRewards.map((r, rIdx) => (
                      <div
                        key={rIdx}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        {r.type === 'title' ? `Título: « ${r.value} »` :
                         r.type === 'banner' ? `Banner: ${r.value}` :
                         `Moldura: ${r.value}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showProfileModal && (
          <ProfileModal
            user={user}
            onClose={() => setShowProfileModal(false)}
            onUpdateUser={onUpdateUser}
            playClickSound={playClickSound}
          />
        )}

        {/* EVENTOS E LOJA DESATIVADOS TEMPORARIAMENTE (CÓDIGO PRESERVADO)
        {showEventsModal && (
          <EventsModal
            user={user}
            onClose={() => setShowEventsModal(false)}
            onUpdateUser={onUpdateUser}
            playClickSound={playClickSound}
          />
        )}

        {showShopModal && (
          <ShopModal
            user={user}
            onClose={() => setShowShopModal(false)}
            onUpdateUser={onUpdateUser}
            playClickSound={playClickSound}
          />
        )}
        */}
      </AnimatePresence>

      <div className="relative z-10 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Main Hub Header & Navigation Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-center bg-slate-900/90 backdrop-blur-md p-3 px-4 rounded-2xl border border-slate-800 shadow-2xl gap-4">
        {/* Left: Brand / Title */}
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2.5 rounded-xl border border-orange-400/30 shadow-lg shadow-orange-500/20 flex-shrink-0">
            <Compass className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 font-sans uppercase leading-none">
              Quartel Shinobi
            </h1>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-1">
              Centro de Comando
            </p>
          </div>
        </div>

        {/* Center: User Quick Profile & Wallet Widget */}
        {(() => {
          const ranks = ranksList;
          const userXp = Math.max(0, user.xp || 0);
          const rankProgress = getRankProgress(userXp, ranks);

          return (
            <button
              onClick={() => {
                playClickSound();
                setShowProfileModal(true);
              }}
              className="flex items-center gap-3 bg-slate-950/80 hover:bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-800 hover:border-orange-500/60 transition cursor-pointer group"
              title="Clique para abrir Perfil e Trocar Moldura"
            >
              {/* Avatar with Frame */}
              <div className="relative w-9 h-9 flex-shrink-0">
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 border border-orange-500/50">
                  <img
                    src={user.photoUrl || null}
                    alt={user.name}
                    className="w-full h-full object-cover rounded-full"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {user.equippedFrameUrl && (
                  <img
                    src={user.equippedFrameUrl || null}
                    alt="Moldura"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain z-10"
                  />
                )}
              </div>

              <div className="text-left leading-tight">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-slate-200 group-hover:text-orange-400">{user.name}</span>
                  {(() => {
                    const r = rankProgress.currentRank;
                    const isNone = !r.color || r.color === 'none';
                    const bgClass = isNone
                      ? ''
                      : (r.color.includes('bg-gradient') ? r.color : `bg-gradient-to-r ${r.color}`);
                    return (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase shadow flex items-center gap-1 overflow-hidden relative ${bgClass}`}
                        style={{
                          ...(r.bgColor ? { backgroundColor: r.bgColor } : {}),
                          color: r.fontColor || '#ffffff'
                        }}
                      >
                        {r.imageUrl && (
                          <img src={r.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                        )}
                        {r.iconUrl ? (
                          <img src={r.iconUrl} alt="" className="w-2.5 h-2.5 object-contain relative z-10" />
                        ) : (
                          <Award className="w-2.5 h-2.5 relative z-10" />
                        )}
                        <span className="relative z-10">{r.name}</span>
                      </span>
                    );
                  })()}
                  <span className="text-[9px] font-mono font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 shadow-sm flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-amber-300 inline" />
                    {userXp.toLocaleString()} XP
                  </span>
                  {user.title && (
                    <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                      {user.title}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono font-bold text-orange-400/90 mt-0.5">
                  🪙 {(user.ryos ?? 1500).toLocaleString()} | 💎 {user.gems ?? 120}
                </p>
              </div>
            </button>
          );
        })()}

        {/* Right: Actions and Modals Toolbar (EVENTOS | LOJA | PERFIL & MOLDURAS | MISSÕES | BATALHA | MENU) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 w-full lg:w-auto justify-center">
          {/* MISSÕES TAB */}
          <button
            onClick={() => {
              playClickSound();
              setMainTab('missoes');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mainTab === 'missoes'
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-lg shadow-orange-500/20 font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>{t('Missões', 'Quests')}</span>
          </button>

          {/* EVENTOS E LOJA BOTÕES DESATIVADOS TEMPORARIAMENTE (CÓDIGO PRESERVADO)
          <button
            onClick={() => {
              playClickSound();
              setShowEventsModal(true);
            }}
            className="px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 relative"
            title="Eventos Ativos"
          >
            <Calendar className="w-4 h-4 text-orange-400" />
            <span>Eventos</span>
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping absolute top-1 right-1" />
          </button>

          <button
            onClick={() => {
              playClickSound();
              setShowShopModal(true);
            }}
            className="px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            title="Loja Shinobi"
          >
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <span>Loja</span>
          </button>
          */}

          {/* BATALHA ACTION */}
          <button
            onClick={() => {
              playClickSound();
              onGoToBattle();
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:brightness-110 shadow-md shadow-amber-500/10"
          >
            <Swords className="w-4 h-4 text-slate-950" />
            <span>{t('Batalha', 'Battle')}</span>
          </button>

          {/* MENU BACK BUTTON */}
          <button
            onClick={onBack}
            className="px-3 py-2 text-xs text-slate-400 hover:text-orange-400 transition cursor-pointer font-bold uppercase tracking-wider font-mono hover:bg-slate-900 rounded-lg"
            title={t('Voltar ao Menu Inicial', 'Back to Main Menu')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Tab View 1: MISSÕES */}
      {mainTab === 'missoes' && (
        <div className="space-y-6">
          {/* Sub-Filters Bar for Quests */}
          <div className="bg-slate-900/60 backdrop-blur-md p-2 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {[
                  { id: 'available', pt: 'Disponíveis', en: 'Available' },
                  { id: 'completed', pt: 'Concluídas', en: 'Completed' },
                  { id: 'all', pt: 'Todas', en: 'All' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      playClickSound();
                      setActiveTab(tab.id as any);
                      setCurrentPage(1);
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-black shadow-md shadow-orange-600/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {t(tab.pt, tab.en)}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchQuests}
                className="p-2 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs font-mono"
                title="Sincronizar Missões"
              >
                <img src="/static/img/icon/star.webp" alt="Loading" className={`w-3.5 h-3.5 object-contain ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {RANK_LIST.map(rank => (
                <button
                  key={rank}
                  onClick={() => {
                    setRankFilter(rankFilter === rank ? '' : rank);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                    rankFilter === rank
                      ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-black shadow-md shadow-orange-600/10'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {rank}
                </button>
              ))}
            </div>
          </div>

          {/* Quests Listing */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <img src="/static/img/icon/star.webp" alt="Loading" className="w-8 h-8 animate-spin object-contain" />
              <p className="text-slate-400 text-xs font-mono">Buscando missões secretas na névoa...</p>
            </div>
) : filteredQuests.length > 0 ? (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      className={`bg-slate-900/80 rounded-2xl border flex flex-col justify-between relative shadow-xl backdrop-blur-md ${
                        isCompleted
                          ? 'border-emerald-500/30 shadow-emerald-950/10 cursor-pointer hover:border-emerald-500/70 hover:shadow-emerald-500/10 transition-all duration-300'
                          : lockCheck.locked
                            ? 'border-slate-800/80 brightness-[0.7]'
                            : allGoalsMet
                              ? 'border-amber-500/80 shadow-amber-500/10 animate-[pulse_3s_infinite]'
                              : 'border-slate-800 hover:border-orange-500/50 hover:shadow-2xl hover:shadow-orange-500/5 transition-all duration-300'
                      }`}
                    >
                      {/* Quest Cover Image */}
                      <div className="h-40 w-full relative overflow-hidden group">
                        <img
                          src={quest.coverUrl || '/static/img/ui/pergaminho.webp'}
                          alt={quest.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                        
                        {/* Status badge top right */}
                        <div className="absolute top-3 right-3">
                          {isCompleted ? (
                            <div className="flex items-center gap-1 bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase shadow-md">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Concluída</span>
                            </div>
                          ) : lockCheck.locked ? (
                            <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-lg text-[10px] font-mono shadow-md">
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>Bloqueada</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Quest Title over cover */}
                        <div className="absolute bottom-3 left-4 right-4">
                          <h3 className="font-extrabold text-lg text-slate-100 leading-snug drop-shadow-md">
                            {quest.title}
                          </h3>
                        </div>
                      </div>

                      {/* Quest Body / Content */}
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                        <div className="space-y-4">
                          <div>
                            <p className={`text-xs text-slate-400 leading-relaxed font-sans ${!expandedDesc[quest.id] ? 'line-clamp-2' : ''}`}>
                              {quest.desc}
                            </p>
                            {quest.desc.length > 200 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedDesc(prev => ({ ...prev, [quest.id]: !prev[quest.id] })); }}
                                className="text-[10px] font-mono uppercase tracking-wider text-orange-400 hover:text-orange-300 transition-colors cursor-pointer -mt-0.5"
                              >
                                {expandedDesc[quest.id] ? 'Ver menos' : 'Ler tudo'}
                              </button>
                            )}
                          </div>

                          {/* Goals Checklist */}
                          <div className="space-y-3">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-1.5 flex justify-between items-center">
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
                                    <span className="text-slate-300 font-medium">
                                      {getGoalDescription(goal)}
                                    </span>
                                    <span className={`font-mono font-bold text-[11px] ${met ? 'text-emerald-400' : 'text-orange-400'}`}>
                                      {goal.currentValue} / {goal.targetValue}
                                    </span>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        met 
                                          ? 'bg-emerald-500' 
                                          : 'bg-gradient-to-r from-orange-600 to-amber-500'
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
                                className="text-[10px] font-mono uppercase tracking-wider text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                              >
                                {expandedGoals[quest.id] ? 'Ver menos' : `Ver todas (${quest.goals.length})`}
                              </button>
                            )}
                          </div>

                          {/* Rewards */}
                          {quest.rewards && quest.rewards.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-800/60">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                                Recompensas
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {quest.rewards.map((r, rIdx) => (
                                  <div 
                                    key={rIdx} 
                                    className={`px-2.5 py-1 text-[11px] font-bold flex items-center gap-1.5 shadow-sm ${
                                      r.type === 'unlock_character'
                                        ? 'border-amber-400/80 text-amber-300'
                                        : 'border-slate-800 text-amber-400'
                                    }`}
                                  >
                                    {r.type === 'unlock_character' ? (
                                      (() => {
                                        const allChars = getCharacters();
                                        const ch = allChars.find(c => c.name === r.value || c.id === r.value);
                                        return ch ? (
                                          <div className=" electric-border relative w-10 h-10 overflow-hidden  flex-shrink-0 bg-slate-900 rounded-md">
                                            <img src={ch.portrait || null} alt={r.value} className=" electric-content w-full h-full object-cover" />
                                          </div>
                                        ) : <Award className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
                                      })()
                                    ) : (
                                      <Award className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                    )}
                                    <span>
                                      {r.type === 'title' ? `Título: « ${r.value} »` : 
                                       r.type === 'unlock_character' ? r.value :
                                       r.type === 'banner' ? `🖼️ Banner: ${r.value}` :
                                       `🖼️ Moldura: ${r.value}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Button Action */}
                        <div className="pt-4 mt-auto">
                          {isCompleted ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewCompletedRewards(quest); }}
                              className="w-full py-2.5 bg-emerald-950/30 border border-emerald-500/40 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 font-sans uppercase tracking-wider transition cursor-pointer active:scale-95"
                            >
                              <CheckCircle className="w-4 h-4" />
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
                              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-110 active:scale-95 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer font-sans uppercase tracking-wider shadow-lg shadow-emerald-500/20"
                            >
                              {claimedRewardId === quest.id ? (
                                <img src="/static/img/icon/star.webp" alt="Loading" className="w-4 h-4 animate-spin object-contain" />
                              ) : (
                                <Sparkles className="w-4 h-4 fill-slate-950 text-slate-950" />
                              )}
                              <span>Resgatar Recompensa</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartQuest(quest)}
                              className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:brightness-110 active:scale-95 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer font-sans uppercase tracking-wider shadow-lg shadow-orange-500/20"
                            >
                              <Play className="w-4 h-4 fill-slate-950 text-slate-950" />
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
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => {
                      playClickSound();
                      setCurrentPage(p => Math.max(1, p - 1));
                    }}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => {
                        playClickSound();
                        setCurrentPage(page);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                        page === currentPage
                          ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-black shadow-md shadow-orange-600/10'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      playClickSound();
                      setCurrentPage(p => Math.min(totalPages, p + 1));
                    }}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
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
    </div> 
  );
}
