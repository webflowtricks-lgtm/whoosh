import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { NinjaCard } from '../types';
import { CARD_RARITY_META } from '../lib/cardStorage';
import { playGlobalSound } from '../lib/soundUtils';
import { useLanguage } from '../lib/i18n';

const cardImage = (card: NinjaCard) => card.imageUrl ||
  `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${card.slug}/icon.jpg`;

interface CardPackRouletteModalProps {
  cards: NinjaCard[];
  catalog: NinjaCard[];
  onClose: () => void;
  playClickSound: () => void;
  playWinSound: () => void;
}

export default function CardPackRouletteModal({
  cards,
  catalog,
  onClose,
  playClickSound,
  playWinSound,
}: CardPackRouletteModalProps) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [trackOffset, setTrackOffset] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const winner = cards[activeIndex];
  const sequence = useMemo(() => {
    const pool = catalog.length > 0 ? catalog : [winner];
    return [
      ...Array.from({ length: 23 }, () => pool[Math.floor(Math.random() * pool.length)]),
      winner,
    ];
  }, [activeIndex, catalog, winner]);
  const rarePrize = winner.rarity === 'lendario' || winner.rarity === 'secreto';
  const canAdvance = activeIndex < cards.length - 1;

  useEffect(() => {
    if (!viewportRef.current) return;
    setTrackOffset(viewportRef.current.clientWidth / 2 - ((sequence.length - 1) * 90 + 39));
  }, [sequence]);

  useEffect(() => {
    if (!spinning) return;
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
  }, [spinning, activeIndex]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
      role="presentation"
      onClick={() => { if (!spinning) onClose(); }}
    >
      <section
        className="relative w-[min(620px,100%)] overflow-hidden rounded-3xl border border-sky-300/30 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 p-5 text-white shadow-[0_0_80px_rgba(14,165,233,0.22)] sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-card-roulette-title"
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300 disabled:opacity-40"
          onClick={onClose}
          disabled={spinning}
          aria-label={t('Fechar', 'Close')}
        >
          ×
        </button>
        <div className="mb-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[.3em] text-sky-300">
            {t(`Pacote ${activeIndex + 1} de ${cards.length}`, `Pack ${activeIndex + 1} of ${cards.length}`)}
          </p>
          <h2 id="mail-card-roulette-title" className="mt-1 text-2xl font-black uppercase tracking-wider sm:text-3xl">
            {t('Roleta Ninja Card', 'Ninja Card Roulette')}
          </h2>
        </div>

        <div className="relative mb-5 overflow-hidden rounded-2xl border border-sky-300/20 bg-slate-950/80 py-4">
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-1 -translate-x-1/2 bg-gradient-to-b from-transparent via-amber-300 to-transparent shadow-[0_0_18px_rgba(252,211,77,.8)]" />
          <div ref={viewportRef} className="overflow-hidden">
            <motion.div
              key={`${winner.id}:${activeIndex}`}
              className="flex w-max"
              initial={{ x: 0 }}
              animate={{ x: trackOffset ?? 0 }}
              transition={{ duration: trackOffset === null ? 0 : 3, ease: [0.06, 0.82, 0.12, 1] }}
              onAnimationComplete={() => {
                if (trackOffset === null) return;
                setSpinning(false);
                if (rarePrize) playWinSound();
                else playGlobalSound('correct-sound');
              }}
            >
              {sequence.map((card, index) => (
                <div
                  key={`${card.id}:${index}`}
                  className={`relative mr-3 h-[116px] w-[78px] shrink-0 overflow-hidden rounded-lg border bg-slate-900 ${CARD_RARITY_META[card.rarity].border}`}
                >
                  <img src={cardImage(card)} alt="" className="h-full w-full object-cover" />
                  <span className={`absolute inset-x-0 bottom-0 truncate bg-slate-950/85 px-1 py-1 text-center text-[8px] font-bold ${CARD_RARITY_META[card.rarity].text}`}>
                    {card.characterName}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
          {spinning && (
            <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[.25em] text-sky-200">
              {t('Girando...', 'Spinning...')}
            </p>
          )}
        </div>

        {!spinning && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className={`font-black uppercase tracking-[.18em] ${rarePrize ? 'text-2xl' : 'text-lg'} ${CARD_RARITY_META[winner.rarity].text}`}>
              {winner.rarity === 'lendario' ? 'LENDÁRIO!!!' : winner.rarity === 'secreto' ? 'MÍTICO!!!' : CARD_RARITY_META[winner.rarity].label}
            </p>
            <div className={`h-48 w-36 overflow-hidden rounded-xl border-2 bg-slate-950 shadow-xl ${CARD_RARITY_META[winner.rarity].border}`}>
              <img src={cardImage(winner)} alt={winner.characterName} className="h-full w-full object-cover" />
            </div>
            <p className="text-lg font-extrabold">{winner.characterName}</p>
            <button
              type="button"
              className="w-full max-w-sm rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-3 text-sm font-black uppercase tracking-wider shadow-lg transition hover:brightness-110"
              onClick={() => {
                playClickSound();
                if (canAdvance) {
                  setActiveIndex(index => index + 1);
                  setSpinning(true);
                } else {
                  onClose();
                }
              }}
            >
              {canAdvance
                ? t('Próximo prêmio', 'Next prize')
                : t('Concluir', 'Finish')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
