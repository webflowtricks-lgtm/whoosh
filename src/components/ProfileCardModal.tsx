/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, Shield, Award, Sparkles, User, Swords, Trophy, Flame, CheckCircle2, Calendar } from 'lucide-react';
import { UserProfile } from '../types';

export interface ProfileCardData {
  id?: string;
  name: string;
  username: string;
  photoUrl: string;
  title?: string;
  equippedFrame?: string;
  equippedFrameUrl?: string;
  equippedBannerUrl?: string;
  isBot?: boolean;
  level?: number;
  wins?: number;
  losses?: number;
  village?: string;
  likes?: number;
}

interface ProfileCardModalProps {
  profile: ProfileCardData;
  isSelf?: boolean;
  hideLikeButton?: boolean;
  onClose: () => void;
  playClickSound?: () => void;
  onOpenEditModal?: () => void;
}

const PRESET_STYLED_FRAMES: Record<string, string> = {
  'Padrão': 'border-2 border-slate-700',
  'Fogo da Vontade': 'border-2 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] bg-gradient-to-tr from-amber-500 to-red-500 p-0.5',
  'Sharingan Carmesim': 'border-2 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.7)] bg-gradient-to-tr from-red-600 to-rose-950 p-0.5',
  'Operativo ANBU': 'border-2 border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.5)] bg-gradient-to-tr from-slate-200 to-slate-500 p-0.5',
  'Sábio dos Seis Caminhos': 'border-2 border-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.8)] bg-gradient-to-tr from-yellow-300 via-amber-400 to-orange-500 p-0.5',
  'Guerra Shinobi': 'border-2 border-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.6)] bg-gradient-to-tr from-orange-500 via-amber-500 to-red-600 p-0.5'
};

export default function ProfileCardModal({
  profile,
  isSelf = false,
  hideLikeButton = false,
  onClose,
  playClickSound,
  onOpenEditModal,
}: ProfileCardModalProps) {
  const profileKey = (profile.username || profile.name || 'ninja').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const likesStorageKey = `naruto_profile_real_likes_${profileKey}`;
  const lastLikeDateStorageKey = `naruto_profile_last_like_${profileKey}`;

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Real likes counter: everyone starts at 0, storing real likes from user actions
  const [likes, setLikes] = useState<number>(() => {
    const saved = localStorage.getItem(likesStorageKey);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
    return 0; // Every account starts with 0 likes
  });

  const [hasLikedToday, setHasLikedToday] = useState<boolean>(() => {
    const lastDate = localStorage.getItem(lastLikeDateStorageKey);
    return lastDate === getTodayStr();
  });

  const [likeFeedback, setLikeFeedback] = useState<string | null>(null);
  const [showHeartBurst, setShowHeartBurst] = useState<boolean>(false);

  const frameStyle = profile.equippedFrame ? (PRESET_STYLED_FRAMES[profile.equippedFrame] || 'border-2 border-orange-400') : 'border-2 border-orange-400';

  const handleLike = () => {
    if (playClickSound) playClickSound();

    const today = getTodayStr();

    if (hasLikedToday) {
      setLikeFeedback('Você já curtiu este perfil hoje! Volte amanhã. ❤️');
      setTimeout(() => setLikeFeedback(null), 3500);
      return;
    }

    const newLikes = likes + 1;
    setLikes(newLikes);
    setHasLikedToday(true);
    try {
      localStorage.setItem(likesStorageKey, String(newLikes));
      localStorage.setItem(lastLikeDateStorageKey, today);
    } catch (e) {
      console.warn("Failed to save likes to localStorage:", e);
    }

    // Trigger visual heart burst effect
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 1200);

    setLikeFeedback('Curtida enviada com sucesso! ❤️ (+1 Curtida)');
    setTimeout(() => setLikeFeedback(null), 3500);
  };

  const level = profile.level || 15;
  const wins = profile.wins !== undefined ? profile.wins : 24;
  const losses = profile.losses !== undefined ? profile.losses : 5;
  const totalBattles = wins + losses;
  const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 100;
  const village = profile.village || 'Vila da Folha (Konoha)';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col"
        >
          {/* HEADER BANNER CARD (EXACT MATCHING THE SCREENSHOT SPECIFICATION) */}
          <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 p-5 sm:p-6 text-slate-950 relative overflow-hidden flex-shrink-0">
            {profile.equippedBannerUrl ? (
              <>
                <img
                  src={profile.equippedBannerUrl}
                  alt="Banner de Perfil"
                  className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/25 pointer-events-none" />
              </>
            ) : (
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            )}

            {/* Close button (X) top right matching screenshot */}
            <button
              onClick={() => {
                if (playClickSound) playClickSound();
                onClose();
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/40 hover:bg-slate-950/80 text-white transition cursor-pointer z-30 shadow-lg"
              title="Fechar Card"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 relative z-10">
              {/* Avatar Container with Equipped Frame */}
              <div className="relative group flex-shrink-0">
                <div className={`w-20 h-20 rounded-full overflow-hidden bg-slate-950 flex items-center justify-center relative shadow-2xl ${
                  !profile.equippedFrameUrl ? frameStyle : ''
                }`}>
                  <img
                    src={profile.photoUrl || 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg'}
                    alt={profile.name}
                    className={`w-full h-full object-cover rounded-full ${!isSelf ? 'scale-x-[-1]' : ''}`}
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* PNG Frame Overlay */}
                {profile.equippedFrameUrl && (
                  <img
                    src={profile.equippedFrameUrl}
                    alt={profile.equippedFrame || 'Moldura'}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain z-10 drop-shadow-xl"
                  />
                )}
              </div>

              {/* Badges & Name (NO GOLD OR RYOS DISPLAYED) */}
              <div className="min-w-0 flex-1 pr-6">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-slate-950/50 text-amber-300 border border-amber-300/30">
                    {profile.title || 'ESTUDANTE SHINOBI'}
                  </span>
                  <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-slate-950/50 text-slate-100">
                    @{profile.username || profile.name}
                  </span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate drop-shadow-md">
                  {profile.name}
                </h2>

                {/* NOTE: GOLD & RYOS DISPLAY IS EXPLICITLY OMITTED HERE AS REQUESTED */}
              </div>
            </div>
          </div>

          {/* CARD BODY DETAILS & LIKE BUTTON */}
          <div className="p-5 sm:p-6 bg-slate-900 space-y-5 flex-1 overflow-y-auto">

            {/* LIKE / CURTIR ACTION BAR (Hidden in battle view) */}
            {!hideLikeButton && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner relative overflow-hidden">
                {/* Animated Floating Hearts Burst Effect */}
                {showHeartBurst && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 1, y: 0 }}
                      animate={{ scale: 2.5, opacity: 0, y: -40 }}
                      transition={{ duration: 1 }}
                      className="text-4xl"
                    >
                      💖 ❤️ 💕
                    </motion.div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
                    <Heart className={`w-5 h-5 ${hasLikedToday ? 'fill-rose-500 text-rose-500' : 'animate-pulse'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-white font-mono">{likes}</span>
                      <span className="text-xs text-rose-300 font-bold uppercase tracking-wide">Curtidas</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {hasLikedToday ? 'Você curtiu este perfil hoje!' : 'Envie seu reconhecimento ninja (1x ao dia)'}
                    </p>
                  </div>
                </div>

                {/* CURTIR BUTTON */}
                <button
                  onClick={handleLike}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                    hasLikedToday
                      ? 'bg-slate-800 text-rose-300 border border-rose-500/30 hover:bg-slate-700/80'
                      : 'bg-gradient-to-r from-rose-500 via-red-500 to-rose-600 hover:from-rose-400 hover:to-red-500 text-white hover:scale-105 active:scale-95 shadow-rose-950/50'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${hasLikedToday ? 'fill-rose-300' : 'fill-white'}`} />
                  {hasLikedToday ? 'Já Curtido Hoje' : 'Curtir Perfil'}
                </button>
              </div>
            )}

            {/* Feedback Alert Toast */}
            {!hideLikeButton && likeFeedback && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-3 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 ${
                  hasLikedToday && likeFeedback.includes('sucesso')
                    ? 'bg-rose-950/80 border-rose-600/80 text-rose-200'
                    : 'bg-amber-950/80 border-amber-600/80 text-amber-200'
                }`}
              >
                <span>❤️</span>
                <span>{likeFeedback}</span>
              </motion.div>
            )}

            {/* NINJA STATS & DETAILS GRID */}
            <div className="grid grid-cols-2 gap-3">
              {/* LEVEL */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">Nível Ninja</span>
                  <span className="text-xs font-black text-white font-mono">Nível {level}</span>
                </div>
              </div>

              {/* VILLAGE */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase">Vila Ninja</span>
                  <span className="text-xs font-black text-white font-mono truncate block">{village}</span>
                </div>
              </div>

              {/* BATTLES & WINS */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center gap-3 col-span-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex-shrink-0">
                  <Swords className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400 font-mono uppercase">Histórico da Arena</span>
                    <span className="text-[10px] text-cyan-300 font-mono font-bold">{winRate}% de Vitórias</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-black font-mono">
                    <span className="text-emerald-400">⚔️ {wins} Vitórias</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-red-400">🛡️ {losses} Derrotas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
              {isSelf && onOpenEditModal && (
                <button
                  onClick={() => {
                    if (playClickSound) playClickSound();
                    onClose();
                    onOpenEditModal();
                  }}
                  className="px-4 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25 text-xs font-mono font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5" />
                  Editar Minhas Molduras
                </button>
              )}

              <button
                onClick={() => {
                  if (playClickSound) playClickSound();
                  onClose();
                }}
                className="ml-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
