/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Sparkles, User, Swords, Trophy, Flame, CheckCircle2, Calendar, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { UserProfile, NinjaCard } from '../types';
import { getCards, fetchCardsFromServer, CARD_RARITY_META, rarityFx, RARITY_ORDER } from '../lib/cardStorage';
import { getRanks } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { getLanguage, useLanguage } from '../lib/i18n';
import { getVillageById } from '../lib/villages';
import MangekyoLoader from './MangekyoLoader';

export const CARD_RARITY_GLOW: Record<NinjaCard['rarity'], { background: string; shadow: string }> = {
  comum: { background: 'linear-gradient(135deg, #475569, #94a3b8)', shadow: 'rgba(203,213,225,0.8)' },
  raro: { background: 'linear-gradient(135deg, #0369a1, #38bdf8)', shadow: 'rgba(56,189,248,0.9)' },
  epico: { background: 'linear-gradient(135deg, #7e22ce, #d946ef)', shadow: 'rgba(217,70,239,0.9)' },
  lendario: { background: 'linear-gradient(135deg, #b45309, #fbbf24)', shadow: 'rgba(251,191,36,0.95)' },
  secreto: { background: 'linear-gradient(135deg, #b91c1c, #fb7185)', shadow: 'rgba(248,113,113,1)' },
};

interface OnlineBattleHistoryRecord {
  roomId: string;
  players: [{ username: string; name: string }, { username: string; name: string }];
  winnerUsername: string;
  finishedAt: string;
  reason: 'battle' | 'manual' | 'disconnect' | 'timeout' | 'inactivity';
}

/** Detecta mobile landscape (celular deitado) — mesmo critério do BattleBoard. */
function useIsMobileLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const update = () => setIsLandscape(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return isLandscape;
}

function useIsMobilePortrait(): boolean {
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 500px)');
    const update = () => setIsPortrait(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return isPortrait;
}

/**
 * Efeito 3D tilt reutilizável — segue o ponteiro (mouse OU dedo).
 * Usa Pointer Events universais + manipulação direta do DOM via refs.
 * O overflow-hidden do conteúdo NÃO afeta o 3D (a transformação vive aqui).
 */
export function Tilt3D({ children, className, glareRadius = 'rounded-md' }: {
  children: React.ReactNode;
  className?: string;
  glareRadius?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLSpanElement>(null);

  const applyTilt = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;   // 0..1
    const y = (clientY - rect.top) / rect.height;    // 0..1
    const rotY = (x - 0.5) * 24;   // ±12°
    const rotX = (0.5 - y) * 24;   // ±12°
    el.style.transform = `perspective(500px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.12,1.12,1.12)`;
    el.style.transition = 'transform 0.06s ease-out';
    const g = glareRef.current;
    if (g) {
      g.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.12) 30%, transparent 60%)`;
      g.style.opacity = '1';
    }
  }, []);

  // Encostou (mouse OU dedo) em qualquer ponto da carta → anima imediatamente.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    applyTilt(e.clientX, e.clientY);
  }, [applyTilt]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    applyTilt(e.clientX, e.clientY);
  }, [applyTilt]);

  const resetTilt = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.transform = 'perspective(500px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    el.style.transition = 'transform 0.45s ease-out';
    const g = glareRef.current;
    if (g) {
      g.style.opacity = '0';
      g.style.transition = 'opacity 0.35s ease';
    }
  }, []);

  // Mouse: ao sair/dedo solto em DESKTOP, reseta (hover clássico).
  // Toque (mobile): NÃO reseta — a inclinação fica posicionada onde encostou.
  const handlePointerLeaveOrUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') resetTilt();
  }, [resetTilt]);

  // Sistema cancelou o gesto (ex.: virou scroll) → reseta sempre.
  const handlePointerCancel = useCallback(() => {
    resetTilt();
  }, [resetTilt]);

  return (
    <div
      ref={wrapRef}
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeaveOrUp}
      onPointerUp={handlePointerLeaveOrUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
      {/* Reflexo de luz que acompanha o cursor/dedo */}
      <span
        ref={glareRef}
        className={`absolute inset-0 ${glareRadius} pointer-events-none z-10`}
        style={{ opacity: 0, transition: 'opacity 0.35s ease' }}
      />
    </div>
  );
}

/** Cartão premium (lendário/segredo) do grid com efeito 3D. */
function TiltCard({ children, className, onClick, title }: {
  children: React.ReactNode;
  className: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <Tilt3D className="relative">
      <button
        className={className}
        onClick={onClick}
        title={title}
      >
        {children}
      </button>
    </Tilt3D>
  );
}

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
  collectedCardIds?: string[];
}

interface ProfileCardModalProps {
  profile: ProfileCardData;
  isSelf?: boolean;
  onClose: () => void;
  playClickSound?: () => void;
  playScrollSound?: () => void;
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
  onClose,
  playClickSound,
  playScrollSound,
  onOpenEditModal,
}: ProfileCardModalProps) {
  const closeModal = () => {
    if (playScrollSound) playScrollSound();
    onClose();
  };
  const { t } = useLanguage();
  const isLandscape = useIsMobileLandscape();
  const isMobilePortrait = useIsMobilePortrait();
  const [bannerHover, setBannerHover] = useState<boolean>(false);
  const [onlineBattleHistory, setOnlineBattleHistory] = useState<OnlineBattleHistoryRecord[]>([]);
  const [onlineHistoryLoading, setOnlineHistoryLoading] = useState(true);
  const [onlineHistoryError, setOnlineHistoryError] = useState<string | null>(null);

  // Figurinhas colecionáveis do jogador
  const [allCards, setAllCards] = useState<NinjaCard[]>(() => getCards());
  const [lightboxCard, setLightboxCard] = useState<NinjaCard | null>(null);

  useEffect(() => {
    fetchCardsFromServer().then(setAllCards);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setOnlineHistoryLoading(true);
    setOnlineHistoryError(null);
    fetch(`/api/user/online-battle-history?username=${encodeURIComponent(profile.username)}`, {
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data?.success || !Array.isArray(data.matches)) {
          throw new Error(data?.error || 'Não foi possível carregar o histórico de batalhas online.');
        }
        setOnlineBattleHistory(data.matches
          .sort((a: OnlineBattleHistoryRecord, b: OnlineBattleHistoryRecord) =>
            Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
          .slice(0, 5));
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error('Failed to load online battle history:', error);
        setOnlineHistoryError(error instanceof Error ? error.message : 'Não foi possível carregar o histórico de batalhas online.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setOnlineHistoryLoading(false);
      });
    return () => controller.abort();
  }, [profile.username]);

  const frameStyle = profile.equippedFrame ? (PRESET_STYLED_FRAMES[profile.equippedFrame] || 'border-2 border-orange-400') : 'border-2 border-orange-400';

  const level = profile.level || 15;
  const wins = profile.wins !== undefined ? profile.wins : 24;
  const losses = profile.losses !== undefined ? profile.losses : 5;
  const totalBattles = wins + losses;
  const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 100;
  const selectedVillage = getVillageById(profile.village);
  const village = selectedVillage
    ? t(selectedVillage.name, selectedVillage.englishName)
    : profile.village || t('Vila da Folha (Konoha)', 'Leaf Village (Konoha)');
  const villageIcon = selectedVillage?.icon || '/static/img/icon/vilas/Konohagakure_Symbol.webp';

  // Rank do jogador (para badge genin)
  const rankRanks = getRanks();
  const rankProgress = getRankProgress(profile.xp || 0, rankRanks);
  const rankR = rankProgress.currentRank;

  // Figurinhas do jogador (coleção) + paginação
  const cardImage = (c: NinjaCard) => c.imageUrl || `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${c.slug || ''}/icon.jpg`;
  const cardCopies = new Map<string, number>();
  (profile.collectedCardIds || []).forEach(id => cardCopies.set(id, (cardCopies.get(id) || 0) + 1));
  const ownedCards = Array.from(cardCopies.keys())
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is NinjaCard => !!c)
    .sort((a, b) => {
      // Raridade maior primeiro e, dentro da mesma raridade, por numeração (id numérico)
      const rarityDiff = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
      if (rarityDiff !== 0) return rarityDiff;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  // Numeração global (renumeradas em ordem sequencial)
  const numberedOwned = ownedCards.map((card, i) => ({
    card,
    num: i + 1,
    copies: cardCopies.get(card.id) || 1,
  }));

  // Histórico da Arena — bloco reutilizável:
  // - mobile landscape → abaixo das curtidas do perfil (coluna esquerda)
  // - demais orientações → na barra do FECHAR (rodapé)
  const arenaHistoryBlock = (
    <div className={`mv-arena-history-card ${isLandscape ? 'px-2.5 py-1.5 gap-2' : 'px-3.5 py-2 gap-3.5'} bg-slate-950/90 border border-slate-800/90 rounded-xl shadow-inner flex items-center flex-shrink-0`}>
    <div className="flex min-w-0 shrink items-center gap-2">
      <div className={`${isLandscape ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0`}>
        <img src={villageIcon} alt="" aria-hidden="true" className="auth-village-icon h-6 w-6 object-contain" />
      </div>
      <span className="min-w-0 truncate text-sm sm:text-base font-black text-green-300">{village}</span>
    </div>
      <div className="mv-arena-history-details min-w-0">
        <div className="mv-arena-history-heading flex items-center gap-2">
          <span className="text-[9px] text-cyan-300 font-mono font-bold whitespace-nowrap">{winRate}% {t('Vitórias', 'Win Rate')}</span>
        </div>
        <div className="mv-arena-history-results flex items-center gap-2.5 text-[11px] font-black font-mono">
          <span className="text-emerald-400">⚔️ {wins} {t('Vitórias', 'Wins')}</span>
          <span className="mv-arena-history-separator text-slate-700">|</span>
          <span className="text-red-400">🛡️ {losses} {t('Derrotas', 'Losses')}</span>
        </div>
      </div>
    </div>
  );

  const onlineBattleHistoryBlock = (
    <section className="w-full max-w-[420px] rounded-xl border border-slate-800/90 bg-slate-950/90 p-3 shadow-inner">
      <h3 className="mb-2 flex items-center gap-2 text-[10px] font-mono font-extrabold uppercase tracking-wider text-cyan-300">
        <Swords className="h-3.5 w-3.5" />
        {t('HISTÓRICO DE BATALHAS ONLINE', 'ONLINE BATTLE HISTORY')}
      </h3>
      {onlineHistoryLoading ? (
        <p className="text-[11px] font-mono text-slate-400">{t('Carregando batalhas...', 'Loading battles...')}</p>
      ) : onlineHistoryError ? (
        <p role="alert" className="text-[11px] font-mono text-rose-300">{onlineHistoryError}</p>
      ) : onlineBattleHistory.length === 0 ? (
        <p className="text-[11px] font-mono text-slate-500">{t('Nenhuma batalha online registrada.', 'No online battles recorded.')}</p>
      ) : (
        <ol className="max-h-40 space-y-2 overflow-y-auto pr-1">
          {onlineBattleHistory.slice(0, 5).map(record => {
            const ownPlayer = record.players.find(player => player.username === profile.username.toLowerCase());
            const opponent = record.players.find(player => player.username !== profile.username.toLowerCase());
            const winner = record.players.find(player => player.username === record.winnerUsername);
            const didWin = record.winnerUsername === profile.username.toLowerCase();
            const locale = getLanguage() === 'en' ? 'en-US' : 'pt-BR';

            return (
              <li key={record.roomId} className="rounded-lg border border-slate-800/80 bg-slate-900/80 px-2.5 py-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[11px] font-bold leading-snug text-slate-100">
                    {ownPlayer?.name || profile.name} <span className="text-slate-500">vs</span> {opponent?.name || t('Oponente', 'Opponent')}
                  </p>
                  <span className={`shrink-0 text-[9px] font-black uppercase tracking-wide ${didWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {didWin ? t('Vitória', 'Victory') : t('Derrota', 'Defeat')}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9px] font-mono text-slate-400">
                  <span>{t('Vencedor', 'Winner')}: {winner?.name || winner?.username || '—'}</span>
                  <time dateTime={record.finishedAt}>
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.finishedAt))}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  return (
    <AnimatePresence>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center ${isLandscape ? 'p-2' : 'p-4'} bg-slate-950/80 backdrop-blur-md`}
        onClick={closeModal}
        data-no-uah
      >
        {/* Background Image (floresta dos perfis — mesmo visual do editar perfil) */}
        <img
          src="/static/img/bg/forest.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
        {/* Folhas animadas (mesma da batalha) */}
        <div className="leaves-modal gpu-accelerated">
          <img src="/static/img/ui/folha.webp" className="leaf leaf1" alt="" loading="lazy" decoding="async" />
          <img src="/static/img/ui/folha.webp" className="leaf leaf2" alt="" loading="lazy" decoding="async" />
          <img src="/static/img/ui/folha.webp" className="leaf leaf3" alt="" loading="lazy" decoding="async" />
          <img src="/static/img/ui/folha.webp" className="leaf leaf4" alt="" loading="lazy" decoding="async" />
          <img src="/static/img/ui/folha.webp" className="leaf leaf5" alt="" loading="lazy" decoding="async" />
          <img src="/static/img/ui/folha.webp" className="leaf leaf6" alt="" loading="lazy" decoding="async" />
        </div>
        <div className={`${isLandscape ? 'max-h-[80vh] my-auto gap-2' : 'gap-3'} ml-profile-card-wrap flex items-stretch max-h-[92vh] relative z-10`} onClick={(e) => e.stopPropagation()}>
        <motion.div
          initial={false}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`profile-card-modal-container ${isLandscape ? 'max-h-[78vh]' : ''} bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[92vh]`}
        >
          {/* HEADER BANNER CARD */}
          <div
            className={`${isLandscape ? 'p-2' : 'p-5 sm:p-6'} bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 text-slate-950 relative overflow-hidden flex-shrink-0 select-none`}
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

            <div className={`${isLandscape ? 'gap-2' : 'gap-4'} flex items-center relative z-10 transition-opacity duration-500 ${bannerHover ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {/* Avatar Container with Equipped Frame */}
              <div className="relative group flex-shrink-0">
                <div className={`${isLandscape ? 'w-16 h-16' : 'w-20 h-20'} rounded-full overflow-hidden bg-slate-950 flex items-center justify-center relative shadow-2xl ${
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
                <h2 className={`${isLandscape ? 'text-base' : 'text-2xl sm:text-3xl'} font-black text-white tracking-tight truncate drop-shadow-md leading-tight`}>
                  {profile.name}
                </h2>

                {/* Título do jogador + @username abaixo do nome */}
                <div className={`${isLandscape ? 'gap-1 mt-0.5' : 'gap-1.5 sm:gap-2 mt-0.5 sm:mt-1'} flex flex-wrap items-center`}>
                  <span className="text-[9px] sm:text-[10px] font-mono font-black uppercase px-1.5 sm:px-2.5 py-px sm:py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow">
                    {profile.title || t('ESTUDANTE', 'STUDENT')}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase px-1.5 sm:px-2 py-px sm:py-0.5 rounded bg-slate-950/60 text-slate-300 border border-slate-800">
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
          <div className={`profile-card-modal-body ${isLandscape ? 'p-2' : 'p-4 sm:p-6'} bg-slate-900 flex-1 overflow-y-auto relative custom-scrollbar green-scrollbar`}>
            <div className={`${isLandscape ? 'flex-row gap-2' : 'gap-4 sm:gap-6'} flex flex-col md:flex-row items-stretch`}>
              
              {/* LEFT COLUMN: STATS & DETAILS */}
              <div className={`${isLandscape ? 'space-y-2' : 'space-y-3.5'} flex-1 z-10`}>
                
                {isMobilePortrait && (
                  <>
                    {arenaHistoryBlock}
                    {onlineBattleHistoryBlock}
                  </>
                )}

                {isLandscape && (
                  <>
                    {arenaHistoryBlock}
                    {onlineBattleHistoryBlock}
                  </>
                )}

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

              </div>

              {/* RIGHT COLUMN: SHOWCASE CHARACTER SKIN ARTWORK ("SKIN DE DESTAQUE") */}
              <div className={`profile-card-showcase ${isLandscape ? 'min-h-[120px] w-28' : 'w-full sm:w-52 md:w-56 min-h-[250px] md:min-h-[300px]'} relative flex-shrink-0 flex items-end justify-center bg-slate-950/50 border border-slate-800/60 rounded-2xl overflow-hidden p-2`}>
                
                {/* Glowing Aura Background Effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-amber-500/10 pointer-events-none" />
                <div className="absolute bottom-4 w-40 h-40 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

                {/* Main Showcase Artwork (Rendered only if equipped) */}
                {profile.equippedShowcaseSkinUrl && profile.equippedShowcaseSkinUrl !== 'none' ? (
                  <img
                    src={profile.equippedShowcaseSkinUrl}
                    alt={t('Skin de Destaque', 'Showcase Skin')}
                    className={`${isLandscape ? 'max-h-[120px]' : 'max-h-[280px] md:max-h-[340px]'} w-auto max-w-full object-contain filter drop-shadow-[0_10px_25px_rgba(0,0,0,0.95)] z-10 pointer-events-none relative transition-all duration-300 hover:scale-105`}
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
            {(!isMobilePortrait || (isSelf && onOpenEditModal)) && (
              <div className={`${isLandscape ? 'mt-2 pt-2' : 'mt-5 pt-3'} flex flex-col items-start gap-3 border-t border-slate-800/80`}>

                {/* Histórico da Arena — em mobile landscape fica abaixo das curtidas (coluna esquerda) */}
                {!isLandscape && !isMobilePortrait && (
                  <div className="flex min-w-0 flex-col gap-2">
                    {arenaHistoryBlock}
                    {onlineBattleHistoryBlock}
                  </div>
                )}

                {isSelf && onOpenEditModal && (
                  <button
                    onClick={() => {
                      if (playScrollSound) playScrollSound();
                      onOpenEditModal();
                    }}
                    data-sound="Scroll"
                    className="px-4 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25 text-xs font-mono font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
                  >
                    <User className="w-3.5 h-3.5" />
                    {t('Editar perfil', 'Edit Profile')}
                  </button>
                )}
              </div>
            )}

          </div>
        </motion.div>

        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            closeModal();
          }}
          data-sound="Scroll"
          className="fixed bottom-4 left-4 z-[70] flex h-12 w-12 items-center justify-center rounded-xl border border-slate-600 bg-slate-950/90 text-white shadow-xl transition hover:border-orange-400 hover:bg-slate-900"
          title={t('Voltar', 'Back')}
          aria-label={t('Voltar', 'Back')}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {/* PAINEL LATERAL — FIGURINHAS COLECIONÁVEIS */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`ml-figurinhas-panel ${isLandscape ? 'flex-1 max-h-[78vh]' : 'w-[230px] sm:w-[335px]'} bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col`}
        >
          <div className={`${isLandscape ? 'px-2 py-1.5' : 'px-3 py-2'} flex-shrink-0 bg-gradient-to-r from-green-700 via-green-600 to-emerald-500 border-b border-green-300/40 flex items-center gap-2`}>
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
              <img src="/static/img/icon/card-album.svg" alt="" className="w-7 h-7 object-contain brightness-0 invert" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-base font-black uppercase tracking-wide leading-none text-white">{t('NINJA CARDS', 'NINJA CARDS')}</span>
            </div>
            <span className="shrink-0 rounded-lg border border-green-200/40 bg-gradient-to-r from-green-800 to-emerald-900 px-2 py-1 text-sm font-mono font-black leading-none text-white">
              {ownedCards.length}/{allCards.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar green-scrollbar">
            {ownedCards.length === 0 ? (
              <p className="text-[9px] text-slate-500 font-mono text-center py-3">{t('Nenhuma figurinha ainda. Abra pacotes para colecionar!', 'No cards yet. Open packs to collect!')}</p>
            ) : (
              <div className={`${isLandscape ? 'grid-cols-3' : 'grid-cols-5'} grid gap-1.5`}>
                {numberedOwned.map(({ card: c, num, copies }) => {
                  const fx = rarityFx(c.rarity);
                  const isPremium = c.rarity === 'lendario' || c.rarity === 'secreto';
                  const cardTitle = `#${String(num).padStart(3, '0')} — ${c.characterName} (${c.title}) ×${copies}`;
                  const rarityBadgeBackground: Record<NinjaCard['rarity'], string> = {
                    comum: 'bg-slate-500 text-white',
                    raro: 'bg-sky-600 text-white',
                    epico: 'bg-fuchsia-600 text-white',
                    lendario: 'bg-amber-500 text-slate-950',
                    secreto: 'bg-red-600 text-white',
                  };
                  const cardContent = (
                    <>
                      <img src={cardImage(c)} alt={c.characterName} className="w-full h-full object-cover" />
                      {fx && <span className={fx.sweep} />}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 px-1 pb-1">
                        <span className="min-w-0 truncate text-[7px] font-mono font-black leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                          #{String(num).padStart(3, '0')}
                        </span>
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[6px] font-mono font-black uppercase leading-none ${rarityBadgeBackground[c.rarity]}`}>
                          {CARD_RARITY_META[c.rarity].label}
                        </span>
                      </div>
                    </>
                  );
                  const cardClass = `relative aspect-[3/4] rounded-md border ${CARD_RARITY_META[c.rarity].border} ${CARD_RARITY_META[c.rarity].glow} bg-slate-900 cursor-pointer group shadow-lg flex-shrink-0 ${isPremium ? 'w-full overflow-hidden' : 'overflow-hidden hover:scale-105 transition-transform'} ${fx?.frame || ''}`;
                  const cardClick = () => { if (playClickSound) playClickSound(); setLightboxCard(c); };

                  return (
                    <div key={c.id} className="relative min-w-0 overflow-visible">
                      {isPremium ? (
                        <TiltCard className={cardClass} onClick={cardClick} title={cardTitle}>
                          {cardContent}
                        </TiltCard>
                      ) : (
                        <button className={cardClass} onClick={cardClick} title={cardTitle}>
                          {cardContent}
                        </button>
                      )}
                      {copies > 1 && (
                        <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-green-100 bg-gradient-to-br from-green-300 to-green-600 px-0.5 text-[11px] font-mono font-black leading-none text-green-950 shadow-[0_1px_5px_rgba(0,0,0,0.7),0_0_6px_rgba(34,197,94,0.65)] ring-1 ring-green-900/50">
                          {copies}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
        </div>

        {/* Badge rank — imagem absoluta no canto superior esquerdo */}
        <img
          src={`/static/img/ui/${rankR.id}.webp`}
          alt={rankR.name}
          style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 9999, objectFit: 'contain', pointerEvents: 'none', userSelect: 'none', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }}
          className="profile-card-rank-badge w-12 h-12 sm:w-16 sm:h-16"
        />
      </div>

      {/* LIGHTBOX — figurinha ampliada */}
      <AnimatePresence>
        {lightboxCard && (
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md"
            onClick={() => setLightboxCard(null)}
            data-no-uah
          >
            <button
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer z-10 shadow-lg"
              title={t('Fechar', 'Close')}
              onClick={(e) => { e.stopPropagation(); setLightboxCard(null); }}
            >
              <X className="w-5 h-5" />
            </button>

            <motion.div
              initial={false}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className={`${isLandscape ? 'flex-row-reverse items-center gap-4' : 'flex-col items-center'} relative flex max-h-full`}
            >
              {/* Navegação (anterior) */}
              {ownedCards.length > 1 && (
                <button
                  onClick={() => {
                    if (playScrollSound) playScrollSound();
                    const idx = ownedCards.findIndex(c => c.id === lightboxCard.id);
                    const prev = ownedCards[(idx - 1 + ownedCards.length) % ownedCards.length];
                    setLightboxCard(prev);
                  }}
                  data-sound="Scroll"
                  className="absolute left-[-52px] top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer shadow-lg hidden sm:block"
                  title={t('Anterior', 'Previous')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {/* Card ampliado */}
              <div className="card-gallery-lightbox-idle">
                {(lightboxCard.rarity === 'lendario' || lightboxCard.rarity === 'secreto') ? (
                  <Tilt3D key={lightboxCard.id} className="relative" glareRadius="rounded-2xl">
                    <div className={`relative ${isLandscape ? 'w-[min(52vh,360px)]' : 'w-[min(82vw,520px)]'} max-h-[78dvh] aspect-[3/4] rounded-2xl overflow-hidden border-4 bg-slate-950 shadow-2xl ${CARD_RARITY_META[lightboxCard.rarity].border} ${CARD_RARITY_META[lightboxCard.rarity].glow}`}>
                      <img src={cardImage(lightboxCard)} alt={lightboxCard.characterName} className="absolute inset-0 w-full h-full object-cover" />
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-0 ${rarityFx(lightboxCard.rarity)?.sweep}`}
                      />
                    </div>
                  </Tilt3D>
                ) : (
                  <div className={`relative ${isLandscape ? 'w-[min(52vh,360px)]' : 'w-[min(82vw,520px)]'} max-h-[78dvh] aspect-[3/4] rounded-2xl overflow-hidden border-4 bg-slate-950 shadow-2xl ${CARD_RARITY_META[lightboxCard.rarity].border} ${CARD_RARITY_META[lightboxCard.rarity].glow}`}>
                    <img src={cardImage(lightboxCard)} alt={lightboxCard.characterName} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Informações da figurinha (fora da imagem) */}
              <div className={`${isLandscape ? 'text-left max-w-[190px] mt-0' : 'mt-6 text-center max-w-[min(82vw,520px)]'} flex-shrink-0`}>
                <span
                  className="mb-2 inline-block rounded-lg border border-white/70 px-3 py-1 text-xs font-mono font-black uppercase text-white ring-1 ring-white/50"
                  style={{
                    background: CARD_RARITY_GLOW[lightboxCard.rarity].background,
                    boxShadow: lightboxCard.rarity === 'comum' || lightboxCard.rarity === 'raro'
                      ? 'none'
                      : `0 0 18px ${CARD_RARITY_GLOW[lightboxCard.rarity].shadow}`,
                    textShadow: lightboxCard.rarity === 'comum' || lightboxCard.rarity === 'raro'
                      ? 'none'
                      : `0 0 8px ${CARD_RARITY_GLOW[lightboxCard.rarity].shadow}`,
                  }}
                >
                  #{(ownedCards.findIndex(x => x.id === lightboxCard.id) + 1).toString().padStart(3, '0')} • {CARD_RARITY_META[lightboxCard.rarity].label}
                </span>
                <div className="flex items-center justify-center gap-2">
                  <p className="truncate text-white text-base font-extrabold leading-tight">{lightboxCard.characterName}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-mono font-black ${CARD_RARITY_META[lightboxCard.rarity].chip}`}>
                    {cardCopies.get(lightboxCard.id) || 1}
                  </span>
                </div>
              </div>

              {/* Navegação (próxima) */}
              {ownedCards.length > 1 && (
                <button
                  onClick={() => {
                    if (playScrollSound) playScrollSound();
                    const idx = ownedCards.findIndex(c => c.id === lightboxCard.id);
                    const next = ownedCards[(idx + 1) % ownedCards.length];
                    setLightboxCard(next);
                  }}
                  data-sound="Scroll"
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
