/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, HelpCircle, Shield, Award, LogOut, Calendar, ShoppingBag, Sparkles, User, Images, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import ProfileCardModal from './ProfileCardModal';
import CardGalleryModal from './CardGalleryModal';
import MangekyoLoader from './MangekyoLoader';
import GameManualModal from './GameManualModal';
import { getRanks } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { getCurrentVillageId } from '../lib/villages';
import { useLanguage } from '../lib/i18n';
import { fetchCharactersFromServer, getCharacters } from '../lib/characterStorage';

declare const __WHOOSH_BUILD_VERSION__: string;

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
  const [menuCharacters, setMenuCharacters] = useState(() => getCharacters().slice(0, 200));

  useEffect(() => {
    let isMounted = true;
    fetchCharactersFromServer()
      .then(characters => {
        if (isMounted) setMenuCharacters(characters.slice(0, 200));
      })
      .catch(error => {
        console.error('Failed to load characters for the main menu:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
  const isGameAdmin = user?.username.trim().toLowerCase() === '2';

  const ranks = getRanks();
  const userXp = user?.xp || 0;
  const rankProgress = getRankProgress(userXp, ranks);

  return (
    <div className="main-menu-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden font-sans selection:bg-orange-600 selection:text-white">
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

      <div className="main-menu-character-portraits" aria-hidden="true">
        {Array.from({ length: 4 }, (_, rowIndex) => {
          const rowCharacters = menuCharacters.slice(rowIndex * 50, rowIndex * 50 + 50);
          return (
            <div
              className="main-menu-character-row"
              key={rowIndex}
              style={{ transform: `translateY(${rowIndex * 11}px)` }}
            >
              <div
                className="main-menu-character-track"
                style={{ animationDelay: `${rowIndex * -5}s` }}
              >
                {Array.from({ length: 2 }, (_, copyIndex) => (
                  <div className="main-menu-character-set" key={copyIndex}>
                    {rowCharacters.map(character => (
                      <img
                        key={character.id}
                        src={character.portrait}
                        alt=""
                        loading="eager"
                        decoding="async"
                        onError={event => {
                          const image = event.currentTarget;
                          const fallbacks = [
                            `/static/img/ninja/${character.folder}/icon.jpg`,
                            `/static/img/ninja/${character.folder}/portrait.webp`,
                            `/static/img/ninja/${character.folder}/portrait.png`,
                            `/static/img/ninja/${character.folder}/icon.png`,
                            `/static/img/ninja/${character.folder}/icon.webp`,
                          ];
                          const fallbackIndex = Number(image.dataset.fallbackIndex || 0);
                          const fallback = fallbacks[fallbackIndex];
                          if (fallback) {
                            image.dataset.fallbackIndex = String(fallbackIndex + 1);
                            image.src = fallback;
                          } else {
                            image.style.visibility = 'hidden';
                          }
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="leaves main-menu-leaves gpu-accelerated">
        <img src="/static/img/ui/folha.webp" className="leaf leaf1" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf2" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf3" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf4" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf5" alt="" loading="lazy" decoding="async" />
        <img src="/static/img/ui/folha.webp" className="leaf leaf6" alt="" loading="lazy" decoding="async" />
      </div>

      {/* Top Header Row */}
      <div className="main-menu-header flex justify-between items-center max-w-7xl w-full mx-auto z-10 gap-3">
        <div className="main-menu-user flex items-center">
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

        <div className="main-menu-header-actions flex items-center gap-3">
          {isGameAdmin && (
            <button
              onClick={() => {
                playClickSound();
                onOpenAdmin();
              }}
              className="main-menu-admin-button px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500 hover:bg-slate-950 hover:text-orange-400 transition-all cursor-pointer text-slate-400 font-mono text-xs flex items-center gap-2 uppercase tracking-wider font-semibold shadow"
              title={t('Painel Administrativo', 'Admin Panel')}
            >
              <Shield className="w-4 h-4 text-orange-500" />
              <span>{t('Painel', 'Admin')}</span>
            </button>
          )}

          <button
            onClick={() => {
              playClickSound();
              playScrollSound();
              setShowGalleryModal(true);
            }}
            className="main-menu-cards-button px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-fuchsia-500 hover:bg-slate-950 hover:text-fuchsia-400 transition-all cursor-pointer text-slate-400 font-mono text-xs flex items-center gap-2 uppercase tracking-wider font-semibold shadow"
            title={t('Ninja Cards (Figuras Colecionáveis)', 'Ninja Cards (Collectible Figures)')}
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
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
            onClick={() => setShowAudioSettings(false)}
          >
            <motion.div
              initial={false}
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
              village: getCurrentVillageId(user.village),
              collectedCardIds: user.collectedCardIds || [],
            }}
            isSelf={true}
            onClose={() => setShowProfileCardModal(false)}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
            onOpenEditModal={() => {
              setShowProfileCardModal(false);
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
            playClickSound={playClickSound}
            onOpenShopPacks={() => {
              setShowGalleryModal(false);
              setShowShopModal(true);
            }}
          />
        )}
        {user && showShopModal && (
          <ShopModal
            user={user}
            initialTab="bundle"
            onClose={() => setShowShopModal(false)}
            onUpdateUser={handleUserUpdate}
            playClickSound={playClickSound}
            playScrollSound={playScrollSound}
          />
        )}
      </AnimatePresence>

      {/* Center Hero/Cta */}
      <div className="main-menu-center menu-center-container max-w-5xl w-full mx-auto flex flex-col items-center justify-center text-center z-10 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="main-menu-hero-content space-y-5 w-full"
        >
        

          <img
            src="/static/img/logo.webp"
            alt="NARUTO ARENA"
            className="menu-logo-central w-auto mx-auto"
          />

          <p className="text-escolha-seu-time text-slate-400 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed">
            {t(
              'Escolha seu time de 3 ninjas, gerencie suas reservas elementais de chakra e esmague os oponentes com habilidades e combos sincronizados.',
              'Choose your team of 3 ninjas, manage your elemental chakra reserves and crush opponents with synchronized skills and combos.'
            )}
          </p>

          {/* MAIN ACTION BAR: ENTRAR NA ARENA */}
          <div className="main-menu-actions botões-main-menu pt-1 flex flex-wrap items-center justify-center gap-3 md:gap-4 max-w-4xl mx-auto">

            {/* ENTRAR NA ARENA CTA BUTTON */}
            <div className="arena-btn-wrap relative">
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
                className="main-menu-arena-cta relative flex items-center justify-center gap-3 cursor-pointer"
              >
                <img src="/static/img/icon/star.svg" alt="" className="main-menu-arena-star h-5 w-5 animate-spin object-contain" aria-hidden="true" />
                <span className="entrar-na-arena-label relative flex items-center justify-center pointer-events-none">
                  {t('ENTRAR NA ARENA', 'ENTER ARENA')}
                </span>
              </button>
            </div>

            {/* COMO JOGAR BUTTON */}
            <div className="como-jogar-wrap relative flex items-center justify-center">
              <img
                src="/static/img/ui/naruto-duvida.webp"
                alt=""
                className="como-jogar-naruto"
                aria-hidden="true"
              />
              <button
                onClick={() => {
                  playClickSound();
                  setShowRules(true);
                }}
                className="como-jogar-btn relative text-white flex items-center justify-center gap-2 active:scale-95 cursor-pointer uppercase tracking-wider"
              >
                <HelpCircle className="w-4 h-4 drop-shadow" />
                <span>{t('Como Jogar', 'How to Play')}</span>
              </button>
            </div>
          </div>
        </motion.div>

      </div>

      <GameManualModal isOpen={showRules} onClose={() => setShowRules(false)} playClickSound={playClickSound} />

      {/* Footer Info */}
      <div className="main-menu-footer pt-4 max-w-7xl w-full mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-[#bebebe] font-mono z-10 gap-4">
        <div className="main-menu-copyright">
          {t(
            'Naruto é propriedade de Masashi Kishimoto, Pierrot Co. e Viz Media.',
            'Naruto is property of Masashi Kishimoto, Pierrot Co. and Viz Media.'
          )}
        </div>
        <div className="self-end md:self-center flex items-center gap-4">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-orange-500/60" /> {t('Anti-Cheat Verificado', 'Anti-Cheat Verified')}</span>
          <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-blue-500/60" />Engine v1.0.0</span>
          <span
            className="self-end rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-slate-400"
            title={t(
              'Versão do código deste deploy. +local indica alterações ainda não commitadas.',
              'Code version in this deployment. +local indicates uncommitted changes.',
            )}
            aria-label={`${import.meta.env.DEV ? 'DEV' : 'PROD'} ${__WHOOSH_BUILD_VERSION__}`}
          >
            {import.meta.env.DEV ? 'DEV' : 'PROD'} · {__WHOOSH_BUILD_VERSION__}
          </span>
        </div>
      </div>
    </div>
  );
}

 
