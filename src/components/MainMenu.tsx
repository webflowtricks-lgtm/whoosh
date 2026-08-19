/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Sword, HelpCircle, Shield, Award, LogOut, Calendar, ShoppingBag, Sparkles, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import ProfileCardModal from './ProfileCardModal';
import MangekyoLoader from './MangekyoLoader';
import { getRanks } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { useLanguage } from '../lib/i18n';

interface MainMenuProps {
  onStartGame: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  onOpenAdmin: () => void;
  user: UserProfile | null;
  onLogout: () => void;
  onUpdateUser?: (updatedUser: UserProfile) => void;
}

export default function MainMenu({ onStartGame, isMuted, onToggleMute, playClickSound, playScrollSound, onOpenAdmin, user, onLogout, onUpdateUser }: MainMenuProps) {
  const { t } = useLanguage();
  const [showRules, setShowRules] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileCardModal, setShowProfileCardModal] = useState(false);

  const handleStart = () => {
    playClickSound();
    onStartGame();
  };

  const handleUserUpdate = (updated: UserProfile) => {
    if (onUpdateUser) {
      onUpdateUser(updated);
    }
  };

  const ryos = user ? (user.ryos ?? 1500) : 1500;
  const gems = user ? (user.gems ?? 120) : 120;

  const ranks = getRanks();
  const userXp = user?.xp || 0;
  const rankProgress = getRankProgress(userXp, ranks);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden font-sans selection:bg-orange-600 selection:text-white">
      {/* Background Image */}
      <img
        src="/static/img/bg/background-screen.webp"
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
      />
      <div className="absolute inset-0 bg-slate-950/40 pointer-events-none" />
      {/* Decorative Background effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      {/* Top Header Row */}
      <div className="flex justify-between items-center max-w-7xl w-full mx-auto z-10 gap-3">
        <div className="flex items-center">
          {user ? (
            <button
              onClick={() => {
                playClickSound();
                playScrollSound();
                setShowProfileCardModal(true);
              }}
              className="p-3.5 px-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-orange-500/80 hover:bg-slate-900 text-slate-200 transition-all cursor-pointer flex items-center gap-3 shadow-xl group relative"
              title={t('Acessar Card do Perfil & Curtidas', 'Access Profile Card & Likes')}
            >
              {/* Avatar with Equipped Frame */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-950 border border-orange-500/50 shadow">
                  <MangekyoLoader
                    src={user.photoUrl}
                    alt={user.name}
                    className="w-full h-full rounded-full"
                    imgClassName="rounded-full"
                    iconScale={0.55}
                  />
                </div>
                {user.equippedFrameUrl && (
                  <img
                    src={user.equippedFrameUrl || null}
                    alt={t('Moldura Equipada', 'Equipped Frame')}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain z-10"
                  />
                )}
              </div>

              <div className="text-left min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-mono font-black text-slate-100 truncate group-hover:text-orange-400">{user.name}</span>
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
                    <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                      {user.title}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <div className="w-20 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400"
                      style={{ width: `${rankProgress.progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 font-bold">
                    {rankProgress.isMaxRank ? 'MAX' : `${userXp.toLocaleString()} XP`}
                  </span>
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="p-3.5 px-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-orange-500/80 hover:bg-slate-900 text-slate-200 transition-all cursor-pointer flex items-center gap-3 shadow-xl group"
              title={t('Entrar com sua conta ninja', 'Log in with your ninja account')}
            >
              <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center shadow">
                <User className="w-5 h-5 text-slate-950" />
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs font-mono font-black text-orange-400 uppercase tracking-wide">
                  {t('Visitante', 'Guest')}
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  {t('Toque para entrar na arena', 'Tap to enter the arena')}
                </div>
              </div>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              playClickSound();
              onOpenAdmin();
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500 hover:bg-slate-950 hover:text-orange-400 transition-all cursor-pointer text-slate-400 font-mono text-xs flex items-center gap-2 uppercase tracking-wider font-semibold shadow"
            title={t('Painel Administrativo', 'Admin Panel')}
          >
            <Shield className="w-4 h-4 text-orange-500" />
            <span>{t('Painel', 'Admin')}</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onToggleMute();
            }}
            className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 transition-all cursor-pointer text-slate-300 shadow"
            title={isMuted ? t('Ativar Som', 'Unmute Sound') : t('Desativar Som', 'Mute Sound')}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-orange-400" />}
          </button>

          {user && (
            <button
              onClick={onLogout}
              className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/80 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer text-slate-400 shadow"
              title={t('Sair da Conta', 'Log Out')}
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {user && showProfileCardModal && (
          <ProfileCardModal
            profile={{
              name: user.name,
              username: user.username,
              photoUrl: user.photoUrl,
              title: user.title,
              equippedFrame: user.equippedFrame,
              equippedFrameUrl: user.equippedFrameUrl,
              equippedBannerUrl: user.equippedBannerUrl,
              equippedBannerPositionY: user.equippedBannerPositionY,
              equippedBannerPositionX: user.equippedBannerPositionX,
              equippedShowcaseSkinUrl: user.equippedShowcaseSkinUrl,
              xp: user.xp || 0,
              rank: rankProgress.currentRank.name,
              wins: user.wins || 0,
              losses: user.losses || 0,
              village: t('Vila da Folha (Konoha)', 'Leaf Village (Konoha)'),
            }}
            isSelf={true}
            onClose={() => setShowProfileCardModal(false)}
            playClickSound={playClickSound}
            onOpenEditModal={() => setShowProfileModal(true)}
          />
        )}

        {user && showProfileModal && (
          <ProfileModal
            user={user}
            onClose={() => setShowProfileModal(false)}
            onUpdateUser={handleUserUpdate}
            playClickSound={playClickSound}
          />
        )}
      </AnimatePresence>

      {/* Center Hero/Cta */}
      <div className="max-w-5xl w-full mx-auto flex flex-col items-center justify-center text-center py-8 z-10 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6 w-full"
        >
          <div className="inline-block px-3 py-1 bg-orange-600/10 rounded-full border border-orange-500/30 text-xs font-mono text-orange-400 font-semibold tracking-wider uppercase">
            {t('Arena Tática Lendária 3v3', '3v3 Legendary Tactical Arena')}
          </div>

          <img
            src="/static/img/logo.webp"
            alt="NARUTO ARENA"
            className="menu-logo-central w-auto mx-auto"
          />

          <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            {t(
              'Escolha seu time de 3 ninjas lendários, gerencie suas reservas elementais de chakra e esmague os oponentes com habilidades e combos sincronizados.',
              'Choose your team of 3 legendary ninjas, manage your elemental chakra reserves and crush opponents with synchronized skills and combos.'
            )}
          </p>

          {/* MAIN ACTION BAR: ENTRAR NA ARENA */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3 md:gap-4 max-w-4xl mx-auto">

            {/* ENTRAR NA ARENA CTA BUTTON */}
            <div className="relative">
              {/* PORTAL ANIMATION */}
              <div className="portal-animation absolute -inset-8 pointer-events-none flex items-center justify-center" aria-hidden>
                <div className="absolute w-60 h-60 rounded-full bg-orange-500/15 blur-3xl animate-pulse" style={{ animationDuration: '3s' }} />
                <div className="portal-rim absolute w-48 h-48" />
                <div className="portal-halo absolute w-48 h-48" />
                <div className="portal-vortex-a absolute w-48 h-48" />
                <div className="portal-vortex-b absolute w-44 h-44" />
                <div className="portal-vortex-c absolute w-48 h-48" />
                <div className="portal-depth absolute w-48 h-48" />
                <svg
                  className="portal-spiral absolute w-48 h-48 animate-spin"
                  style={{ animationDuration: '8s', animationDirection: 'reverse' }}
                  viewBox="-90 -90 290 290"
                  fill="none"
                >
                  <path
                    d="M 54.0 50.0 54.9 50.4 55.7 50.9 56.4 51.6 57.1 52.4 57.7 53.3 58.2 54.3 58.6 55.4 58.9 56.6 59.0 57.9 58.9 59.2 58.7 60.5 58.4 61.9 57.8 63.3 57.1 64.7 56.2 66.0 55.2 67.3 54.0 68.5 52.6 69.7 51.1 70.7 49.4 71.6 47.5 72.3 45.6 72.9 43.6 73.4 41.4 73.6 39.2 73.6 36.9 73.5 34.6 73.1 32.2 72.5 29.9 71.6 27.6 70.5 25.3 69.2 23.1 67.7 21.0 65.9 19.1 63.9 17.2 61.7 15.5 59.2 14.0 56.6 12.8 53.8 11.7 50.8 10.9 47.7 10.3 44.5 10.0 41.1 10.0 37.7 10.3 34.2 10.9 30.7 11.8 27.2 13.0 23.7 14.6 20.3 16.4 16.9 18.6 13.7 21.1 10.6 23.9 7.6 27.0 4.9 30.3 2.4 33.9 0.1 37.7 -1.8 41.8 -3.5 46.0 -4.9 50.4 -5.9 55.0 -6.6 59.6 -6.9 64.4 -6.8 69.1 -6.3 73.9 -5.4 78.7 -4.1 83.4 -2.3 88.0 -0.2 92.5 2.3 96.8 5.3 100.9 8.6 104.7 12.3 108.3 16.3 111.6 20.7 114.6 25.4 117.2 30.4 119.4 35.7 121.2 41.2 122.6 46.9 123.5 52.7 123.9 58.7 123.8 64.7 123.3 70.8 122.2 76.9 120.6 83.0 118.5 88.9 115.9 94.8 112.8 100.5 109.2 105.9 105.1 111.1 100.6 116.0 95.7 120.6 90.3 124.8 84.5 128.6 78.4 131.9 72.0 134.8 65.3 137.1 58.4 139.0 51.3 140.2 44.0 140.9 36.6 141.0 29.2 140.5 21.8 139.4 14.4 137.7 7.1 135.3 -0.1 132.4 -7.0 128.8 -13.7 124.7 -20.1 120.0 -26.1 114.7 -31.8 109.0 -37.0 102.7 -41.7 96.0 -45.9 88.8 -49.5 81.3 -52.6 73.4 -55.0 65.3 -56.7 56.9 -57.8 48.4 -58.2 39.7 -57.9 30.9 -56.9 22.1 -55.2 13.4 -52.7 4.7 -49.5 -3.8 -45.7 -12.0 -41.1 -20.0 -35.9 -27.6 -30.0 -34.9 -23.5 -41.7 -16.4 -48.0 -8.8 -53.8 -0.7 -58.9 7.9 -63.5 16.8 -67.3 26.1 -70.5 35.7 -72.9 45.6 -74.5 55.6 -75.3 65.7 -75.3 75.8 -74.6 85.9 -72.9 96.0 -70.5 105.8 -67.2 115.5 -63.2 124.8 -58.3 133.8 -52.6 142.3 -46.3 150.4 -39.2 157.9 -31.4 164.8 -23.0 171.0 -14.0 176.5 -4.5 181.3 5.6 185.3 16.0 188.5 26.7 190.8 37.8 192.2 49.1"
                    stroke="rgba(255,190,110,0.9)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="portal-orbit absolute w-56 h-56">
                  <span className="portal-particle" style={{ top: '50%', left: '0%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '50%', left: '100%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '0%', left: '50%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '100%', left: '50%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '0%', left: '0%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '0%', left: '100%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '100%', left: '0%', transform: 'translate(-50%,-50%)' }} />
                  <span className="portal-particle" style={{ top: '100%', left: '100%', transform: 'translate(-50%,-50%)' }} />
                </div>
              </div>
              <button
                onClick={handleStart}
                className="entrar-na-arena-btn relative text-slate-900 font-mono font-black flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer text-sm uppercase tracking-wider shadow-xl"
              >
                <img
                  src="/static/img/entrar-na-arena.webp"
                  alt={t('Entrar na Arena', 'Enter the Arena')}
                  className="h-full w-auto"
                />
                <span className="entrar-na-arena-label absolute inset-0 flex items-center justify-center pointer-events-none">
                  {t('Entrar na Arena', 'Enter the Arena')}
                </span>
              </button>
            </div>

            {/* COMO JOGAR BUTTON */}
            <button
              onClick={() => {
                playClickSound();
                setShowRules(!showRules);
              }}
              className="como-jogar-btn relative text-slate-900 font-mono font-black flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer text-xs uppercase tracking-wider shadow-xl"
            >
              <img
                src="/static/img/como-jogar.webp"
                alt={t('Como Jogar', 'How to Play')}
                className="h-full w-auto"
              />
              <span className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none">
                <HelpCircle className="w-4 h-4 text-orange-600 drop-shadow" />
                <span>{t('Como Jogar', 'How to Play')}</span>
              </span>
            </button>
          </div>
        </motion.div>

        {/* Rules Expansion Section */}
        {showRules && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="mt-8 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl text-left max-w-3xl w-full space-y-4 shadow-2xl"
          >
            <h3 className="font-semibold text-lg text-orange-400 flex items-center gap-2">
              <Sword className="w-5 h-5" /> {t('Regras e Mecânicas de Combate', 'Rules and Combat Mechanics')}
            </h3>
            <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-300">
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">
                  {t('1. Escolha e Formação de Equipe', '1. Team Choice and Formation')}
                </p>
                <p className="text-slate-400 leading-relaxed text-xs">
                  {t(
                    'Escolha 3 Ninjas para formar seu esquadrão. Cada ninja possui uma imagem e 4 habilidades personalizadas.',
                    'Choose 3 Ninjas to form your squad. Each ninja has an image and 4 custom skills.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">
                  {t('2. Rolagem de Chakra por Turno', '2. Chakra Roll per Turn')}
                </p>
                <p className="text-slate-400 leading-relaxed text-xs">
                  {t(
                    'A cada turno, você gera 1 chakra aleatório por aliado vivo dos tipos: Taijutsu, Ninjutsu, Genjutsu ou Linhagem Sanguínea. Se tiver 2 aliados vivos, gera 2 chakras.',
                    'Each turn, you generate 1 random chakra per living ally of types: Taijutsu, Ninjutsu, Genjutsu, or Bloodline. If you have 2 living allies, you generate 2 chakras.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">
                  {t('3. Seleção de Alvo e Gasto de Chakra', '3. Target Selection & Chakra Cost')}
                </p>
                <p className="text-slate-400 leading-relaxed text-xs">
                  {t(
                    'Selecione uma habilidade e clique no alvo correspondente. As habilidades consomem chakra elemental ou Aleatório (Cinza).',
                    'Select a skill and click on the corresponding target. Skills consume elemental or Random (Gray) chakra.'
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">
                  {t('4. Efeitos e Vitória', '4. Effects & Victory')}
                </p>
                <p className="text-slate-400 leading-relaxed text-xs">
                  {t(
                    'Use Escudos, Invulnerabilidade, Contra-ataques e Atordoamentos. Reduza a vida de todos os 3 ninjas inimigos a 0 para vencer!',
                    'Use Shields, Invulnerability, Counter-attacks, and Stuns. Reduce all 3 enemy ninjas’ health to 0 to win!'
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-900 pt-4 max-w-7xl w-full mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 font-mono z-10 gap-4">
        <div>
          {t(
            'Naruto é propriedade de Masashi Kishimoto, Pierrot Co. e Viz Media.',
            'Naruto is property of Masashi Kishimoto, Pierrot Co. and Viz Media.'
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-orange-500/60" /> {t('Anti-Cheat Verificado', 'Anti-Cheat Verified')}</span>
          <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-blue-500/60" />Engine v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

 
