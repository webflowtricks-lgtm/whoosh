/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Award, 
  Lock, 
  CheckCircle, 
  Play, 
  ArrowLeft, 
  User, 
  Star, 
  ChevronRight, 
  Compass, 
  BookOpen, 
  Sparkles,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  Swords,
  Calendar,
  ShoppingBag,
  Shield
} from 'lucide-react';
import { Quest, UserProfile } from '../types';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import { RankConfig, getRanks, getUserRankFromConfig, fetchRanksFromServer } from '../lib/rankStorage';

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
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'missoes' | 'perfil'>('missoes');
  const [activeTab, setActiveTab] = useState<'available' | 'completed' | 'all'>('available');
  const [claimedRewardId, setClaimedRewardId] = useState<string | null>(null);

  // Modals state
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    fetchQuests();
  }, []);

  const fetchQuests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/quests');
      const data = await res.json();
      if (data.success) {
        // Sync completed quests with user profile
        const userCompletedIds = user.completedQuestIds || [];
        const synced = data.quests.map((q: Quest) => ({
          ...q,
          completed: userCompletedIds.includes(q.id)
        }));
        setQuests(synced);
      }
    } catch (err) {
      console.error('Error fetching quests:', err);
    } finally {
      setLoading(false);
    }
  };

  const completedCount = user.completedQuestIds?.length || 0;
  const currentRank = getUserRank(completedCount);

  // Check if a quest is locked based on minRank and requiredQuestIds
  const isQuestLocked = (quest: Quest): { locked: boolean; reason?: string } => {
    const ranks = ['Estudante da Academia', 'Genin', 'Chunin', 'Jonin', 'ANBU', 'Hokage'];
    const playerRankIndex = ranks.indexOf(currentRank);
    const requiredRankIndex = ranks.indexOf(quest.minRank);

    if (playerRankIndex < requiredRankIndex) {
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

      // Process rewards
      quest.rewards.forEach(r => {
        if (r.type === 'title' && !updatedUnlockedTitles.includes(r.value)) {
          updatedUnlockedTitles.push(r.value);
        } else if (r.type === 'unlock_character' && !updatedUnlockedChars.includes(r.value)) {
          updatedUnlockedChars.push(r.value);
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
        await fetch('/api/quests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quests: updatedQuestsList })
        });
      } catch (err) {
        console.error('Error saving claimed quest on server:', err);
      }

      setClaimedRewardId(null);
    }, 1200);
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

  // Filter lists
  const filteredQuests = quests.filter(quest => {
    const isCompleted = user.completedQuestIds?.includes(quest.id) || quest.completed;
    if (activeTab === 'completed') return isCompleted;
    if (activeTab === 'available') return !isCompleted;
    return true; // 'all'
  });

  return (
    <div className="quest-div-pai min-h-screen w-full relative">
      <div className="absolute inset-0 bg-slate-950/75 pointer-events-none z-0" />

      {/* Interactive Modals inside the Arena/Quartel Shinobi Hub */}
      <AnimatePresence>
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
                src={user.photoUrl}
                alt={user.name}
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            {user.equippedFrameUrl && (
              <img
                src={user.equippedFrameUrl}
                alt="Moldura"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain z-10"
              />
            )}
          </div>

          <div className="text-left leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-200 group-hover:text-orange-400">{user.name}</span>
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
            <span>Missões</span>
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
            <span>Batalha</span>
          </button>

          {/* MENU BACK BUTTON */}
          <button
            onClick={onBack}
            className="px-3 py-2 text-xs text-slate-400 hover:text-orange-400 transition cursor-pointer font-bold uppercase tracking-wider font-mono hover:bg-slate-900 rounded-lg"
            title="Voltar ao Menu Inicial"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Tab View 1: MISSÕES */}
      {mainTab === 'missoes' && (
        <div className="space-y-6">
          {/* Sub-Filters Bar for Quests (Disponíveis | Concluídas | Todas) */}
          <div className="flex justify-between items-center bg-slate-900/60 backdrop-blur-md p-2 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2">
              {(['available', 'completed', 'all'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    playClickSound();
                    setActiveTab(tab);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                    activeTab === tab
                      ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-black shadow-md shadow-orange-600/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {tab === 'available' && 'Disponíveis'}
                  {tab === 'completed' && 'Concluídas'}
                  {tab === 'all' && 'Todas'}
                </button>
              ))}
            </div>

            <button
              onClick={fetchQuests}
              className="p-2 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs font-mono"
              title="Sincronizar Missões"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-400' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>

          {/* Quests Listing */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-slate-400 text-xs font-mono">Buscando missões secretas na névoa...</p>
            </div>
          ) : filteredQuests.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filteredQuests.map((quest) => {
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
                      className={`bg-slate-900/80 rounded-2xl border flex flex-col justify-between relative shadow-xl backdrop-blur-md ${
                        isCompleted
                          ? 'border-emerald-500/30 shadow-emerald-950/10'
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

                      {/* Rank requirement label (fora do overflow-hidden para transbordar) */}
                      <div className="absolute -top-2 -left-2 bg-slate-950/80 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider font-bold shadow-md z-20">
                        <div className="relative flex items-center gap-1.5 rounded-lg">
                          {(() => {
                            const allRanks = getRanks();
                            const r = allRanks.find(rr => rr.name === quest.minRank || rr.name.toLowerCase() === quest.minRank.toLowerCase());
                            if (r?.imageUrl) return <img src={r.imageUrl} alt="" className="rank-bg-img absolute" />;
                            return null;
                          })()}
                          <span className="relative z-10" style={{ color: (() => { const r = getRanks().find(rr => rr.name === quest.minRank || rr.name.toLowerCase() === quest.minRank.toLowerCase()); return r?.fontColor || '#fbbf24'; })() }}>{quest.minRank}</span>
                        </div>
                      </div>

                      {/* Quest Body / Content */}
                      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                        <div className="space-y-4">
                          <p className="text-xs text-slate-400 leading-relaxed font-sans">
                            {quest.desc}
                          </p>

                          {/* Goals Checklist */}
                          <div className="space-y-3">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                              <span>Metas da Missão</span>
                            </div>
                            {quest.goals.map((goal) => {
                              const met = goal.currentValue >= goal.targetValue;
                              const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
                              
                              return (
                                <div key={goal.id} className="space-y-1.5">
                                  <div className="flex justify-between items-start text-xs">
                                    <span className="text-slate-300 font-medium">
                                      {goal.type === 'win_battles_with_chars' && (
                                        <span>Ganhar com {goal.targetCharacters?.join(', ')}</span>
                                      )}
                                      {goal.type === 'win_consecutive_battles_with_chars' && (
                                        <span>Sequência com {goal.targetCharacters?.join(', ')}</span>
                                      )}
                                      {goal.type === 'use_skill' && (
                                        <span>Usar [{goal.targetSkill}]</span>
                                      )}
                                      {goal.type === 'heal' && (
                                        <span>Recuperar HP</span>
                                      )}
                                      {goal.type === 'kill_with_skill' && (
                                        <span>Matar inimigo com [{goal.targetSkill}]</span>
                                      )}
                                      {goal.type === 'shield' && (
                                        <span>Gerar Escudo</span>
                                      )}
                                      {goal.type === 'damage_received' && (
                                        <span>Absorver Dano</span>
                                      )}
                                      {goal.type === 'damage_dealt' && (
                                        <span>Causar Dano</span>
                                      )}
                                      {goal.type === 'stun_enemy' && (
                                        <span>Atordoar inimigos</span>
                                      )}
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
                                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-bold text-amber-400 flex items-center gap-1.5 shadow-sm"
                                  >
                                    <Award className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                    <span>
                                      {r.type === 'title' ? `Título: « ${r.value} »` : 
                                       r.type === 'unlock_character' ? `Personagem: ${r.value}` :
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
                            <div className="w-full py-2.5 bg-emerald-950/30 border border-emerald-500/40 text-emerald-400 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 font-sans uppercase tracking-wider">
                              <CheckCircle className="w-4 h-4" />
                              <span>Missão Concluída</span>
                            </div>
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
                                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
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
            <div className="relative z-10 px-10 sm:px-12 py-10 flex flex-col justify-between h-full min-h-[220px]">
              {/* Top Section: Avatar + Name Info */}
              <div className="flex items-center gap-3.5">
                <img
                  src={user.photoUrl}
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
                  <div className="relative px-3 py-1 bg-[#d3ad75]/80 border-2 border-[#7a4e25] rounded-md text-stone-950 font-black text-xs uppercase tracking-wider shadow-sm">
                    {(() => {
                      const allRanks = getRanks();
                      const r = allRanks.find(rr => rr.name === currentRank || rr.name.toLowerCase() === currentRank.toLowerCase());
                      return r?.imageUrl ? <img src={r.imageUrl} alt="" className="rank-bg-img absolute inset-0 w-full h-full object-cover opacity-40" /> : null;
                    })()}
                    <span className="relative z-10" style={{ color: (() => { const r = getRanks().find(rr => rr.name === currentRank || rr.name.toLowerCase() === currentRank.toLowerCase()); return r?.fontColor || '#000'; })() }}>{currentRank}</span>
                  </div>
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
