/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Sparkles, Check, Lock, Award, Shield, CircleDollarSign, Gem, Star, Tag, UserCheck, Shirt } from 'lucide-react';
import { UserProfile, ShopItem } from '../types';
import { getShopItems, fetchShopItemsFromServer } from '../lib/shopStorage';

interface ShopModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
}

export default function ShopModal({ user, onClose, onUpdateUser, playClickSound }: ShopModalProps) {
  const [items, setItems] = useState<ShopItem[]>(() => getShopItems());
  const [activeTab, setActiveTab] = useState<'all' | 'skin' | 'title' | 'frame' | 'bundle'>('all');
  const [purchaseToast, setPurchaseToast] = useState<string | null>(null);

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
        <div className="bg-slate-950/60 p-3 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'all', label: 'Todos os Itens', icon: ShoppingBag },
            { id: 'title', label: 'Títulos Shinobi', icon: Award },
            { id: 'skin', label: 'Skins de Ninjas', icon: Shirt },
            { id: 'frame', label: 'Molduras de Perfil', icon: Shield },
            { id: 'bundle', label: 'Pacotes & Moedas', icon: CircleDollarSign }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  playClickSound();
                  setActiveTab(tab.id as any);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md shadow-orange-600/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Shop Items Grid */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                  className={`relative p-4 rounded-2xl border flex flex-col justify-between transition-all bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700 shadow-xl group`}
                >
                  <div className="space-y-3">
                    {/* Badge & Category */}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        {item.badge || item.category}
                      </span>
                      {isEquipped ? (
                        <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Equipado
                        </span>
                      ) : isOwned ? (
                        <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Adquirido
                        </span>
                      ) : null}
                    </div>

                    {/* Preview Graphic for Skins / Frames / Titles / Bundles */}
                    <div className="h-28 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-center p-3 relative overflow-hidden group-hover:border-slate-700 transition">
                      {item.category === 'skin' && (
                        <div className="relative w-full h-full flex items-center justify-center">
                          {item.skinImageUrl ? (
                            <img
                              src={item.skinImageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <Shirt className="w-10 h-10 text-orange-400" />
                          )}
                          {item.characterName && (
                            <span className="absolute bottom-1 left-1 bg-slate-950/80 text-orange-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-800">
                              {item.characterName}
                            </span>
                          )}
                        </div>
                      )}

                      {item.category === 'frame' && (
                        <div className="relative">
                          <div className={`w-16 h-16 rounded-full p-1 ${item.frameStyle || 'border-2 border-orange-500'}`}>
                            <img
                              src={user.photoUrl}
                              alt={user.name}
                              className="w-full h-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                      )}

                      {item.category === 'title' && (
                        <div className="text-center space-y-1">
                          <Award className="w-8 h-8 text-amber-400 mx-auto animate-pulse" />
                          <p className="text-xs font-mono font-black uppercase tracking-wider text-amber-300 px-3 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            "{item.name}"
                          </p>
                        </div>
                      )}

                      {item.category === 'bundle' && (
                        <div className="text-center space-y-1">
                          <CircleDollarSign className="w-10 h-10 text-cyan-400 mx-auto" />
                          <p className="text-xs font-mono font-bold text-cyan-300">
                            +{item.bundleGrant?.amount} Ryos
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-extrabold text-slate-100 tracking-tight">
                        {item.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-snug mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Buy / Equip Button Footer */}
                  <div className="pt-4 mt-3 border-t border-slate-800/80">
                    {isEquipped ? (
                      <button
                        disabled
                        className="w-full py-2 px-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-default"
                      >
                        <Check className="w-4 h-4" /> Equipado
                      </button>
                    ) : isOwned ? (
                      <button
                        onClick={() => handleBuyOrEquip(item)}
                        className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer active:scale-95"
                      >
                        Equipar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBuyOrEquip(item)}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-600/20 transition cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <span>Comprar por</span>
                        <span className="font-bold flex items-center gap-1">
                          {item.currency === 'ryos' ? '🪙' : '💎'} {item.price}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
