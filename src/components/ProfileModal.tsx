/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Shield, Award, Sparkles, Check, Image as ImageIcon, Camera, Upload, Save, RefreshCw, Move, ArrowUpDown, ArrowLeftRight } from 'lucide-react';
import { UserProfile, Character } from '../types';
import { getPngFrames, PngFrameItem, fetchPngFramesFromServer } from '../lib/frameStorage';
import { getCustomBanners, CustomBannerItem, fetchCustomBannersFromServer } from '../lib/bannerStorage';
import { getCharacters } from '../lib/characterStorage';
import { useLanguage } from '../lib/i18n';

interface ProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updated: UserProfile) => void;
  playClickSound: () => void;
}

const PRESET_STYLED_FRAMES = [
  { name: 'Padrão', style: 'border-2 border-slate-700', badge: 'INICIAL' },
  { name: 'Fogo da Vontade', style: 'border-2 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] bg-gradient-to-tr from-amber-500 to-red-500 p-0.5', badge: 'FOLHA' },
  { name: 'Sharingan Carmesim', style: 'border-2 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.7)] bg-gradient-to-tr from-red-600 to-rose-950 p-0.5', badge: 'UCHIHA' },
  { name: 'Operativo ANBU', style: 'border-2 border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.5)] bg-gradient-to-tr from-slate-200 to-slate-500 p-0.5', badge: 'ANBU' },
  { name: 'Sábio dos Seis Caminhos', style: 'border-2 border-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.8)] bg-gradient-to-tr from-yellow-300 via-amber-400 to-orange-500 p-0.5', badge: 'DIVINO' },
  { name: 'Guerra Shinobi', style: 'border-2 border-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.6)] bg-gradient-to-tr from-orange-500 via-amber-500 to-red-600 p-0.5', badge: 'ALIANÇA' }
];

export default function ProfileModal({ user, onClose, onUpdateUser, playClickSound }: ProfileModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(user.name);
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl);
  const [title, setTitle] = useState(user.title || 'Estudante');
  const [equippedFrame, setEquippedFrame] = useState<string>(user.equippedFrame || 'Padrão');
  const [equippedFrameUrl, setEquippedFrameUrl] = useState<string | undefined>(user.equippedFrameUrl);
  const [equippedBannerUrl, setEquippedBannerUrl] = useState<string | undefined>(user.equippedBannerUrl);
  const [equippedBannerPositionY, setEquippedBannerPositionY] = useState<number>(user.equippedBannerPositionY ?? 50);
  const [equippedBannerPositionX, setEquippedBannerPositionX] = useState<number>(user.equippedBannerPositionX ?? 50);
  const [equippedShowcaseSkinUrl, setEquippedShowcaseSkinUrl] = useState<string | undefined>(user.equippedShowcaseSkinUrl);

  const [pngFrames, setPngFrames] = useState<PngFrameItem[]>([]);
  const [customBanners, setCustomBanners] = useState<CustomBannerItem[]>([]);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'frames' | 'banners' | 'showcase'>('banners');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchPngFramesFromServer().then(setPngFrames);
    fetchCustomBannersFromServer().then(setCustomBanners);
    setAllCharacters(getCharacters());
  }, []);

  const unlockedFrames = user.unlockedFrames || ['Padrão', 'Fogo da Vontade', 'Operativo ANBU', 'Guerra Shinobi'];
  const unlockedFrameUrls = user.unlockedFrameUrls || [];
  const unlockedTitles = user.unlockedTitles || ['Estudante', 'Genin de Konoha', 'Herói da Aliança'];

  // Default preset banners available
  const presetBanners = [
    { name: 'Padrão (Gradiente Clássico)', url: undefined, badge: 'INICIAL' },
  ];

  // Map custom banners from Admin Banner Gallery
  const galleryBanners = customBanners.map(cb => ({
    name: cb.name,
    url: cb.imageUrl,
    badge: cb.badge || 'LENDÁRIO'
  }));

  // Merge with custom unlocked banners from user profile
  const userUnlockedBannerUrls = user.unlockedBannerUrls || [];
  const allBanners = [...presetBanners];

  // Add gallery banners first
  galleryBanners.forEach(gb => {
    if (!allBanners.some(b => b.url === gb.url)) {
      allBanners.push(gb);
    }
  });

  // Add any other user unlocked banner URLs
  userUnlockedBannerUrls.forEach((url, idx) => {
    if (!allBanners.some(b => b.url === url)) {
      allBanners.push({
        name: user.unlockedBanners?.[idx] || `Banner Especial #${idx + 1}`,
        url,
        badge: 'MISSÃO'
      });
    }
  });

  // Combine default PNG frames with user unlocked ones
  const allPngFrames = pngFrames.filter(pf => 
    unlockedFrames.includes(pf.name) || 
    unlockedFrames.includes(pf.id) || 
    unlockedFrameUrls.includes(pf.imageUrl) ||
    true // Let user preview PNG frames available
  );

  const handleEquipStyledFrame = (frameName: string) => {
    playClickSound();
    setEquippedFrame(frameName);
    setEquippedFrameUrl(undefined); // Reset PNG frame URL when choosing CSS frame
  };

  const handleEquipPngFrame = (frame: PngFrameItem) => {
    playClickSound();
    setEquippedFrame(frame.name);
    setEquippedFrameUrl(frame.imageUrl);
  };

  const handleEquipBanner = (bannerUrl?: string) => {
    playClickSound();
    setEquippedBannerUrl(bannerUrl);
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = () => {
    playClickSound();
    const updated: UserProfile = {
      ...user,
      name,
      photoUrl,
      title,
      equippedFrame,
      equippedFrameUrl,
      equippedBannerUrl,
      equippedBannerPositionY,
      equippedBannerPositionX,
      equippedShowcaseSkinUrl
    };

    onUpdateUser(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Find style or URL for active preview frame
  const currentPreset = PRESET_STYLED_FRAMES.find(f => f.name === equippedFrame);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
      >
        {/* Header Banner Preview */}
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 p-6 text-slate-950 relative overflow-hidden flex-shrink-0 transition-all duration-300">
          {equippedBannerUrl ? (
            <>
              <img
                src={equippedBannerUrl || null}
                alt="Banner do Perfil"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-all duration-150"
                style={{ objectPosition: `${equippedBannerPositionX}% ${equippedBannerPositionY}%` }}
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/25 pointer-events-none" />
            </>
          ) : (
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          )}

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/40 hover:bg-slate-950/80 text-white transition cursor-pointer z-30"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 relative z-10">
            {/* Avatar Preview with Equipped Frame */}
            <div className="relative group">
              <div className={`w-20 h-20 rounded-full overflow-hidden bg-slate-950 flex items-center justify-center relative shadow-2xl ${
                !equippedFrameUrl && currentPreset ? currentPreset.style : 'border-2 border-orange-400'
              }`}>
                <img
                  src={photoUrl || null}
                  alt={name}
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* PNG Frame Overlay */}
              {equippedFrameUrl && (
                <img
                  src={equippedFrameUrl || null}
                  alt={equippedFrame}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] max-w-none pointer-events-none object-contain z-10 drop-shadow-lg"
                />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded bg-slate-950/40 text-amber-300 border border-amber-300/30">
                  {title}
                </span>
                <span className="text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded bg-slate-950/40 text-slate-100">
                  @{user.username}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight mt-1">{name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-amber-300 font-bold flex items-center gap-1 bg-slate-950/60 px-2.5 py-0.5 rounded border border-amber-500/40">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Banner e Moldura Ativos
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="bg-slate-950/80 p-3 border-b border-slate-800 flex items-center gap-2 px-6 flex-shrink-0 overflow-x-auto">
          <button
            onClick={() => {
              playClickSound();
              setActiveTab('banners');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-extrabold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer flex-shrink-0 ${
              activeTab === 'banners'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-amber-400" />
            {t('Banners do Perfil', 'Profile Banners')} ({allBanners.length})
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActiveTab('showcase');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-extrabold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer flex-shrink-0 ${
              activeTab === 'showcase'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            {t('Skin de Destaque', 'Showcase Skin')}
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActiveTab('frames');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-extrabold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer flex-shrink-0 ${
              activeTab === 'frames'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-400" />
            {t('Alterar Moldura', 'Change Frame')} ({unlockedFrames.length + unlockedFrameUrls.length})
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActiveTab('profile');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-extrabold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer flex-shrink-0 ${
              activeTab === 'profile'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4 text-orange-400" />
            {t('Editar Perfil & Título', 'Edit Profile & Title')}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'banners' && (
            <div className="space-y-6">
              {/* Banner Info */}
              <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <ImageIcon className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-amber-300 font-extrabold">
                      Banners de Perfil (Fundo do Card)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Banners ficam posicionados ao fundo do card do perfil, atrás das informações e foto. Conclua missões ou eventos para desbloquear novos banners!
                    </p>
                  </div>
                </div>
              </div>

              {/* Banner Position Adjustment Section (Visible when an image banner is equipped) */}
              {equippedBannerUrl && (
                <div className="bg-slate-950/90 border border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl relative overflow-hidden">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <Move className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-mono uppercase font-black text-amber-300 tracking-wider">
                          Ajustar Posição do Banner
                        </h4>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Desloque a imagem para enquadrar rostos ou elementos importantes do seu banner.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setEquippedBannerPositionY(50);
                        setEquippedBannerPositionX(50);
                      }}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-bold uppercase rounded-lg border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Resetar (50%)
                    </button>
                  </div>

                  {/* Controls Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Vertical Y Slider */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className="text-amber-300 flex items-center gap-1.5">
                          <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" /> Vertical (Subir / Descer)
                        </span>
                        <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono text-[11px]">
                          {equippedBannerPositionY}%
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-500 font-bold">Topo (0%)</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={equippedBannerPositionY}
                          onChange={(e) => setEquippedBannerPositionY(Number(e.target.value))}
                          className="flex-1 accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                        />
                        <span className="text-[10px] font-mono text-slate-500 font-bold">Base (100%)</span>
                      </div>

                      {/* Presets & Fine Adjustment Buttons for Vertical */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {[
                          { label: 'Topo', val: 0 },
                          { label: 'Alto', val: 25 },
                          { label: 'Centro', val: 50 },
                          { label: 'Baixo', val: 75 },
                          { label: 'Base', val: 100 },
                        ].map(btn => (
                          <button
                            key={btn.val}
                            type="button"
                            onClick={() => {
                              playClickSound();
                              setEquippedBannerPositionY(btn.val);
                            }}
                            className={`flex-1 py-1 rounded text-[9px] font-mono font-extrabold uppercase transition border cursor-pointer ${
                              equippedBannerPositionY === btn.val
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Horizontal X Slider */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className="text-amber-300 flex items-center gap-1.5">
                          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" /> Horizontal (Esquerda / Direita)
                        </span>
                        <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono text-[11px]">
                          {equippedBannerPositionX}%
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-500 font-bold">Esq. (0%)</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={equippedBannerPositionX}
                          onChange={(e) => setEquippedBannerPositionX(Number(e.target.value))}
                          className="flex-1 accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
                        />
                        <span className="text-[10px] font-mono text-slate-500 font-bold">Dir. (100%)</span>
                      </div>

                      {/* Presets for Horizontal */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {[
                          { label: 'Esquerda', val: 0 },
                          { label: 'Centro', val: 50 },
                          { label: 'Direita', val: 100 },
                        ].map(btn => (
                          <button
                            key={btn.val}
                            type="button"
                            onClick={() => {
                              playClickSound();
                              setEquippedBannerPositionX(btn.val);
                            }}
                            className={`flex-1 py-1 rounded text-[9px] font-mono font-extrabold uppercase transition border cursor-pointer ${
                              equippedBannerPositionX === btn.val
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Banners Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {allBanners.map((banner, bIdx) => {
                  const isEquipped = equippedBannerUrl === banner.url;
                  return (
                    <div
                      key={bIdx}
                      onClick={() => handleEquipBanner(banner.url)}
                      className={`rounded-2xl border transition cursor-pointer overflow-hidden relative flex flex-col group ${
                        isEquipped
                          ? 'bg-slate-950 border-amber-500 shadow-xl shadow-amber-950/40 ring-1 ring-amber-500'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      {/* Banner Preview Area */}
                      <div className="h-28 w-full relative bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 overflow-hidden flex items-center justify-center">
                        {banner.url ? (
                          <img
                            src={banner.url || null}
                            alt={banner.name}
                            className="w-full h-full object-cover transition-all duration-150"
                            style={isEquipped ? { objectPosition: `${equippedBannerPositionX}% ${equippedBannerPositionY}%` } : { objectPosition: '50% 50%' }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="text-center p-2 text-slate-950 font-black text-xs uppercase tracking-widest">
                            Gradiente Padrão
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />

                        {isEquipped && (
                          <span className="absolute top-2 right-2 text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-slate-950 flex items-center gap-1 shadow-lg z-10">
                            <Check className="w-3 h-3 stroke-[3]" /> Banner Equipado
                          </span>
                        )}

                        <span className="absolute bottom-2 left-2 text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded bg-slate-950/80 text-amber-300 border border-amber-500/30">
                          {banner.badge}
                        </span>
                      </div>

                      {/* Banner Info footer */}
                      <div className="p-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 font-mono truncate">{banner.name}</span>
                        <button
                          type="button"
                          className={`text-[10px] font-mono font-bold uppercase px-3 py-1 rounded-lg transition ${
                            isEquipped
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 group-hover:bg-amber-500/20 group-hover:text-amber-300'
                          }`}
                        >
                          {isEquipped ? 'Equipado' : 'Equipar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>


            </div>
          )}

          {activeTab === 'frames' && (
            <div className="space-y-6">
              {/* Exclusivity Information Banner */}
              <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-amber-300 font-extrabold">
                      Molduras Exclusivas Shinobi
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Molduras raras e PNG são obtidas exclusivamente em Eventos ou comprando na Loja.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-extrabold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    Molduras PNG Exclusivas (Eventos & Loja)
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">Transparência PNG em camada sobre a foto</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {allPngFrames.map(frame => {
                    const isEquipped = equippedFrameUrl === frame.imageUrl;
                    return (
                      <div
                        key={frame.id}
                        onClick={() => handleEquipPngFrame(frame)}
                        className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col items-center text-center gap-2 relative group ${
                          isEquipped
                            ? 'bg-slate-950 border-amber-500 shadow-lg shadow-amber-950/40 ring-1 ring-amber-500'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                        }`}
                      >
                        {isEquipped && (
                          <span className="absolute top-2 right-2 text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-slate-950 flex items-center gap-1 shadow">
                            <Check className="w-3 h-3 stroke-[3]" /> Ativa
                          </span>
                        )}

                        <div className="relative w-16 h-16 my-1">
                          {/* Sample user photo underneath */}
                          <img
                            src={photoUrl || null}
                            alt="Preview"
                            className="w-full h-full rounded-full object-cover"
                          />
                          {/* PNG Frame overlay */}
                          <img
                            src={frame.imageUrl || null}
                            alt={frame.name}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain"
                          />
                        </div>

                        <div>
                          <p className="font-extrabold text-xs text-slate-200 group-hover:text-amber-300 transition line-clamp-1">{frame.name}</p>
                          <span className="text-[9px] font-mono text-orange-400 uppercase font-bold block mt-0.5">
                            {frame.badge || 'MOLDURA PNG'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-6">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-extrabold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Molduras Estilizadas do Sistema (CSS)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {PRESET_STYLED_FRAMES.map(frame => {
                    const isEquipped = !equippedFrameUrl && equippedFrame === frame.name;
                    return (
                      <div
                        key={frame.name}
                        onClick={() => handleEquipStyledFrame(frame.name)}
                        className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between gap-3 relative group ${
                          isEquipped
                            ? 'bg-slate-950 border-amber-500 shadow-lg shadow-amber-950/40 ring-1 ring-amber-500'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full overflow-hidden bg-slate-900 flex-shrink-0 ${frame.style}`}>
                            <img src={photoUrl || null} alt="Preview" className="w-full h-full object-cover rounded-full" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold text-xs text-slate-200 truncate group-hover:text-amber-300">{frame.name}</p>
                            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">{frame.badge}</span>
                          </div>

                          {isEquipped && (
                            <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'showcase' && (
            <div className="space-y-6">
              {/* Info Header */}
              <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-amber-300 font-extrabold">
                      {t('Skin de Destaque no Card do Perfil', 'Showcase Skin for Profile Card')}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {t(
                        'Escolha qual das suas skins ou artes de personagem vai ilustrar o lado direito do seu card de perfil para todos os jogadores!',
                        'Select which of your unlocked skins or character artworks will feature on the right side of your profile card!'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Showcase Skin Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {/* Option: Sem Skin (Invisible Default) */}
                {(() => {
                  const isSelected = !equippedShowcaseSkinUrl || equippedShowcaseSkinUrl === '' || equippedShowcaseSkinUrl === 'none';

                  return (
                    <div
                      key="no-skin-default"
                      onClick={() => {
                        playClickSound();
                        setEquippedShowcaseSkinUrl('');
                      }}
                      className={`relative bg-slate-950/90 border-2 rounded-2xl p-3 flex flex-col items-center text-center gap-2 cursor-pointer transition-all hover:scale-105 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                          : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-amber-400 text-slate-950 p-1 rounded-full text-[10px] font-black z-20 shadow">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                      <div className="w-20 h-24 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center gap-1 relative text-slate-600">
                        <User className="w-8 h-8 opacity-40" />
                        <span className="text-[9px] font-mono font-bold uppercase text-slate-500">{t('Vazio', 'Empty')}</span>
                      </div>
                      <div className="min-w-0 w-full">
                        <span className="text-xs font-black text-white block truncate">{t('Sem Skin', 'No Skin')}</span>
                        <span className="text-[10px] text-amber-300/80 font-mono block">{t('Padrão', 'Default')}</span>
                      </div>
                      <button
                        className={`w-full py-1.5 rounded-lg text-[10px] font-mono font-black uppercase transition ${
                          isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {isSelected ? t('Equipado', 'Equipped') : t('Equipar', 'Equip')}
                      </button>
                    </div>
                  );
                })()}

                {/* Skins from all characters */}
                {allCharacters.flatMap(char => {
                  const skinItems: Array<{ id: string; name: string; charName: string; imageUrl: string }> = [];

                  if (char.skins && char.skins.length > 0) {
                    char.skins.forEach(s => {
                      if (s.image && !skinItems.some(item => item.imageUrl === s.image)) {
                        skinItems.push({
                          id: s.id,
                          name: s.name,
                          charName: char.name,
                          imageUrl: s.image
                        });
                      }
                    });
                  }

                  return skinItems;
                }).map(item => {
                  const isSelected = equippedShowcaseSkinUrl === item.imageUrl;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        playClickSound();
                        setEquippedShowcaseSkinUrl(item.imageUrl);
                      }}
                      className={`relative bg-slate-950/90 border-2 rounded-2xl p-3 flex flex-col items-center text-center gap-2 cursor-pointer transition-all hover:scale-105 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                          : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-amber-400 text-slate-950 p-1 rounded-full text-[10px] font-black z-20 shadow">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                      <div className="w-20 h-24 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden relative">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-contain filter drop-shadow"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="min-w-0 w-full">
                        <span className="text-xs font-black text-white block truncate">{item.charName}</span>
                        <span className="text-[10px] text-amber-300 font-mono block truncate">{item.name}</span>
                      </div>
                      <button
                        className={`w-full py-1.5 rounded-lg text-[10px] font-mono font-black uppercase transition ${
                          isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {isSelected ? t('Equipado', 'Equipped') : t('Equipar', 'Equip')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div>
                <label className="block text-xs font-mono uppercase font-bold text-slate-400 mb-1">Nome do Shinobi</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-sm outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase font-bold text-slate-400 mb-1">Título Shinobi Equipado</label>
                <select
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-sm outline-none"
                >
                  {unlockedTitles.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase font-bold text-slate-400 mb-1">URL da Foto de Perfil</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={photoUrl}
                    onChange={e => setPhotoUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                  />
                  <label className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1 cursor-pointer flex-shrink-0">
                    <Upload className="w-4 h-4" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" onChange={handleCustomImageUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
          <span className="text-xs font-mono text-slate-400">
            {saveSuccess ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Check className="w-4 h-4" /> Perfil e Moldura atualizados com sucesso!
              </span>
            ) : (
              'Altere e clique em Salvar para aplicar as mudanças'
            )}
          </span>

          <button
            onClick={handleSaveProfile}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Salvar Alterações
          </button>
        </div>
      </motion.div>
    </div>
  );
}
