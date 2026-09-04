/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, Shield, Award, Sparkles, User, Swords, Trophy, Flame, CheckCircle2, Calendar, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { UserProfile, NinjaCard } from '../types';
import { getRanks } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { getCards, fetchCardsFromServer, CARD_RARITY_META, rarityFx } from '../lib/cardStorage';
import { useLanguage } from '../lib/i18n';
import MangekyoLoader from './MangekyoLoader';

export interface ProfileCardData {
  id?: string;
  name: string;
  username: string;
  photoUrl: string;
  title?: string;
  equippedFrame?: string;
  equippedFrameUrl?: string;
  equippedBannerUrl?: string;
  equippedBannerPositionY?: number;
  equippedBannerPositionX?: number;
  equippedShowcaseSkinUrl?: string;
  isBot?: boolean;
  level?: number;
  xp?: number;
  rank?: string;
  wins?: number;
  losses?: number;
  village?: string;
  likes?: number;
  collectedCardIds?: string[];
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
  const { t } = useLanguage();
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
  const [bannerHover, setBannerHover] = useState<boolean>(false);

  // Figurinhas colecionáveis do jogador
  const [allCards, setAllCards] = useState<NinjaCard[]>(() => getCards());
  const [lightboxCard, setLightboxCard] = useState<NinjaCard | null>(null);
  const [cardPage, setCardPage] = useState(0);

  useEffect(() => {
    fetchCardsFromServer().then(setAllCards);
  }, []);

  const frameStyle = profile.equippedFrame ? (PRESET_STYLED_FRAMES[profile.equippedFrame] || 'border-2 border-orange-400') : 'border-2 border-orange-400';

  const handleLike = () => {
    if (playClickSound) playClickSound();

    const today = getTodayStr();

    if (hasLikedToday) {
      setLikeFeedback(t('Você já curtiu este perfil hoje! Volte amanhã. ❤️', 'You already liked this profile today! Come back tomorrow. ❤️'));
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

    setLikeFeedback(t('Curtida enviada com sucesso! ❤️ (+1 Curtida)', 'Like sent successfully! ❤️ (+1 Like)'));
    setTimeout(() => setLikeFeedback(null), 3500);
  };

  const level = profile.level || 15;
  const wins = profile.wins !== undefined ? profile.wins : 24;
  const losses = profile.losses !== undefined ? profile.losses : 5;
  const totalBattles = wins + losses;
  const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 100;
  const village = profile.village || t('Vila da Folha (Konoha)', 'Leaf Village (Konoha)');

  // Rank badge (só o selo, exibido no cabeçalho)
  const rankRanks = getRanks();
  const rankProgress = getRankProgress(profile.xp || 0, rankRanks);
  const rankR = rankProgress.currentRank;
  const rankIsNone = !rankR.color || rankR.color === 'none';
  const rankBgClass = rankIsNone
    ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
    : (rankR.color.includes('bg-gradient') ? rankR.color : `bg-gradient-to-r ${rankR.color}`);

  // Figurinhas do jogador (coleção) + paginação
  const cardImage = (c: NinjaCard) => c.imageUrl || `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${c.slug || ''}/icon.jpg`;
  const ownedCards = (profile.collectedCardIds || [])
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is NinjaCard => !!c)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const CARDS_PER_PAGE = 12;
  const totalCardPages = Math.max(1, Math.ceil(ownedCards.length / CARDS_PER_PAGE));
  const safeCardPage = Math.min(cardPage, totalCardPages - 1);
  const pagedCards = ownedCards.slice(safeCardPage * CARDS_PER_PAGE, safeCardPage * CARDS_PER_PAGE + CARDS_PER_PAGE);
  // Numeração global (renumeradas em ordem sequencial)
  const pagedCardsWithNumber = pagedCards.map((c, i) => ({ card: c, num: safeCardPage * CARDS_PER_PAGE + i + 1 }));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="profile-card-modal-container bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col"
        >
          {/* HEADER BANNER CARD */}
          <div
            className="bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 p-5 sm:p-6 text-slate-950 relative overflow-hidden flex-shrink-0 select-none"
            onMouseEnter={() => setBannerHover(true)}
            onMouseLeave={() => setBannerHover(false)}
          >
            {profile.equippedBannerUrl ? (
              <>
                <img
                  src={profile.equippedBannerUrl || null}
                  alt={t('Banner de Perfil', 'Profile Banner')}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-all duration-500"
                  style={{ objectPosition: `${profile.equippedBannerPositionX ?? 50}% ${profile.equippedBannerPositionY ?? 50}%` }}
                  referrerPolicy="no-referrer"
                />
                <div className={`absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/25 pointer-events-none transition-opacity duration-500 ${bannerHover ? 'opacity-0' : 'opacity-100'}`} />
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
              className={`absolute top-4 right-4 p-2 rounded-full text-white transition cursor-pointer z-30 shadow-lg ${bannerHover ? 'bg-slate-950/70 hover:bg-slate-950/90' : 'bg-slate-950/50 hover:bg-slate-950/90'}`}
              title={t('Fechar Card', 'Close Card')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className={`flex items-center gap-4 relative z-10 transition-opacity duration-500 ${bannerHover ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {/* Avatar Container with Equipped Frame */}
              <div className="relative group flex-shrink-0">
                <div className={`w-20 h-20 rounded-full overflow-hidden bg-slate-950 flex items-center justify-center relative shadow-2xl ${
                  !profile.equippedFrameUrl ? frameStyle : ''
                }`}>
                  <MangekyoLoader
                    src={profile.photoUrl || 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg'}
                    alt={profile.name}
                    className="w-full h-full rounded-full"
                    imgClassName={`rounded-full ${!isSelf ? 'scale-x-[-1]' : ''}`}
                    iconScale={0.55}
                  />
                </div>

                {/* PNG Frame Overlay */}
                {profile.equippedFrameUrl && (
                  <img
                    src={profile.equippedFrameUrl || null}
                    alt={profile.equippedFrame || t('Moldura', 'Frame')}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain z-10 drop-shadow-xl"
                  />
                )}
              </div>

              {/* Badges & Name & Level Header */}
              <div className="min-w-0 flex-1 pr-8">
                {/* Rank badge (patente) acima do nome — substitui o título */}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider shadow overflow-hidden relative mb-1 ${rankBgClass}`}
                  style={{
                    ...(rankR.bgColor ? { backgroundColor: rankR.bgColor } : {}),
                    color: rankR.fontColor || '#ffffff'
                  }}
                >
                  {rankR.imageUrl && (
                    <img src={rankR.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                  )}
                  {rankR.iconUrl ? (
                    <img src={rankR.iconUrl} alt="" className="w-3.5 h-3.5 object-contain relative z-10" />
                  ) : (
                    <Award className="w-3.5 h-3.5 text-white relative z-10" />
                  )}
                  <span className="relative z-10">{rankR.name}</span>
                </span>

                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate drop-shadow-md leading-tight">
                  {profile.name}
                </h2>

                {/* Título do jogador abaixo do nome */}
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono font-black uppercase px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow">
                    {profile.title || t('ESTUDANTE', 'STUDENT')}
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-950/60 text-slate-300 border border-slate-800">
                    @{profile.username || profile.name}
                  </span>
                </div>

                {/* Nível oculto (permanece no DOM, mas invisível) */}
                <span className="hidden text-xl sm:text-2xl font-black text-amber-400 font-mono drop-shadow">
                  {level}
                </span>
              </div>
            </div>
          </div>

          {/* CARD BODY: TWO COLUMNS (LEFT STATS | RIGHT SHOWCASE CHARACTER SKIN ARTWORK) */}
          <div className="p-4 sm:p-6 bg-slate-900 flex-1 overflow-y-auto relative">
            <div className="flex flex-col md:flex-row gap-4 sm:gap-6 items-stretch">
              
              {/* LEFT COLUMN: STATS & DETAILS */}
              <div className="flex-1 space-y-3.5 z-10">
                
                {/* 1. CURTIDAS (Likes) CARD */}
                <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-inner relative overflow-hidden">
                  {/* Floating Hearts Effect */}
                  {showHeartBurst && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                      <motion.div
                        initial={{ scale: 0.5, opacity: 1, y: 0 }}
                        animate={{ scale: 2.5, opacity: 0, y: -40 }}
                        transition={{ duration: 1 }}
                        className="text-3xl"
                      >
                        💖 ❤️ 💕
                      </motion.div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">
                        <Heart className={`w-5 h-5 ${hasLikedToday ? 'fill-rose-500 text-rose-500' : 'animate-pulse'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-black text-white font-mono">{likes}</span>
                          <span className="text-xs font-black text-rose-400 uppercase tracking-wide">{t('CURTIDAS', 'LIKES')}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono leading-tight">
                          {hasLikedToday ? t('Você curtiu este perfil hoje!', 'You liked this profile today!') : t('Envie seu reconhecimento ninja (1 por dia)', 'Send your ninja recognition (1 per day)')}
                        </p>
                      </div>
                    </div>

                    {!hideLikeButton && (
                      <button
                        onClick={handleLike}
                        className={`px-3.5 py-2 rounded-xl font-mono text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow flex-shrink-0 ${
                          hasLikedToday
                            ? 'bg-slate-800 text-rose-300 border border-rose-500/30 hover:bg-slate-700/80'
                            : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white hover:scale-105 active:scale-95 shadow-rose-950/50'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${hasLikedToday ? 'fill-rose-300' : 'fill-white'}`} />
                        {hasLikedToday ? t('Curtido', 'Liked') : t('Curtir', 'Like')}
                      </button>
                    )}
                  </div>

                  {!hideLikeButton && likeFeedback && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/60 p-2 rounded-lg border border-amber-600/40"
                    >
                      {likeFeedback}
                    </motion.div>
                  )}
                </div>

                {/* FIGURINHAS COLECIONÁVEIS DO JOGADOR */}
                <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 flex-shrink-0">
                        <Images className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">{t('FIGURINHAS', 'CARDS')}</span>
                        <span className="text-xs font-black text-white font-mono">{ownedCards.length} {t('colecionadas', 'collected')}</span>
                      </div>
                    </div>
                  </div>

                  {ownedCards.length === 0 ? (
                    <p className="text-[10px] text-slate-500 font-mono text-center py-2">
                      {t('Nenhuma figurinha ainda. Abra pacotes para colecionar!', 'No cards yet. Open packs to collect!')}
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {pagedCardsWithNumber.map(({ card: c, num }) => {
                          const fx = rarityFx(c.rarity);
                          return (
                          <button
                            key={c.id}
                            onClick={() => { if (playClickSound) playClickSound(); setLightboxCard(c); }}
                            className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 ${CARD_RARITY_META[c.rarity].border} ${CARD_RARITY_META[c.rarity].glow} bg-slate-900 cursor-pointer group hover:scale-105 transition-transform shadow-lg flex-shrink-0 ${fx?.frame || ''}`}
                            title={`#${String(num).padStart(3, '0')} — ${c.characterName} (${c.title})`}
                          >
                            <img src={cardImage(c)} alt={c.characterName} className="w-full h-full object-cover" />
                            {fx && <span className={fx.sweep} />}
                            {/* Nº no lugar do nome (canto superior esquerdo) */}
                            <span className="absolute top-0.5 left-0.5 text-[8px] font-mono font-black text-white px-1 py-0.5 rounded bg-slate-950/80 leading-none">
                              #{String(num).padStart(3, '0')}
                            </span>
                            {/* Tag de raridade */}
                            <span className={`absolute bottom-0.5 right-0.5 text-[7px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${CARD_RARITY_META[c.rarity].chip}`}>
                              {c.rarity}
                            </span>
                          </button>
                          );
                        })}
                      </div>

                      {totalCardPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-1">
                          <button
                            onClick={() => { if (playClickSound) playClickSound(); setCardPage(p => Math.max(0, p - 1)); }}
                            disabled={safeCardPage === 0}
                            className={`p-1.5 rounded-lg border border-slate-800 transition cursor-pointer ${safeCardPage === 0 ? 'opacity-40 cursor-not-allowed' : 'text-slate-200 hover:border-fuchsia-500/50 hover:bg-slate-800'}`}
                            title={t('Anterior', 'Previous')}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-[10px] font-mono text-slate-400">
                            {safeCardPage + 1} / {totalCardPages}
                          </span>
                          <button
                            onClick={() => { if (playClickSound) playClickSound(); setCardPage(p => Math.min(totalCardPages - 1, p + 1)); }}
                            disabled={safeCardPage >= totalCardPages - 1}
                            className={`p-1.5 rounded-lg border border-slate-800 transition cursor-pointer ${safeCardPage >= totalCardPages - 1 ? 'opacity-40 cursor-not-allowed' : 'text-slate-200 hover:border-fuchsia-500/50 hover:bg-slate-800'}`}
                            title={t('Próxima', 'Next')}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* VILA NINJA — ocultada por enquanto (permanece no DOM) */}
                <div className="hidden bg-slate-950/90 border border-slate-800/90 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-inner">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-slate-400 font-mono block uppercase tracking-wider">{t('VILA NINJA', 'NINJA VILLAGE')}</span>
                    <span className="text-xs font-black text-white font-mono truncate block mt-0.5">{village}</span>
                  </div>
                </div>

                {/* HISTÓRICO DA ARENA — movido para a barra do FECHAR (rodapé) */}

              </div>

              {/* RIGHT COLUMN: SHOWCASE CHARACTER SKIN ARTWORK ("SKIN DE DESTAQUE") */}
              <div className="relative w-full sm:w-52 md:w-56 flex-shrink-0 flex items-end justify-center min-h-[250px] md:min-h-[300px] bg-slate-950/50 border border-slate-800/60 rounded-2xl overflow-hidden p-2">
                
                {/* Glowing Aura Background Effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-amber-500/10 pointer-events-none" />
                <div className="absolute bottom-4 w-40 h-40 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

                {/* Main Showcase Artwork (Rendered only if equipped) */}
                {profile.equippedShowcaseSkinUrl && profile.equippedShowcaseSkinUrl !== 'none' ? (
                  <img
                    src={profile.equippedShowcaseSkinUrl}
                    alt={t('Skin de Destaque', 'Showcase Skin')}
                    className="max-h-[280px] md:max-h-[340px] w-auto max-w-full object-contain filter drop-shadow-[0_10px_25px_rgba(0,0,0,0.95)] z-10 pointer-events-none relative transition-all duration-300 hover:scale-105"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="z-10 flex flex-col items-center justify-center my-auto text-slate-700 font-mono text-center p-4">
                    <User className="w-12 h-12 stroke-[1.5] opacity-20 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">{t('Sem Skin', 'No Skin')}</span>
                  </div>
                )}

                {/* Bottom Smooth Blend Gradient */}
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-slate-950 to-transparent z-20 pointer-events-none" />
              </div>

            </div>

            {/* ACTION FOOTER (com o Histórico da Arena à esquerda) */}
            <div className="mt-5 pt-3 flex flex-wrap items-center gap-3 border-t border-slate-800/80">

              {/* Histórico da Arena (posicionado na barra do FECHAR, à esquerda) */}
              <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl px-3.5 py-2 shadow-inner flex items-center gap-3.5 flex-shrink-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                  <Swords className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">{t('HISTÓRICO DA ARENA', 'ARENA HISTORY')}</span>
                    <span className="text-[9px] text-cyan-300 font-mono font-bold">{winRate}% {t('Vitórias', 'Win Rate')}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] font-black font-mono">
                    <span className="text-emerald-400">⚔️ {wins} {t('Vitórias', 'Wins')}</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-red-400">🛡️ {losses} {t('Derrotas', 'Losses')}</span>
                  </div>
                </div>
              </div>

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
                  {t('Editar Skin & Perfil', 'Edit Skin & Profile')}
                </button>
              )}

              <button
                onClick={() => {
                  if (playClickSound) playClickSound();
                  onClose();
                }}
                className="ml-auto px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-black uppercase tracking-wider transition cursor-pointer shadow"
              >
                {t('FECHAR', 'CLOSE')}
              </button>
            </div>

          </div>
        </motion.div>
      </div>

      {/* LIGHTBOX — figurinha ampliada */}
      <AnimatePresence>
        {lightboxCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md"
            onClick={() => setLightboxCard(null)}
          >
            <button
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer z-10 shadow-lg"
              title={t('Fechar', 'Close')}
              onClick={(e) => { e.stopPropagation(); setLightboxCard(null); }}
            >
              <X className="w-5 h-5" />
            </button>

            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative flex flex-col items-center"
            >
              {/* Navegação (anterior) */}
              {ownedCards.length > 1 && (
                <button
                  onClick={() => {
                    if (playClickSound) playClickSound();
                    const idx = ownedCards.findIndex(c => c.id === lightboxCard.id);
                    const prev = ownedCards[(idx - 1 + ownedCards.length) % ownedCards.length];
                    setLightboxCard(prev);
                  }}
                  className="absolute left-[-52px] top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer shadow-lg hidden sm:block"
                  title={t('Anterior', 'Previous')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {/* Card ampliado — foto completa (cover), borda única, sem texto na imagem */}
              <div className={`relative w-56 sm:w-64 aspect-[3/4] rounded-2xl overflow-hidden border-4 bg-slate-950 shadow-2xl ${CARD_RARITY_META[lightboxCard.rarity].border} ${CARD_RARITY_META[lightboxCard.rarity].glow}`}>
                <img src={cardImage(lightboxCard)} alt={lightboxCard.characterName} className="absolute inset-0 w-full h-full object-cover" />
                <span className={`absolute top-2 right-2 text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded ${CARD_RARITY_META[lightboxCard.rarity].chip}`}>
                  {lightboxCard.rarity}
                </span>
              </div>

              {/* Informações da figurinha (fora da imagem) */}
              <div className="mt-3 text-center max-w-xs">
                <span className={`inline-block text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded mb-1 ${CARD_RARITY_META[lightboxCard.rarity].chip}`}>
                  #{(ownedCards.findIndex(x => x.id === lightboxCard.id) + 1).toString().padStart(3, '0')} • {lightboxCard.rarity}
                </span>
                {lightboxCard.title && (
                  <p className="text-white text-sm font-extrabold leading-tight">{lightboxCard.title}</p>
                )}
                <p className="text-slate-300 text-[11px] font-mono">
                  {lightboxCard.characterName}{lightboxCard.variant ? ` • ${lightboxCard.variant}` : ''}
                </p>
                {lightboxCard.description && (
                  <p className="mt-1 text-xs text-slate-400 leading-snug">{lightboxCard.description}</p>
                )}
              </div>

              {/* Navegação (próxima) */}
              {ownedCards.length > 1 && (
                <button
                  onClick={() => {
                    if (playClickSound) playClickSound();
                    const idx = ownedCards.findIndex(c => c.id === lightboxCard.id);
                    const next = ownedCards[(idx + 1) % ownedCards.length];
                    setLightboxCard(next);
                  }}
                  className="absolute right-[-52px] top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer shadow-lg hidden sm:block"
                  title={t('Próxima', 'Next')}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
