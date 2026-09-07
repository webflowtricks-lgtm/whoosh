/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Sword, HelpCircle, Shield, Award, LogOut, Calendar, ShoppingBag, Sparkles, User, Images, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import ProfileCardModal from './ProfileCardModal';
import CardGalleryModal from './CardGalleryModal';
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
  playUahSound: () => void;
  onOpenAdmin: () => void;
  user: UserProfile | null;
  onLogout: () => void;
  onUpdateUser?: (updatedUser: UserProfile) => void;
  audioSettings: { master: number; effects: number; music: number };
  onUpdateAudioSetting: (key: 'master' | 'effects' | 'music', value: number) => void;
}

export default function MainMenu({ onStartGame, isMuted, onToggleMute, playClickSound, playScrollSound, playUahSound, onOpenAdmin, user, onLogout, onUpdateUser, audioSettings, onUpdateAudioSetting }: MainMenuProps) {
  const { t } = useLanguage();
  const [showRules, setShowRules] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileCardModal, setShowProfileCardModal] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);

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
              playScrollSound();
              setShowGalleryModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-fuchsia-500 hover:bg-slate-950 hover:text-fuchsia-400 transition-all cursor-pointer text-slate-400 font-mono text-xs flex items-center gap-2 uppercase tracking-wider font-semibold shadow"
            title={t('Galeria Ninja Cards (Figuras Colecionáveis)', 'Ninja Cards Gallery (Collectible Figures)')}
          >
            <Images className="w-4 h-4 text-fuchsia-500" />
            <span>{t('Cards', 'Cards')}</span>
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
            onClick={() => {
              playClickSound();
              playScrollSound();
              setShowAudioSettings(true);
            }}
            className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500 hover:bg-slate-800 transition-all cursor-pointer text-slate-300 shadow"
            title={t('Configurações de volume', 'Volume settings')}
          >
            <Settings className="w-5 h-5 text-orange-400" />
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
        {showAudioSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
            onClick={() => setShowAudioSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-orange-500/40 bg-slate-900 p-6 text-slate-100 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-orange-300">
                  <Settings className="h-5 w-5" />
                  {t('Configurações de Volume', 'Volume Settings')}
                </h2>
                <button
                  onClick={() => setShowAudioSettings(false)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  title={t('Fechar', 'Close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5">
                {([
                  ['master', t('Volume geral', 'Master volume')],
                  ['effects', t('Efeitos sonoros', 'Sound effects')],
                  ['music', t('Música', 'Music')],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block space-y-2">
                    <span className="flex items-center justify-between text-sm font-bold text-slate-200">
                      <span>{label}</span>
                      <span className="font-mono text-orange-300">{Math.round(audioSettings[key] * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={audioSettings[key]}
                      onChange={e => onUpdateAudioSetting(key, Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-orange-500"
                    />
                  </label>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

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
              collectedCardIds: user.collectedCardIds || [],
            }}
            isSelf={true}
            onClose={() => setShowProfileCardModal(false)}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            onOpenEditModal={() => {
              playScrollSound();
              setShowProfileModal(true);
            }}
          />
        )}

        {user && showProfileModal && (
          <ProfileModal
            user={user}
            onClose={() => setShowProfileModal(false)}
            onUpdateUser={handleUserUpdate}
            playClickSound={playClickSound}
            playUahSound={playUahSound}
            playScrollSound={playScrollSound}
          />
        )}

        {user && showGalleryModal && (
          <CardGalleryModal
            user={user}
            onClose={() => setShowGalleryModal(false)}
            onUpdateUser={handleUserUpdate}
            playClickSound={playClickSound}
          />
        )}
      </AnimatePresence>

      {/* Center Hero/Cta */}
      <div className="menu-center-container max-w-5xl w-full mx-auto flex flex-col items-center justify-center text-center z-10 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-5 w-full"
        >
        

          <img
            src="/static/img/logo.webp"
            alt="NARUTO ARENA"
            className="menu-logo-central w-auto mx-auto"
          />

          <p className="text-escolha-seu-time text-slate-400 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            {t(
              'Escolha seu time de 3 ninjas lendários, gerencie suas reservas elementais de chakra e esmague os oponentes com habilidades e combos sincronizados.',
              'Choose your team of 3 legendary ninjas, manage your elemental chakra reserves and crush opponents with synchronized skills and combos.'
            )}
          </p>

          {/* MAIN ACTION BAR: ENTRAR NA ARENA */}
          <div className="botões-main-menu pt-1 flex flex-wrap items-center justify-center gap-3 md:gap-4 max-w-4xl mx-auto">

            {/* ENTRAR NA ARENA CTA BUTTON */}
            <div className="relative">
              {/* PORTAL ANIMATION (apenas as partículas girando — círculos removidos) */}
              <div className="portal-animation absolute -inset-8 pointer-events-none flex items-center justify-center" aria-hidden>
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
                className="entrar-na-arena-btn relative flex items-center justify-center gap-3 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <img
                  src="/static/img/ui/gold-shuriken.webp"
                  alt=""
                  aria-hidden="true"
                  className="btn-shuriken"
                />
                <span className="entrar-na-arena-label relative flex items-center justify-center pointer-events-none">
                  {t('ENTRAR NA ARENA', 'ENTER ARENA')}
                </span>
              </button>
            </div>

            {/* COMO JOGAR BUTTON */}
            <div className="relative flex items-center justify-center">
              {/* Naruto duvida atrás do botão, um pouco acima */}
              <img
                src="/static/img/ui/naruto-duvida.webp"
                alt=""
                aria-hidden="true"
                className="como-jogar-naruto"
              />
              <button
                onClick={() => {
                  playClickSound();
                  setShowRules(!showRules);
                }}
                className="como-jogar-btn relative text-white flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
              >
                <HelpCircle className="w-4 h-4 drop-shadow" />
                <span>{t('Como Jogar', 'How to Play')}</span>
              </button>
            </div>
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
      <div className="pt-4 max-w-7xl w-full mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-[#bebebe] font-mono z-10 gap-4">
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

 
