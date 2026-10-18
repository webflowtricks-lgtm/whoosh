/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, ShoppingCart, Sparkles, Check, Award, Shield, CircleDollarSign, UserCheck, Shirt, Dices, LoaderCircle } from 'lucide-react';
import { UserProfile, ShopItem, NinjaCard } from '../types';
import { getShopItems, fetchShopItemsFromServer } from '../lib/shopStorage';
import { playGlobalSound } from '../lib/soundUtils';
import { fetchCardsFromServer, getCards, CARD_RARITY_META } from '../lib/cardStorage';
import {
  CARD_ROULETTE_CHANCES,
  CARD_ROULETTE_COST,
  CARD_ROULETTE_RARITY_ORDER,
  getCardRouletteChances,
} from '../lib/cardRoulette';
import { fetchCardRouletteChances, type CardRouletteChances } from '../lib/cardRouletteSettings';
import { matchFetch } from '../lib/matchFetch';

type ShopTab = 'all' | 'skin' | 'title' | 'frame' | 'bundle' | 'roulette';

const ROULETTE_ITEM_ID = 'ninja-card-roulette';
const ROULETTE_ITEM: ShopItem = {
  id: ROULETTE_ITEM_ID,
  name: 'Roleta Ninja Card',
  category: 'bundle',
  description: 'Gire a roleta e ganhe uma figurinha aleatória.',
  currency: 'ryos',
  price: CARD_ROULETTE_COST,
};

const cardImage = (card: NinjaCard) => card.imageUrl ||
  `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${card.slug}/icon.jpg`;

interface ShopModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  playWinSound: () => void;
  initialTab?: ShopTab;
}

export default function ShopModal({ user, onClose, onUpdateUser, playClickSound, playScrollSound, playWinSound, initialTab = 'all' }: ShopModalProps) {
  const [items, setItems] = useState<ShopItem[]>(() => getShopItems());
  const [activeTab, setActiveTab] = useState<ShopTab>(initialTab);
  const [purchaseToast, setPurchaseToast] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<ShopItem | null>(null);
  const [cards, setCards] = useState<NinjaCard[]>(() => getCards());
  const [rouletteSettings, setRouletteSettings] = useState<CardRouletteChances>({
    ...CARD_ROULETTE_CHANCES,
  });
  const [rouletteInfoOpen, setRouletteInfoOpen] = useState(false);
  const [roulettePhase, setRoulettePhase] = useState<'spinning' | 'result' | null>(null);
  const [rouletteSequence, setRouletteSequence] = useState<NinjaCard[]>([]);
  const [rouletteWinner, setRouletteWinner] = useState<NinjaCard | null>(null);
  const [rouletteIsDuplicate, setRouletteIsDuplicate] = useState(false);
  const [rouletteOffset, setRouletteOffset] = useState<number | null>(null);
  const [rouletteSpinDuration, setRouletteSpinDuration] = useState(3.2);
  const [rouletteError, setRouletteError] = useState('');
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const rouletteTrackRef = useRef<HTMLDivElement>(null);
  const rouletteRevealSoundPlayedRef = useRef(false);

  const selectTab = (tab: ShopTab, button: HTMLButtonElement) => {
    playScrollSound();
    setActiveTab(tab);
    const tabsContainer = tabsContainerRef.current;
    if (!tabsContainer) return;
    const containerRect = tabsContainer.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const centeredScrollLeft = tabsContainer.scrollLeft +
      buttonRect.left - containerRect.left - (containerRect.width - buttonRect.width) / 2;
    tabsContainer.scrollTo({ left: centeredScrollLeft, behavior: 'smooth' });
  };

  useEffect(() => {
    fetchShopItemsFromServer().then(setItems);
    fetchCardsFromServer().then(setCards);
    fetchCardRouletteChances().then(setRouletteSettings);
  }, []);

  useEffect(() => {
    if (roulettePhase !== 'spinning' || rouletteSequence.length === 0 || !rouletteTrackRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const winningIndex = rouletteSequence.length - 1;
      const cardStep = 108;
      const cardCenter = winningIndex * cardStep + 48;
      setRouletteOffset(-((cardCenter + 12) - rouletteTrackRef.current!.clientWidth / 2));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roulettePhase, rouletteSequence]);

  useEffect(() => {
    if (roulettePhase !== 'spinning' || rouletteSequence.length === 0 || rouletteOffset === null) return;
    const spinAudio = new Audio('/static/audio/roleta.mp3');
    spinAudio.loop = true;
    spinAudio.volume = 0.45;
    void spinAudio.play().catch(error => {
      console.warn('Não foi possível reproduzir o áudio da roleta:', error);
    });
    return () => {
      spinAudio.pause();
      spinAudio.currentTime = 0;
    };
  }, [roulettePhase, rouletteSequence.length, rouletteOffset]);

  const ryos = user.ryos ?? 1500;
  const gems = user.gems ?? 120;
  const unlockedFrames = user.unlockedFrames || ['Padrão'];
  const unlockedTitles = user.unlockedTitles || ['Estudante'];
  const unlockedSkins = user.unlockedSkins || [];
  const equippedFrame = user.equippedFrame || 'Padrão';
  const currentTitle = user.title || unlockedTitles[0] || 'Estudante';
  const rouletteChances = getCardRouletteChances(cards, rouletteSettings);

  const filteredItems = activeTab === 'roulette'
    ? []
    : items.filter(item => activeTab === 'all' || item.category === activeTab);

  const revealRoulettePrize = () => {
    if (rouletteRevealSoundPlayedRef.current) return;
    rouletteRevealSoundPlayedRef.current = true;
    if (rouletteWinner?.rarity === 'lendario' || rouletteWinner?.rarity === 'secreto') {
      playWinSound();
    } else {
      playGlobalSound('correct-sound');
    }
    setRoulettePhase('result');
  };

  const startRouletteDraw = async () => {
    if (ryos < CARD_ROULETTE_COST) {
      playGlobalSound('denied');
      setPurchaseToast('Moedas insuficientes!');
      setTimeout(() => setPurchaseToast(null), 3000);
      return;
    }
    setRouletteError('');
    setRouletteInfoOpen(false);
    setRoulettePhase('spinning');
    rouletteRevealSoundPlayedRef.current = false;
    setRouletteSequence([]);
    setRouletteWinner(null);
    setRouletteOffset(null);
    try {
      const response = await matchFetch('/api/cards/roulette/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username }),
      });
      const result = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        card?: NinjaCard;
        user?: UserProfile;
        isDuplicate?: boolean;
      };

      if (!response.ok || !result.success || !result.card || !result.user) {
        throw new Error(result.error || `Não foi possível girar a roleta (HTTP ${response.status}).`);
      }
      onUpdateUser({ ...user, ...result.user });
      setRouletteWinner(result.card);
      setRouletteIsDuplicate(result.isDuplicate ??
        (result.user.collectedCardIds?.filter(id => id === result.card!.id).length ?? 0) > 1);
      const fillerCount = 80 + Math.floor(Math.random() * 41);
      setRouletteSpinDuration(2.8 + Math.random() * 0.4);
      const fillers = Array.from({ length: fillerCount }, () =>
        cards[Math.floor(Math.random() * cards.length)] || result.card!,
      );
      setRouletteSequence([...fillers, result.card]);
    } catch (error) {
      console.error('Falha ao girar a roleta de Ninja Cards:', error);
      setRouletteError(error instanceof Error ? error.message : 'Não foi possível girar a roleta.');
      setRoulettePhase(null);
      setRouletteInfoOpen(true);
    }
  };

  const confirmPendingPurchase = () => {
    if (!pendingPurchase) return;
    playGlobalSound('cash');
    if (pendingPurchase.id === ROULETTE_ITEM_ID) {
      setPendingPurchase(null);
      void startRouletteDraw();
      return;
    }
    handleBuyOrEquip(pendingPurchase, false);
    setPendingPurchase(null);
  };

  const handleBuyOrEquip = (item: ShopItem, playSound = true) => {
    if (playSound) playClickSound();

    if (item.category === 'skin') {
      const isUnlocked = unlockedSkins.includes(item.name) || unlockedSkins.includes(item.id);
      if (isUnlocked) {
        setPurchaseToast(`Skin "${item.name}" já está desbloqueada!`);
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }

      if (item.currency === 'ryos' && ryos < item.price) {
        setPurchaseToast('Moedas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Ryos insuficientes!');
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
        setPurchaseToast('Moedas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Ryos insuficientes!');
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
        setPurchaseToast('Moedas insuficientes!');
        setTimeout(() => setPurchaseToast(null), 3000);
        return;
      }
      if (item.currency === 'gems' && gems < item.price) {
        setPurchaseToast('Ryos insuficientes!');
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
        setPurchaseToast('Ryos insuficientes!');
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

      setPurchaseToast(`Comprado com sucesso: +${item.bundleGrant.amount} moedas!`);
      setTimeout(() => setPurchaseToast(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center backdrop-blur-md p-3 sm:p-6 select-none gpu-accelerated">
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-5xl h-[88vh] max-h-[800px] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800"
      >
        {/* Top Header Bar with Currencies */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold font-display uppercase tracking-wider text-slate-900 flex items-center gap-2">
                Loja Shinobi
                <span className="text-[10px] font-mono bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-bold">
                  SHOP
                </span>
              </h2>
              <p className="text-xs text-slate-500">Adquira molduras de perfil, títulos honrosos e pacotes de moedas!</p>
            </div>
          </div>

          {/* User Balance Pills & Close */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-mono text-orange-700 font-extrabold flex items-center gap-1.5">
                <img src="/static/img/icon/gold.webp" alt="" className="h-4 w-4 object-contain" />
                {ryos.toLocaleString()} <span className="text-[10px] text-slate-500">Moedas</span>
              </span>
              <div className="h-4 w-px bg-slate-200" />
              <span className="text-xs font-mono text-blue-700 font-extrabold flex items-center gap-1.5">
                <img src="/static/img/icon/ryo.webp" alt="" className="h-4 w-4 object-contain" />
                {gems.toLocaleString()} <span className="text-[10px] text-slate-500">Ryos</span>
              </span>
            </div>

          </div>
        </div>

        {/* Purchase Toast */}
        <AnimatePresence>
          {purchaseToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-blue-600 to-orange-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xl border border-blue-300/60 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>{purchaseToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Categories Tab Navigation */}
        <div ref={tabsContainerRef} className="shop-modal-tabs p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'all', label: 'Todos os Itens', icon: ShoppingBag },
            { id: 'title', label: 'Títulos', icon: Award },
            { id: 'skin', label: 'Skins', icon: Shirt },
            { id: 'frame', label: 'Molduras de Perfil', icon: Shield },
            { id: 'bundle', label: 'Pacotes & Moedas', icon: CircleDollarSign },
            { id: 'roulette', label: 'Roleta', icon: Dices }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={event => selectTab(tab.id as typeof activeTab, event.currentTarget)}
                data-sound="Scroll"
                className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-xl border text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-600/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Shop Items Grid */}
        {activeTab === 'roulette' ? (
          <div className="flex flex-1 items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50 to-orange-50 p-4 sm:p-8">
            <button
              type="button"
              onClick={() => { playClickSound(); setRouletteInfoOpen(true); }}
              data-sound="Click"
              className="group w-full max-w-xl text-left transition hover:-translate-y-1"
              aria-label="Ver detalhes da Roleta Ninja Card"
            >
              <div className="relative flex flex-col items-center text-center">
                <div className="relative w-full">
                  <img src="/static/img/pacote.webp" alt="" className="h-[min(60dvh,460px)] w-full object-contain transition duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4 sm:pb-6">
                    <span className="rounded-full border border-white/35 bg-slate-950/30 px-4 py-1.5 text-sm font-black uppercase tracking-[.25em] text-white backdrop-blur-sm sm:text-base">
                      Roleta Ninja Card
                    </span>
                    <span className="flex items-center gap-2 rounded-xl border border-white/30 bg-slate-950/30 px-4 py-1.5 text-lg font-black text-white backdrop-blur-sm">
                      <img src="/static/img/icon/gold.webp" alt="" className="h-7 w-7 object-contain" />
                      {CARD_ROULETTE_COST.toLocaleString('pt-BR')} Moedas por giro
                    </span>
                  </div>
                </div>
                <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-slate-600">
                  Toque para ver as figurinhas disponíveis e as chances de cada raridade.
                </p>
              </div>
            </button>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto bg-slate-50/70 p-2.5 sm:p-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {filteredItems.map(item => {
              const isUnlockedFrame = item.category === 'frame' && unlockedFrames.includes(item.name);
              const isUnlockedTitle = item.category === 'title' && unlockedTitles.includes(item.name);
              const isUnlockedSkin = item.category === 'skin' && (unlockedSkins.includes(item.name) || unlockedSkins.includes(item.id));
              const isEquippedFrame = item.category === 'frame' && equippedFrame === item.name;
              const isEquippedTitle = item.category === 'title' && currentTitle === item.name;
              const isOwned = isUnlockedFrame || isUnlockedTitle || isUnlockedSkin;
              const isEquipped = isEquippedFrame || isEquippedTitle;
              const hasEnoughCurrency = (item.currency === 'ryos' ? ryos : gems) >= item.price;

              return (
                <div
                  key={item.id}
                  className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/10 sm:rounded-2xl sm:p-3"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:rounded-xl">
                    {item.badge && (
                      <span className="absolute left-1 top-1 z-10 max-w-[80%] truncate rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[7px] font-mono font-bold uppercase text-orange-700 sm:text-[9px]">
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
                            <Shirt className="h-8 w-8 text-blue-500 sm:h-10 sm:w-10" />
                          )}
                          {item.characterName && (
                            <span className="absolute bottom-0.5 left-0.5 max-w-full truncate rounded border border-blue-200 bg-white/95 px-1 py-0.5 font-mono text-[7px] font-bold text-blue-700 sm:bottom-1 sm:left-1 sm:px-1.5 sm:text-[9px]">
                              {item.characterName}
                            </span>
                          )}
                        </div>
                      )}

                      {item.category === 'frame' && (
                        <div className={`relative h-12 w-12 rounded-full p-1 sm:h-16 sm:w-16 ${item.frameStyle || 'border-2 border-blue-500'}`}>
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
                            <Award className="mx-auto h-7 w-7 text-orange-500 sm:h-8 sm:w-8" />
                          )}
                          <p className="line-clamp-2 rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[8px] font-mono font-black uppercase tracking-wider text-orange-700 sm:px-2 sm:py-1 sm:text-xs">
                            {item.name}
                          </p>
                        </div>
                      )}

                      {item.category === 'bundle' && (
                        <div className="space-y-1 text-center">
                          {item.icon ? (
                            <img src={item.icon} alt="" className="mx-auto h-10 w-10 object-contain sm:h-12 sm:w-12" />
                          ) : (
                            <CircleDollarSign className="mx-auto h-8 w-8 text-blue-500 sm:h-10 sm:w-10" />
                          )}
                          <p className="text-[8px] font-mono font-bold text-blue-700 sm:text-xs">
                            +{item.bundleGrant?.amount} moedas
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 min-w-0">
                    <h3 className="truncate text-[9px] font-extrabold tracking-tight text-slate-800 sm:text-sm" title={item.name}>
                      {item.name}
                    </h3>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-slate-200 pt-1.5 sm:mt-2 sm:pt-2">
                    <span className={`flex min-w-0 items-center gap-1 whitespace-nowrap text-xs font-mono font-extrabold sm:gap-1.5 sm:text-sm ${hasEnoughCurrency ? 'text-blue-700' : 'text-red-600'}`}>
                      <img
                        src={item.currency === 'ryos' ? '/static/img/icon/gold.webp' : '/static/img/icon/ryo.webp'}
                        alt=""
                        className="h-[18px] w-[18px] shrink-0 object-contain sm:h-5 sm:w-5"
                      />
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
                        className="rounded-lg border border-blue-200 bg-blue-50 p-1 text-blue-700 transition hover:bg-blue-100"
                      >
                        <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (!hasEnoughCurrency) {
                            playGlobalSound('denied');
                            return;
                          }
                          playGlobalSound('cash');
                          setPendingPurchase(item);
                        }}
                        aria-label={`Comprar ${item.name}`}
                        title="Comprar"
                        className="rounded-lg border border-blue-700 bg-blue-600 p-1 text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 active:scale-95"
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
        )}
      </motion.div>

      <button
        type="button"
        onClick={() => {
          playClickSound();
          onClose();
        }}
        className="fixed bottom-4 left-4 z-[55] rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-xl transition hover:bg-slate-100 hover:text-slate-900"
        aria-label="Fechar loja"
        title="Fechar"
      >
        <X className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {rouletteInfoOpen && (
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6"
            onClick={() => setRouletteInfoOpen(false)}
          >
          <motion.section
            initial={false}
            role="dialog"
              aria-modal="true"
              aria-labelledby="roulette-odds-title"
              onClick={event => event.stopPropagation()}
              className="flex max-h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white text-slate-800 shadow-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-orange-50 p-4 sm:p-5">
                <div>
                  <h2 id="roulette-odds-title" className="flex items-center gap-2 text-lg font-black uppercase tracking-wide text-blue-950 sm:text-xl">
                    <Dices className="h-5 w-5 text-orange-600" />
                    Chances da Roleta
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">As chances das raridades sem figuras no catálogo são redistribuídas entre as demais.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRouletteInfoOpen(false)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
                  aria-label="Fechar chances"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              {rouletteError && (
                <p role="alert" className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 sm:mx-4">
                  {rouletteError}
                </p>
              )}

              <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3 sm:p-4">
                {CARD_ROULETTE_RARITY_ORDER.map(rarity => {
                  const rarityCards = cards.filter(card => card.rarity === rarity);
                  const meta = CARD_RARITY_META[rarity];
                  const chance = rouletteChances[rarity];
                  const chanceBadgeColors: Record<NinjaCard['rarity'], string> = {
                    comum: 'border-slate-500 bg-slate-600 text-white',
                    raro: 'border-sky-500 bg-sky-600 text-white',
                    epico: 'border-fuchsia-500 bg-fuchsia-600 text-white',
                    lendario: 'border-amber-500 bg-amber-400 text-amber-950',
                    secreto: 'border-red-500 bg-red-600 text-white',
                  };
                  return (
                    <section key={rarity} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <header className="sticky top-0 z-10 flex items-center justify-between gap-1 border-b border-slate-200 bg-white px-2 py-2">
                        <span className={`truncate text-[10px] font-black uppercase tracking-wide sm:text-xs ${meta.text}`}>
                          {meta.label}
                        </span>
                        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-black ${chanceBadgeColors[rarity]}`}>
                          {chance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                        </span>
                      </header>
                      <div className="grid grid-cols-3 content-start gap-1.5 overflow-y-auto p-2">
                        {rarityCards.length > 0 ? rarityCards.map(card => (
                          <div key={card.id} className={`relative aspect-[3/4] overflow-hidden rounded-md border ${meta.border} bg-slate-900`} title={`${card.characterName}${card.variant ? ` — ${card.variant}` : ''}`}>
                            <img src={cardImage(card)} alt={card.characterName} loading="lazy" className="h-full w-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 truncate bg-slate-950/80 px-1 py-0.5 text-center text-[7px] font-bold text-white">
                              {card.characterName}
                            </span>
                          </div>
                        )) : (
                          <p className="col-span-3 py-4 text-center text-[10px] font-semibold text-slate-400">Nenhuma figurinha</p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
                <span className="text-xs font-semibold text-slate-600">{cards.length} figurinhas disponíveis no catálogo</span>
                <button
                  type="button"
                  onClick={() => {
                    if (ryos < CARD_ROULETTE_COST) {
                      playGlobalSound('denied');
                      setPurchaseToast('Moedas insuficientes!');
                      setTimeout(() => setPurchaseToast(null), 3000);
                      return;
                    }
                    setRouletteError('');
                    playGlobalSound('cash');
                    setPendingPurchase(ROULETTE_ITEM);
                  }}
                  data-sound="cash"
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg transition active:scale-95 ${
                    ryos >= CARD_ROULETTE_COST
                      ? 'border-blue-700 bg-blue-600 shadow-blue-700/20 hover:bg-blue-700'
                      : 'cursor-not-allowed border-red-700 bg-red-600'
                  }`}
                >
                  <img src="/static/img/icon/gold.webp" alt="" className="h-5 w-5 object-contain" />
                  Comprar por {CARD_ROULETTE_COST.toLocaleString('pt-BR')} Moedas
                </button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {roulettePhase === 'spinning' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-blue-950/95 p-4 text-white backdrop-blur-md"
          >
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[.3em] text-orange-300">Roleta Ninja Card</p>
              <h2 className="mt-2 text-xl font-black sm:text-2xl">Sua figurinha está chegando...</h2>
            </div>
            <div ref={rouletteTrackRef} className="relative w-full max-w-4xl overflow-hidden rounded-2xl border-2 border-sky-300/70 bg-slate-950/80 py-4 shadow-[0_0_40px_rgba(56,189,248,0.3)]">
              <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-20 w-1 -translate-x-1/2 bg-orange-300 shadow-[0_0_18px_rgba(253,186,116,0.9)]" />
              {rouletteSequence.length > 0 ? (
                <motion.div
                  initial={{ x: 0 }}
                  animate={{ x: rouletteOffset ?? 0 }}
                  transition={rouletteOffset === null
                    ? { duration: 0 }
                    : { duration: rouletteSpinDuration, ease: [0.12, 0.76, 0.12, 1] }}
                  onAnimationComplete={() => {
                    if (rouletteOffset !== null && roulettePhase === 'spinning') {
                      revealRoulettePrize();
                    }
                  }}
                  className="flex w-max gap-3 px-3"
                >
                  {rouletteSequence.map((card, index) => (
                    <div key={`${card.id}-${index}`} className={`relative h-32 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${CARD_RARITY_META[card.rarity].border}`}>
                      <img src={cardImage(card)} alt={card.characterName} className="h-full w-full object-cover" />
                      <span className={`absolute inset-x-0 bottom-0 truncate bg-slate-950/85 px-1 py-1 text-center text-[8px] font-black ${CARD_RARITY_META[card.rarity].text}`}>
                        {card.characterName}
                      </span>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <div className="flex h-40 items-center justify-center gap-3 text-sm font-bold text-sky-100">
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                  Preparando o sorteio...
                </div>
              )}
            </div>
            {rouletteError && <p role="alert" className="max-w-lg rounded-xl border border-red-300/40 bg-red-950/70 px-4 py-3 text-center text-sm font-bold text-red-100">{rouletteError}</p>}
            {rouletteSequence.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (roulettePhase !== 'spinning' || !rouletteWinner) return;
                  revealRoulettePrize();
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-sky-100/80 underline decoration-sky-300/50 underline-offset-4 transition hover:text-white"
              >
                Pular animação e ir direto para o prêmio
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {roulettePhase === 'result' && rouletteWinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-blue-950/75 px-4 pb-24 pt-6 backdrop-blur-xl"
          >
            {(() => {
              const particleColors: Record<NinjaCard['rarity'], string> = {
                comum: 'bg-slate-300 shadow-[0_0_10px_rgba(203,213,225,0.8)]',
                raro: 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]',
                epico: 'bg-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.95)]',
                lendario: 'bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,1)]',
                secreto: 'bg-red-400 shadow-[0_0_20px_rgba(248,113,113,1)]',
              };
              return (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                  {Array.from({ length: 32 }, (_, index) => (
                    <motion.span
                      key={`${rouletteWinner.id}-${index}`}
                      className={`absolute bottom-[-12px] rounded-full ${particleColors[rouletteWinner.rarity]}`}
                      style={{
                        left: `${(index * 37 + 11) % 100}%`,
                        width: index % 5 === 0 ? 7 : index % 3 === 0 ? 5 : 3,
                        height: index % 5 === 0 ? 7 : index % 3 === 0 ? 5 : 3,
                      }}
                      initial={{ y: 0, opacity: 0, scale: 0.5 }}
                      animate={{ y: `-${55 + (index % 5) * 12}vh`, opacity: [0, 0.9, 0.75, 0], scale: [0.5, 1.15, 0.85] }}
                      transition={{
                        duration: 3 + (index % 5) * 0.55,
                        delay: (index % 10) * 0.3,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                </div>
              );
            })()}
            <motion.section
              initial={{ scale: 0.8, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              className="relative z-10 flex h-[min(76dvh,680px)] w-[min(360px,calc(100vw-2rem))] flex-col items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="roulette-result-title"
            >
              <p className={`mb-3 text-center font-black uppercase tracking-[.12em] drop-shadow-[0_0_18px_currentColor] ${
                rouletteWinner.rarity === 'lendario'
                  ? 'text-2xl text-amber-300 sm:text-4xl'
                  : rouletteWinner.rarity === 'secreto'
                    ? 'text-2xl text-red-400 sm:text-4xl'
                    : `rounded-full border px-4 py-1.5 text-[10px] tracking-[.2em] shadow-lg ${
                      rouletteIsDuplicate
                        ? 'border-sky-200 bg-white/95 text-blue-800'
                        : 'border-emerald-200 bg-emerald-500 text-white'
                    }`
              }`}>
                {rouletteWinner.rarity === 'lendario'
                  ? 'LENDÁRIO!!!'
                  : rouletteWinner.rarity === 'secreto'
                    ? 'MÍTICO!!!'
                    : rouletteIsDuplicate ? 'FIGURINHA OBTIDA' : 'NOVA FIGURINHA'}
              </p>
              <div
                id="roulette-result-title"
                className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border-2 bg-slate-950 shadow-[0_0_70px_rgba(37,99,235,0.3)] ${CARD_RARITY_META[rouletteWinner.rarity].border}`}
              >
                <img src={cardImage(rouletteWinner)} alt={rouletteWinner.characterName} className="h-full w-full object-contain" />
                {rouletteWinner.rarity === 'secreto' && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                    {Array.from({ length: 10 }, (_, index) => (
                      <motion.span
                        key={index}
                        className="absolute bottom-0 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]"
                        style={{ left: `${8 + ((index * 37) % 84)}%`, width: index % 3 === 0 ? 4 : 3, height: index % 3 === 0 ? 4 : 3 }}
                        initial={{ y: 0, opacity: 0, scale: 0.6 }}
                        animate={{ y: -260, opacity: [0, 0.9, 0.75, 0], scale: [0.6, 1.1, 0.8] }}
                        transition={{ duration: 2.8 + (index % 4) * 0.35, delay: index * 0.32, ease: 'easeOut', repeat: Infinity }}
                      />
                    ))}
                  </div>
                )}
                {(rouletteWinner.rarity === 'lendario' || rouletteWinner.rarity === 'secreto') && (
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-y-1/4 left-0 z-30 w-3/4"
                    initial={{ x: '-140%', rotate: -18 }}
                    animate={{ x: '200%', rotate: -18 }}
                    transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.26) 42%, rgba(255,255,255,0.68) 50%, rgba(255,255,255,0.26) 58%, rgba(255,255,255,0.06) 75%, transparent 100%)',
                      filter: 'blur(3px) drop-shadow(0 0 12px rgba(255,255,255,0.65))',
                      mixBlendMode: 'screen',
                    }}
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
                <span className={`absolute left-2 top-2 z-50 rounded-md border px-2.5 py-1 text-[11px] font-mono font-black uppercase tracking-wider shadow-lg ${CARD_RARITY_META[rouletteWinner.rarity].chip}`}>
                  ◆ {CARD_RARITY_META[rouletteWinner.rarity].label}
                </span>
                <div className="absolute bottom-2 left-2 right-2 z-50 text-center">
                  <p className={`text-sm font-mono font-black uppercase tracking-wider ${CARD_RARITY_META[rouletteWinner.rarity].text}`}>
                    #{String(Math.max(1, cards.findIndex(card => card.id === rouletteWinner.id) + 1)).padStart(3, '0')}
                  </p>
                </div>
              </div>
            </motion.section>
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setRoulettePhase(null);
                setRouletteWinner(null);
                setRouletteSequence([]);
                setRouletteOffset(null);
              }}
              className="fixed bottom-[max(3.5rem,env(safe-area-inset-bottom))] left-1/2 z-[81] flex w-[min(280px,calc(100vw-2rem))] -translate-x-1/2 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 via-sky-600 to-blue-700 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-blue-500/25 transition hover:brightness-110 active:scale-95"
            >
              <img src="/static/img/icon/confirm-cloud.svg" alt="" className="h-6 w-6 object-contain" />
              <span>RESGATAR</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingPurchase && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
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
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-black text-orange-700">
                  <img
                    src={pendingPurchase.currency === 'ryos' ? '/static/img/icon/gold.webp' : '/static/img/icon/ryo.webp'}
                    alt=""
                    className="h-5 w-5 object-contain"
                  />
                  {pendingPurchase.price.toLocaleString()}
                </span>
                {' '}em
              </p>
              <h3 id="shop-purchase-title" className="max-w-full break-words text-2xl font-black leading-tight text-orange-700 sm:text-3xl">
                {pendingPurchase.name}?
              </h3>
              <div className="mt-1 flex w-full justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setPendingPurchase(null);
                  }}
                  className="rounded-lg border border-orange-600 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-orange-700 transition hover:bg-orange-50 sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmPendingPurchase();
                  }}
                  data-sound="cash"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 sm:text-sm"
                >
                  <img src="/static/img/icon/confirm-cloud.svg" alt="" className="h-4 w-4 object-contain" />
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
