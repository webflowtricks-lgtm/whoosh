/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Images, Lock, Star, Package, Gem, Sparkles } from 'lucide-react';
import { UserProfile, NinjaCard, CardRarity } from '../types';
import { getCards, fetchCardsFromServer, CARD_RARITY_META, RARITY_ORDER, getPacks, fetchPacksFromServer, rarityFx } from '../lib/cardStorage';
import { NinjaPack } from '../types';
import { useCollection } from '../lib/collection';
import { useLanguage } from '../lib/i18n';

interface CardGalleryModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser?: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
}

function cardImage(card: NinjaCard): string {
  if (card.imageUrl) return card.imageUrl;
  return `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${card.slug}/icon.jpg`;
}

const PACK_COST = 20;

export default function CardGalleryModal({ user, onClose, onUpdateUser, playClickSound }: CardGalleryModalProps) {
  const { t } = useLanguage();
  const [cards, setCards] = useState<NinjaCard[]>(() => getCards());
  const [packs, setPacks] = useState<NinjaPack[]>(() => getPacks());
  const [selectedPackId, setSelectedPackId] = useState<string>(() => (getPacks()[0]?.id || ''));
  const [showPackPicker, setShowPackPicker] = useState(false);
  const [rarityFilter, setRarityFilter] = useState<CardRarity | 'todas'>('todas');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selectedCard, setSelectedCard] = useState<NinjaCard | null>(null);
  const [packToast, setPackToast] = useState<string | null>(null);

  const { owned, openPack } = useCollection(user, onUpdateUser, cards);
  const gems = user.gems ?? 0;

  useEffect(() => {
    fetchCardsFromServer().then(setCards);
    fetchPacksFromServer().then(loadedPacks => {
      setPacks(loadedPacks);
      if (!loadedPacks.some(p => p.id === selectedPackId)) {
        setSelectedPackId(loadedPacks[0]?.id || '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPack = packs.find(p => p.id === selectedPackId) || packs[0];

  const handleOpenPack = (pack: NinjaPack) => {
    playClickSound();
    if (gems < pack.price) {
      setPackToast(t('Gemas insuficientes!', 'Not enough gems!'));
      setTimeout(() => setPackToast(null), 3000);
      return;
    }
    if (!onUpdateUser) {
      setPackToast(t('Faça login para abrir pacotes.', 'Log in to open packs.'));
      setTimeout(() => setPackToast(null), 3000);
      return;
    }
    const result = openPack(cards, { count: pack.cardsPerPack, gemsCost: pack.price, pack });
    const labels = result.granted.map(c => `${CARD_RARITY_META[c.rarity].label} · ${c.characterName}`).join(' | ');
    setPackToast(labels ? t('Pacote aberto: ', 'Pack opened: ') + labels : t('Pacote aberto (sem novidades).', 'Pack opened (nothing new).'));
    setShowPackPicker(false);
    setTimeout(() => setPackToast(null), 5000);
  };

  const filtered = cards.filter(card => {
    if (rarityFilter !== 'todas' && card.rarity !== rarityFilter) return false;
    if (ownedOnly && !owned.has(card.id)) return false;
    return true;
  });

  const ownedCount = cards.filter(c => owned.has(c.id)).length;
  const totalCount = cards.length;
  const completionPct = totalCount === 0 ? 0 : Math.round((ownedCount / totalCount) * 100);
  const totalPoints = cards.reduce((acc, c) => acc + (owned.has(c.id) ? c.points : 0), 0);

  const byRarity = RARITY_ORDER.map(r => {
    const total = cards.filter(c => c.rarity === r).length;
    const collect = cards.filter(c => c.rarity === r && owned.has(c.id)).length;
    return { rarity: r, total, owned: collect };
  });

  return (
    <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center backdrop-blur-md p-3 sm:p-6 select-none gpu-accelerated">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-5xl h-[88vh] max-h-[800px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400">
              <Images className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold font-display uppercase tracking-wider text-slate-100 flex items-center gap-2">
                {t('Galeria Ninja Cards', 'Ninja Cards Gallery')}
                <span className="text-[10px] font-mono bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 px-2 py-0.5 rounded-full font-bold">
                  COLECIONÁVEIS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('Figuras estéticas de seus ninjas favoritos. Sem poder — apenas coleção.', 'Aesthetic figures of your favorite ninjas. No power — just collection.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pack button */}
            <div className="relative">
              <button
                onClick={() => { playClickSound(); setShowPackPicker(v => !v); }}
                disabled={!onUpdateUser}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition cursor-pointer border ${
                  !onUpdateUser
                    ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 border-fuchsia-400/50 text-white shadow-lg shadow-fuchsia-600/20 active:scale-95'
                }`}
                title={t('Abrir pacote de figuras', 'Open figure pack')}
              >
                <Package className="w-4 h-4" />
                <span>{t('Pacote', 'Pack')}</span>
                <span className="flex items-center gap-0.5"><Gem className="w-3 h-3" />{selectedPack ? selectedPack.price : PACK_COST}</span>
              </button>

              {showPackPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 space-y-1 z-50"
                >
                  {packs.length === 0 && (
                    <div className="p-3 text-[11px] text-slate-500 font-mono">{t('Nenhum pacote disponível.', 'No packs available.')}</div>
                  )}
                  {packs.map(pack => {
                    const active = pack.id === selectedPackId;
                    return (
                      <button
                        key={pack.id}
                        onClick={() => {
                          playClickSound();
                          setSelectedPackId(pack.id);
                          handleOpenPack(pack);
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition flex items-center gap-2.5 ${
                          active ? 'bg-fuchsia-500/10 border-fuchsia-500/40' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-700 flex items-center justify-center bg-slate-800 flex-shrink-0">
                          {pack.imageUrl ? (
                            <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-100 truncate">{pack.name}</p>
                          <p className="text-[10px] font-mono text-slate-400">
                            💎 {pack.price} • {pack.cardsPerPack} {t('cards', 'cards')} • {(pack.allowedRarities || []).length > 0 ? pack.allowedRarities.map(r => CARD_RARITY_META[r].label).join(', ') : t('qualquer', 'any')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
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

        {/* Pack reveal toast */}
        <AnimatePresence>
          {packToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xl border border-fuchsia-400/40 flex items-center gap-2 max-w-[90%] flex-wrap"
            >
              <Sparkles className="w-4 h-4 text-yellow-200 flex-shrink-0" />
              <span>{packToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collection Overview */}
        <div className="bg-slate-950/60 p-4 border-b border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{t('Coleção', 'Collection')}</span>
              <span className="text-lg font-black text-amber-300 font-mono">{ownedCount}<span className="text-slate-500 text-sm font-semibold">/{totalCount}</span></span>
            </div>
            <div className="flex-1 min-w-[120px]">
              <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-amber-400 transition-all duration-500"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <div className="text-[9px] font-mono text-slate-400 mt-1">{completionPct}% {t('concluída', 'complete')}</div>
            </div>
            <div className="flex items-center gap-1 text-amber-400 text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Star className="w-3.5 h-3.5" />
              {totalPoints} pts
            </div>
            <div className="flex items-center gap-1 text-cyan-400 text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <Gem className="w-3.5 h-3.5" />
              {gems}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {byRarity.map(({ rarity, total, owned: ownedN }) => {
              const meta = CARD_RARITY_META[rarity];
              return (
                <span key={rarity} className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border ${meta.chip} flex items-center gap-1`}>
                  {ownedN}/{total}
                  <span className={meta.text}>◆ {meta.label}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-950/60 p-3 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto flex-wrap">
          <button
            onClick={() => { playClickSound(); setRarityFilter('todas'); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap ${
              rarityFilter === 'todas'
                ? 'bg-slate-200 text-slate-950'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('Todas', 'All')}
          </button>
          {RARITY_ORDER.map(r => {
            const meta = CARD_RARITY_META[r];
            const isActive = rarityFilter === r;
            return (
              <button
                key={r}
                onClick={() => { playClickSound(); setRarityFilter(r); }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap border ${
                  isActive ? meta.chip : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { playClickSound(); setOwnedOnly(v => !v); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap border flex items-center gap-1.5 ${
                ownedOnly
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
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
              <Images className="w-12 h-12 text-slate-700 mb-3" />
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
                          {card.title}
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
          {selectedCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-30"
              onClick={() => setSelectedCard(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 15 }}
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
                        {selectedCard.title}
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

