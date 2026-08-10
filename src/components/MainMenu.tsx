/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Sword, Play, HelpCircle, Shield, Award, LogOut, Calendar, ShoppingBag, Sparkles, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import ProfileCardModal from './ProfileCardModal';
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
  user: UserProfile;
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

  const ryos = user.ryos ?? 1500;
  const gems = user.gems ?? 120;

  const ranks = getRanks();
  const userXp = user.xp || 0;
  const rankProgress = getRankProgress(userXp, ranks);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden font-sans selection:bg-orange-600 selection:text-white">
      {/* Decorative Background effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      {/* Top Header Row */}
      <div className="flex justify-between items-center max-w-7xl w-full mx-auto z-10 gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2.5 rounded-xl border border-orange-400/20 shadow-lg shadow-orange-600/10">
            <Sword className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase bg-gradient-to-r from-white via-slate-100 to-orange-400 bg-clip-text text-transparent">
              NARUTO UNISON
            </h1>
            <span className="font-mono text-[10px] tracking-wider text-orange-400 uppercase font-bold block leading-none">Engine v1.0</span>
          </div>
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

          <button
            onClick={onLogout}
            className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/80 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer text-slate-400 shadow"
            title={t('Sair da Conta', 'Log Out')}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showProfileCardModal && (
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

        {showProfileModal && (
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

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent uppercase">
            NARUTO <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">UNISON</span>
          </h1>

          <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            {t(
              'Escolha seu time de 3 ninjas lendários, gerencie suas reservas elementais de chakra e esmague os oponentes com habilidades e combos sincronizados.',
              'Choose your team of 3 legendary ninjas, manage your elemental chakra reserves and crush opponents with synchronized skills and combos.'
            )}
          </p>

          {/* MAIN ACTION BAR: PERFIL + ENTRAR NA ARENA */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3 md:gap-4 max-w-4xl mx-auto">
            {/* PERFIL BUTTON */}
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

            {/* ENTRAR NA ARENA CTA BUTTON */}
            <button
              onClick={handleStart}
              className="p-3.5 px-8 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-mono font-black rounded-2xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-orange-600/25 border border-orange-400 cursor-pointer text-sm uppercase tracking-wider"
            >
              <Play className="w-5 h-5 fill-slate-950 text-slate-950" />
              {t('Entrar na Arena', 'Enter the Arena')}
            </button>

            {/* COMO JOGAR BUTTON */}
            <button
              onClick={() => {
                playClickSound();
                setShowRules(!showRules);
              }}
              className="p-3.5 px-5 bg-slate-900 border border-slate-800 text-slate-300 font-mono font-bold rounded-2xl flex items-center gap-2 hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all cursor-pointer text-xs uppercase tracking-wider"
            >
              <HelpCircle className="w-4 h-4 text-orange-400" />
              {t('Como Jogar', 'How to Play')}
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
          <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-blue-500/60" /> Unison Engine v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

 