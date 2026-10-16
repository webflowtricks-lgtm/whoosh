/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Images, Lock, Star, ShoppingBag, Check } from 'lucide-react';
import { UserProfile, NinjaCard, CardRarity } from '../types';
import { getCards, fetchCardsFromServer, CARD_RARITY_META, RARITY_ORDER, rarityFx } from '../lib/cardStorage';
import { useCollection } from '../lib/collection';
import { useLanguage } from '../lib/i18n';

interface CardGalleryModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser?: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
  onOpenShopPacks: () => void;
}

function cardImage(card: NinjaCard): string {
  if (card.imageUrl) return card.imageUrl;
  return `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${card.slug}/icon.jpg`;
}

export default function CardGalleryModal({ user, onClose, playClickSound, onOpenShopPacks }: CardGalleryModalProps) {
  const { t } = useLanguage();
  const [cards, setCards] = useState<NinjaCard[]>(() => getCards());
  const [rarityFilter, setRarityFilter] = useState<CardRarity | 'todas'>('todas');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selectedCard, setSelectedCard] = useState<NinjaCard | null>(null);

  const { owned } = useCollection(user, undefined, cards);
  const gems = user.gems ?? 0;

  useEffect(() => {
    fetchCardsFromServer().then(setCards);
  }, []);

  const filtered = cards.filter(card => {
    if (rarityFilter !== 'todas' && card.rarity !== rarityFilter) return false;
    if (ownedOnly && !owned.has(card.id)) return false;
    return true;
  });

  const ownedCount = cards.filter(c => owned.has(c.id)).length;
  const totalCount = cards.length;
  const completionPct = totalCount === 0 ? 0 : Math.round((ownedCount / totalCount) * 100);
  const cardNumber = (id: string) => (cards.findIndex(card => card.id === id) + 1).toString().padStart(3, '0');

  const byRarity = RARITY_ORDER.map(r => {
    const total = cards.filter(c => c.rarity === r).length;
    const collect = cards.filter(c => c.rarity === r && owned.has(c.id)).length;
    return { rarity: r, total, owned: collect };
  });

  return (
    <div className="fixed inset-0 bg-slate-950/55 z-50 flex items-center justify-center backdrop-blur-md p-3 sm:p-6 select-none gpu-accelerated" data-no-uah>
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-5xl h-[88vh] max-h-[800px] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800"
      >
        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold font-display uppercase tracking-wider text-slate-900 flex items-center gap-2">
                {t('Ninja Cards', 'Ninja Cards')}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { playClickSound(); onOpenShopPacks(); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition cursor-pointer border bg-blue-600 hover:bg-blue-700 border-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-95"
              title={t('Ver pacotes na loja', 'View packs in the shop')}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{t('Pacotes', 'Packs')}</span>
            </button>
          </div>
        </div>

        {/* Collection Overview */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{t('Coleção', 'Collection')}</span>
              <span className="text-lg font-black text-slate-900 font-mono">{ownedCount}<span className="text-slate-400 text-sm font-semibold">/{totalCount}</span></span>
            </div>
            <div className="flex-1 min-w-[120px]">
              <div className="h-2.5 w-full bg-white rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-amber-400 transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <div className="text-[9px] font-mono text-slate-500 mt-1">{completionPct}% {t('concluída', 'complete')}</div>
            </div>
            <div className="flex items-center gap-1 text-cyan-700 text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200">
              <img src="/static/img/icon/ryo.webp" alt="" className="h-4 w-4 object-contain" />
              {gems}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-3 overflow-x-auto flex-wrap">
          <button
            onClick={() => { playClickSound(); setRarityFilter('todas'); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${
              rarityFilter === 'todas'
                ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <span>
              {t('Todas', 'All')}
            </span>
            <span className={`text-[10px] font-mono font-bold ${rarityFilter === 'todas' ? 'text-blue-300' : 'text-blue-600'}`}>
              {ownedCount}/{totalCount}
            </span>
          </button>
          {byRarity.map(({ rarity, total, owned: rarityOwned }) => {
            const meta = CARD_RARITY_META[rarity];
            const isActive = rarityFilter === rarity;
            const rarityFilterColors: Record<CardRarity, string> = {
              comum: isActive ? 'bg-slate-600 border-slate-600 text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200',
              raro: isActive ? 'bg-sky-600 border-sky-600 text-white' : 'bg-sky-100 border-sky-300 text-sky-800 hover:bg-sky-200',
              epico: isActive ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800 hover:bg-fuchsia-200',
              lendario: isActive ? 'bg-amber-500 border-amber-500 text-white' : 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200',
              secreto: isActive ? 'bg-red-600 border-red-600 text-white' : 'bg-red-100 border-red-300 text-red-800 hover:bg-red-200',
            };
            return (
              <button
                key={rarity}
                onClick={() => { playClickSound(); setRarityFilter(rarity); }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${rarityFilterColors[rarity]}`}
              >
                <span className="flex items-center gap-1.5">
                  {meta.label}
                  {isActive && <Check className="w-3 h-3" />}
                </span>
                <span className={`text-[10px] font-mono font-bold ${isActive ? 'text-blue-300' : 'text-blue-600'}`}>
                  {rarityOwned}/{total}
                </span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { playClickSound(); setOwnedOnly(v => !v); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap border flex items-center gap-1.5 ${
                ownedOnly
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-600/25'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Star className="w-3 h-3" />
              {t('Somente obtidas', 'Owned only')}
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-sm">
              <Images className="w-12 h-12 text-slate-300 mb-3" />
              <p>{t('Nenhuma figura nesse filtro.', 'No figures match this filter.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map(card => {
                const isOwned = owned.has(card.id);
                const meta = CARD_RARITY_META[card.rarity];
                const fx = isOwned ? rarityFx(card.rarity) : null;
                return (
                  <div
                    key={card.id}
                    onClick={() => { playClickSound(); setSelectedCard(card); }}
                    className={`relative aspect-[3/4] rounded-2xl border-2 overflow-hidden cursor-pointer shadow-lg transition-transform hover:scale-[1.03] group ${
                      isOwned
                        ? `${meta.border} ${meta.glow} shadow-xl bg-slate-900 ${fx?.frame || ''}`
                        : 'border-slate-800 bg-slate-950/80'
                    }`}
                  >
                    {/* Art / silhouette */}
                    <div className="absolute inset-0">
                      {isOwned ? (
                        <img
                          src={cardImage(card)}
                          alt={card.characterName}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900">
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                            <Lock className="w-7 h-7 text-slate-700" />
                          </div>
                        </div>
                      )}
                      {fx && <span className={fx.sweep} />}
                      {/* rarity gradient overlay */}
                      <div className={`absolute inset-0 bg-gradient-to-t ${isOwned ? 'from-slate-950/90 via-transparent to-transparent' : 'from-slate-950/90 via-slate-950/40 to-slate-950/70'}`} />
                    </div>

                    {/* Rarity badge */}
                    <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase tracking-wider border ${meta.chip}`}>
                      ◆ {meta.label}
                    </div>
                    {!isOwned && (
                      <div className="absolute top-1.5 right-1.5 text-[9px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-800">
                        Fig.
                      </div>
                    )}

                    {/* Bottom info */}
                    <div className="absolute bottom-0 inset-x-0 p-2 space-y-0.5">
                      <p className={`text-[11px] font-extrabold leading-tight line-clamp-1 ${isOwned ? 'text-white' : 'text-slate-500'}`}>
                        {isOwned ? card.characterName : '???'}
                      </p>
                      {isOwned ? (
                        <p className={`text-[8px] font-mono font-bold uppercase tracking-wider ${meta.text}`}>
                          #{cardNumber(card.id)}
                        </p>
                      ) : (
                        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">{t('Não coletada', 'Not collected')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Modal (card flip) */}
        <AnimatePresence>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="fixed bottom-4 left-4 z-[55] rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-xl transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('Fechar álbum', 'Close album')}
            title={t('Fechar', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
          {selectedCard && (
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-30"
              onClick={() => setSelectedCard(null)}
            >
              <motion.div
                initial={false}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 15 }}
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-xs aspect-[3/4] rounded-3xl border-2 overflow-hidden shadow-2xl ${CARD_RARITY_META[selectedCard.rarity].border} ${CARD_RARITY_META[selectedCard.rarity].glow}`}
              >
                {owned.has(selectedCard.id) ? (
                  <>
                    <img
                      src={cardImage(selectedCard)}
                      alt={selectedCard.characterName}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/20" />
                    <div className={`absolute top-3 left-3 px-2 py-1 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider border ${CARD_RARITY_META[selectedCard.rarity].chip}`}>
                      ◆ {CARD_RARITY_META[selectedCard.rarity].label}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 p-4 space-y-2">
                      <p className={`text-xs font-mono font-bold uppercase tracking-wider ${CARD_RARITY_META[selectedCard.rarity].text}`}>
                        #{cardNumber(selectedCard.id)}
                      </p>
                      <h3 className="text-xl font-black text-white leading-tight">{selectedCard.characterName}</h3>
                      {selectedCard.variant && (
                        <span className="inline-block text-[9px] font-mono font-bold text-slate-300 bg-slate-950/70 border border-slate-700 px-2 py-0.5 rounded-full">
                          {selectedCard.variant}
                        </span>
                      )}
                      <p className="text-[11px] text-slate-300 leading-snug">{selectedCard.description}</p>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center">
                    <Lock className="w-10 h-10 text-slate-600" />
                    <p className="text-slate-400 font-mono text-sm">{t('Figura não coletada', 'Figure not collected')}</p>
                    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${CARD_RARITY_META[selectedCard.rarity].chip}`}>
                      ◆ {CARD_RARITY_META[selectedCard.rarity].label}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setSelectedCard(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-slate-200 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
