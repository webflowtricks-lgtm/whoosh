import React from 'react';
import { Backpack, Lock, X } from 'lucide-react';
import type { Character, UserProfile } from '../types';
import {
  getSkinFragmentCount,
  getSkinFragmentCatalog,
  SKIN_FRAGMENT_UNLOCK_TARGET,
  SKIN_RARITY_META,
  SKIN_RARITY_ORDER,
} from '../lib/skinFragments';
import SkinMedia from './SkinMedia';
import { useLanguage } from '../lib/i18n';

interface SkinBagModalProps {
  user: UserProfile;
  characters: Character[];
  onClose: () => void;
  playClickSound: () => void;
}

export default function SkinBagModal({ user, characters, onClose, playClickSound }: SkinBagModalProps) {
  const { t } = useLanguage();
  const fragments = user.skinFragments || {};
  const unlockedSkins = new Set(user.unlockedSkins || []);
  const skins = getSkinFragmentCatalog(characters)
    .map(skin => ({
      ...skin,
      count: getSkinFragmentCount(fragments, skin.id),
    }))
    .sort((left, right) =>
      SKIN_RARITY_ORDER.indexOf(right.rarity) - SKIN_RARITY_ORDER.indexOf(left.rarity) ||
      right.count - left.count ||
      left.characterName.localeCompare(right.characterName) ||
      left.name.localeCompare(right.name),
    );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="skin-bag-title"
        onClick={event => event.stopPropagation()}
        className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white text-slate-800 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-600">
              <Backpack className="h-6 w-6" />
            </div>
            <div>
              <h2 id="skin-bag-title" className="text-lg font-black uppercase tracking-wider text-slate-900">
                {t('Mochila de Fragmentos', 'Fragment Bag')}
                <span className="ml-2 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[9px] font-mono text-orange-700">
                  INVENTÁRIO
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {t('50 fragmentos desbloqueiam cada skin.', 'Collect 50 fragments to unlock each skin.')}
              </p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto bg-slate-50/70 p-3 sm:grid-cols-3 sm:gap-4 sm:p-5">
          {skins.map(skin => {
            const isUnlocked = unlockedSkins.has(skin.id) || skin.count >= SKIN_FRAGMENT_UNLOCK_TARGET;
            const rarity = SKIN_RARITY_META[skin.rarity];
            return (
              <article
                key={skin.id}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition hover:border-blue-300 hover:shadow-lg ${
                  isUnlocked ? 'border-orange-300' : 'border-slate-200'
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden border-b border-slate-200 bg-gradient-to-br from-blue-50 to-orange-50">
                  <SkinMedia
                    src={skin.image}
                    alt={`${skin.name} - ${skin.characterName}`}
                    className="h-full w-full object-contain"
                  />
                  {!isUnlocked && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white/95 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700">
                      <Lock className="h-3 w-3" />
                      {t('Em coleta', 'Collecting')}
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-slate-800" title={skin.name}>{skin.name}</h3>
                    <p className="truncate text-xs text-slate-500" title={skin.characterName}>{skin.characterName}</p>
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${rarity.className}`}>
                      {t(rarity.labelPt, rarity.labelEn)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-mono text-xs font-bold">
                      <span className={isUnlocked ? 'text-orange-700' : 'text-blue-700'}>
                        {skin.count}/{SKIN_FRAGMENT_UNLOCK_TARGET}
                      </span>
                      <span className="text-slate-500">{t('fragmentos', 'fragments')}</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={SKIN_FRAGMENT_UNLOCK_TARGET}
                      aria-valuenow={Math.min(SKIN_FRAGMENT_UNLOCK_TARGET, skin.count)}
                      aria-label={`${skin.name}: ${skin.count}/${SKIN_FRAGMENT_UNLOCK_TARGET}`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${isUnlocked ? 'bg-gradient-to-r from-orange-400 to-amber-500' : 'bg-gradient-to-r from-blue-500 to-sky-400'}`}
                        style={{ width: `${Math.min(100, skin.count / SKIN_FRAGMENT_UNLOCK_TARGET * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {skins.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-slate-500">
              {t('Ainda não há skins disponíveis para coletar.', 'There are no skins available to collect yet.')}
            </p>
          )}
        </div>
      </section>
      <button
        type="button"
        onClick={() => { playClickSound(); onClose(); }}
        className="fixed bottom-4 left-4 z-[105] rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-xl transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={t('Fechar mochila', 'Close bag')}
        title={t('Fechar', 'Close')}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
