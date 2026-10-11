/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, ShoppingCart, Sparkles, Check, Award, Shield, CircleDollarSign, UserCheck, Shirt } from 'lucide-react';
import { UserProfile, ShopItem } from '../types';
import { getShopItems, fetchShopItemsFromServer } from '../lib/shopStorage';

interface ShopModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
  playScrollSound: () => void;
}

export default function ShopModal({ user, onClose, onUpdateUser, playClickSound, playScrollSound }: ShopModalProps) {
  const [items, setItems] = useState<ShopItem[]>(() => getShopItems());
  const [activeTab, setActiveTab] = useState<'all' | 'skin' | 'title' | 'frame' | 'bundle'>('all');
  const [purchaseToast, setPurchaseToast] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<ShopItem | null>(null);

  useEffect(() => {
    fetchShopItemsFromServer().then(setItems);
  }, []);

  const ryos = user.ryos ?? 1500;
  const gems = user.gems ?? 120;
  const unlockedFrames = user.unlockedFrames || ['Padrão'];
  const unlockedTitles = user.unlockedTitles || ['Estudante'];
  const unlockedSkins = user.unlockedSkins || [];
  const equippedFrame = user.equippedFrame || 'Padrão';
  const currentTitle = user.title || unlockedTitles[0] || 'Estudante';

  const filteredItems = items.filter(item => activeTab === 'all' || item.category === activeTab);

  const handleBuyOrEquip = (item: ShopItem) => {
    playClickSound();

    if (item.category === 'skin') {
      const isUnlocked = unlockedSkins.includes(item.name) || unlockedSkins.includes(item.id);
      if (isUnlocked) {
        setPurchaseToast(`Skin "${item.name}" já está desbloqueada!`);
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      if (item.currency === 'ryos' && ryos < item.price) {
        setPurchaseToast('Ryos insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Gemas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      const newRyos = item.currency === 'ryos' ? ryos - item.price : ryos;
      const newGems = item.currency === 'gems' ? gems - item.price : gems;
      const newSkins = [...unlockedSkins, item.name];

      onUpdateUser({
        ...user,
        ryos: newRyos,
        gems: newGems,
        unlockedSkins: newSkins
      });

      setPurchaseToast(`Skin "${item.name}" adquirida com sucesso!`);
      setTimeout(() => setPurchaseToast(null), 3000);
      return;
    }

    if (item.category === 'frame') {
      const isUnlocked = unlockedFrames.includes(item.name);
      if (isUnlocked) {
        onUpdateUser({
          ...user,
          equippedFrame: item.name
        });
        setPurchaseToast(`Moldura "${item.name}" equipada!`);
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      if (item.currency === 'ryos' && ryos < item.price) {
        setPurchaseToast('Ryos insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Gemas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      const newRyos = item.currency === 'ryos' ? ryos - item.price : ryos;
      const newGems = item.currency === 'gems' ? gems - item.price : gems;
      const newFrames = [...unlockedFrames, item.name];

      onUpdateUser({
        ...user,
        ryos: newRyos,
        gems: newGems,
        unlockedFrames: newFrames,
        equippedFrame: item.name
      });

      setPurchaseToast(`Moldura "${item.name}" adquirida e equipada!`);
      setTimeout(() => setPurchaseToast(null), 3000);
    } else if (item.category === 'title') {
      const isUnlocked = unlockedTitles.includes(item.name);
      if (isUnlocked) {
        onUpdateUser({
          ...user,
          title: item.name
        });
        setPurchaseToast(`Título "${item.name}" equipado!`);
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      if (item.currency === 'ryos' && ryos < item.price) {
        setPurchaseToast('Ryos insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Gemas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      const newRyos = item.currency === 'ryos' ? ryos - item.price : ryos;
      const newGems = item.currency === 'gems' ? gems - item.price : gems;
      const newTitles = [...unlockedTitles, item.name];

      onUpdateUser({
        ...user,
        ryos: newRyos,
        gems: newGems,
        unlockedTitles: newTitles,
        title: item.name
      });

      setPurchaseToast(`Título "${item.name}" adquirido e equipado!`);
      setTimeout(() => setPurchaseToast(null), 3000);
    } else if (item.category === 'bundle' && item.bundleGrant) {
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Gemas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      const newGems = gems - item.price;
      const newRyos = ryos + item.bundleGrant.amount;

      onUpdateUser({
        ...user,
        ryos: newRyos,
        gems: newGems
      });

      setPurchaseToast(`Comprado com sucesso: +${item.bundleGrant.amount} Ryos!`);
      setTimeout(() => setPurchaseToast(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center backdrop-blur-md p-3 sm:p-6 select-none gpu-accelerated">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-5xl h-[88vh] max-h-[800px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Top Header Bar with Currencies */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold font-display uppercase tracking-wider text-slate-100 flex items-center gap-2">
                Loja Shinobi
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  SHOP
                </span>
              </h2>
              <p className="text-xs text-slate-400">Adquira molduras de perfil, títulos honrosos e pacotes de moedas!</p>
            </div>
          </div>

          {/* User Balance Pills & Close */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 shadow-inner">
              <span className="text-xs font-mono text-amber-400 font-extrabold flex items-center gap-1.5">
                🪙 {ryos.toLocaleString()} <span className="text-[10px] text-slate-400">Ryos</span>
              </span>
              <div className="h-4 w-px bg-slate-800" />
              <span className="text-xs font-mono text-cyan-400 font-extrabold flex items-center gap-1.5">
                💎 {gems.toLocaleString()} <span className="text-[10px] text-slate-400">Gemas</span>
              </span>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onClose();
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Purchase Toast */}
        <AnimatePresence>
          {purchaseToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xl border border-amber-400/40 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span>{purchaseToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Categories Tab Navigation */}
        <div className="p-3 border-b border-slate-800/80 flex items-center gap-3 overflow-x-auto">
          {[
            { id: 'all', label: 'Todos os Itens', icon: ShoppingBag },
            { id: 'title', label: 'Títulos', icon: Award },
            { id: 'skin', label: 'Skins', icon: Shirt },
            { id: 'frame', label: 'Molduras de Perfil', icon: Shield },
            { id: 'bundle', label: 'Pacotes & Moedas', icon: CircleDollarSign }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  playScrollSound();
                  setActiveTab(tab.id as any);
                }}
                data-sound="Scroll"
                className={`relative px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'text-amber-950 brightness-110'
                    : 'text-stone-800 opacity-70 hover:opacity-100'
                }`}
              >
                <img src="/static/img/ui/tab-wood.webp" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
                <span className="relative z-10 font-brush text-[13px] tracking-wider flex items-center gap-2 drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)]">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Shop Items Grid */}
        <div className="flex-1 p-2.5 sm:p-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {filteredItems.map(item => {
              const isUnlockedFrame = item.category === 'frame' && unlockedFrames.includes(item.name);
              const isUnlockedTitle = item.category === 'title' && unlockedTitles.includes(item.name);
              const isUnlockedSkin = item.category === 'skin' && (unlockedSkins.includes(item.name) || unlockedSkins.includes(item.id));
              const isEquippedFrame = item.category === 'frame' && equippedFrame === item.name;
              const isEquippedTitle = item.category === 'title' && currentTitle === item.name;
              const isOwned = isUnlockedFrame || isUnlockedTitle || isUnlockedSkin;
              const isEquipped = isEquippedFrame || isEquippedTitle;

              return (
                <div
                  key={item.id}
                  className="relative min-w-0 rounded-xl border border-slate-800 bg-slate-900/80 p-1.5 shadow-xl transition-colors hover:border-slate-700 hover:bg-slate-900 sm:rounded-2xl sm:p-3"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/80 sm:rounded-xl">
                    {item.badge && (
                      <span className="absolute left-1 top-1 z-10 max-w-[80%] truncate rounded bg-slate-950/80 px-1 py-0.5 text-[7px] font-mono font-bold uppercase text-orange-300 sm:text-[9px]">
                        {item.badge}
                      </span>
                    )}
                    <div className="flex h-full items-center justify-center p-1.5 sm:p-3">
                      {item.category === 'skin' && (
                        <div className="relative flex h-full w-full items-center justify-center">
                          {item.skinImageUrl ? (
                            <img
                              src={item.skinImageUrl || null}
                              alt={item.name}
                              className="h-full w-full rounded-lg object-cover"
                            />
                          ) : (
                            <Shirt className="h-8 w-8 text-orange-400 sm:h-10 sm:w-10" />
                          )}
                          {item.characterName && (
                            <span className="absolute bottom-0.5 left-0.5 max-w-full truncate rounded border border-slate-800 bg-slate-950/80 px-1 py-0.5 font-mono text-[7px] font-bold text-orange-300 sm:bottom-1 sm:left-1 sm:px-1.5 sm:text-[9px]">
                              {item.characterName}
                            </span>
                          )}
                        </div>
                      )}

                      {item.category === 'frame' && (
                        <div className={`relative h-12 w-12 rounded-full p-1 sm:h-16 sm:w-16 ${item.frameStyle || 'border-2 border-orange-500'}`}>
                          {item.frameImageUrl ? (
                            <img
                              src={item.frameImageUrl}
                              alt={item.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <img
                              src={user.photoUrl || null}
                              alt={user.name}
                              className="h-full w-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      )}

                      {item.category === 'title' && (
                        <div className="space-y-1 text-center">
                          {item.icon ? (
                            <img src={item.icon} alt="" className="mx-auto h-10 w-10 object-contain sm:h-12 sm:w-12" />
                          ) : (
                            <Award className="mx-auto h-7 w-7 text-amber-400 sm:h-8 sm:w-8" />
                          )}
                          <p className="line-clamp-2 rounded border border-amber-500/20 bg-amber-500/10 px-1 py-0.5 text-[8px] font-mono font-black uppercase tracking-wider text-amber-300 sm:px-2 sm:py-1 sm:text-xs">
                            {item.name}
                          </p>
                        </div>
                      )}

                      {item.category === 'bundle' && (
                        <div className="space-y-1 text-center">
                          {item.icon ? (
                            <img src={item.icon} alt="" className="mx-auto h-10 w-10 object-contain sm:h-12 sm:w-12" />
                          ) : (
                            <CircleDollarSign className="mx-auto h-8 w-8 text-cyan-400 sm:h-10 sm:w-10" />
                          )}
                          <p className="text-[8px] font-mono font-bold text-cyan-300 sm:text-xs">
                            +{item.bundleGrant?.amount} Ryos
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 min-w-0">
                    <h3 className="truncate text-[9px] font-extrabold tracking-tight text-slate-100 sm:text-sm" title={item.name}>
                      {item.name}
                    </h3>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-slate-800/80 pt-1.5 sm:mt-2 sm:pt-2">
                    <span className="flex min-w-0 items-center gap-0.5 whitespace-nowrap text-[8px] font-mono font-bold text-amber-300 sm:gap-1 sm:text-xs">
                      <span aria-hidden="true">{item.currency === 'ryos' ? '🪙' : '💎'}</span>
                      <span className="truncate">{item.price.toLocaleString()}</span>
                    </span>
                    {isEquipped ? (
                      <span className="p-1 text-emerald-400" title="Equipado" aria-label="Equipado">
                        <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </span>
                    ) : isOwned ? (
                      <button
                        onClick={() => handleBuyOrEquip(item)}
                        aria-label={`Equipar ${item.name}`}
                        title="Equipar"
                        className="rounded-lg border border-slate-600 bg-slate-800 p-1 text-slate-200 transition hover:bg-slate-700"
                      >
                        <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          playClickSound();
                          setPendingPurchase(item);
                        }}
                        aria-label={`Comprar ${item.name}`}
                        title="Comprar"
                        className="rounded-lg border border-amber-400/50 bg-gradient-to-br from-amber-500 to-orange-600 p-1 text-slate-950 shadow-md shadow-orange-600/20 transition hover:from-amber-400 hover:to-orange-500 active:scale-95"
                      >
                        <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {pendingPurchase && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
          onClick={() => setPendingPurchase(null)}
        >
          <div
            className="relative aspect-[865/1060] w-[min(92vw,465px,67vh)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-purchase-title"
            onClick={event => event.stopPropagation()}
          >
            <img
              src="/static/img/ui/shop_confirm.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />
            <div className="absolute inset-x-[12%] bottom-[9%] top-[42%] flex flex-col items-center justify-center gap-3 text-center sm:gap-4">
              <p className="text-base font-bold leading-snug text-amber-950 sm:text-lg">
                Você tem certeza que
                <br />
                deseja gastar{' '}
                <span className="whitespace-nowrap font-black text-orange-700">
                  {pendingPurchase.price.toLocaleString()} {pendingPurchase.currency === 'ryos' ? '🪙' : '💎'}
                </span>
                {' '}em
              </p>
              <h3 id="shop-purchase-title" className="max-w-full break-words text-2xl font-black leading-tight text-orange-700 drop-shadow-sm sm:text-3xl">
                {pendingPurchase.name}?
              </h3>
              <div className="mt-1 flex w-full justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setPendingPurchase(null);
                  }}
                  className="rounded-lg border border-red-900/60 bg-red-800/90 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-md transition hover:bg-red-700 sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleBuyOrEquip(pendingPurchase);
                    setPendingPurchase(null);
                  }}
                  className="rounded-lg border border-emerald-900/50 bg-emerald-700/95 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-md transition hover:bg-emerald-600 sm:text-sm"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
