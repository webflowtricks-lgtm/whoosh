/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Flame } from 'lucide-react';
import { getCharacters } from '../lib/characterStorage';
import { getRanks } from '../lib/rankStorage';
import { getShopItems } from '../lib/shopStorage';
import { getEvents } from '../lib/eventStorage';
import { getCustomBanners } from '../lib/bannerStorage';
import { getPngFrames } from '../lib/frameStorage';
import { preloadImage } from '../lib/imagePreloader';
import { safeFetchJson } from '../lib/api';
import { useLanguage } from '../lib/i18n';

const ARENA_MESSAGES_PT = [
  'Por favor, aguarde para uma melhor experiência...',
  'Agradecemos por estar nessa arena conosco!',
  'Convocando os ninjas lendários...',
  'Afiando as kunais e preparando os pergaminhos...',
  'Equilibrando o chakra elemental da arena...',
  'Sincronizando o time 3v3...',
  'Quase lá, o confronto começa já já!',
];

const ARENA_MESSAGES_EN = [
  'Please wait for a better experience...',
  'Thank you for joining us in this arena!',
  'Summoning the legendary ninjas...',
  'Sharpening kunai and preparing the scrolls...',
  'Balancing the elemental chakra of the arena...',
  'Syncing the 3v3 squad...',
  'Almost there, the fight starts right away!',
];

const STATIC_UI_ASSETS = [
  '/static/img/ui/pergaminho.webp',
  '/static/img/turnoss.webp',
  '/static/img/skills_detalhes.webp',
];

function collectImageUrls(): string[] {
  const urls = new Set<string>();
  const push = (u?: string | null) => {
    if (!u) return;
    const url = String(u).trim();
    if (url.startsWith('http') || url.startsWith('/static/') || url.startsWith('data:image')) {
      urls.add(url);
    }
  };

  try {
    getCharacters().forEach(c => {
      push(c.portrait);
      (c.skins || []).forEach(s => push((s as any).image));
      (c.skills || []).forEach(sk => push(sk.icon));
    });
  } catch {}

  try {
    getRanks().forEach(r => {
      push((r as any).imageUrl);
      push((r as any).iconUrl);
    });
  } catch {}

  try {
    getShopItems().forEach(it => {
      push(it.icon);
      push(it.frameImageUrl);
      push(it.skinImageUrl);
    });
  } catch {}

  try {
    getEvents().forEach(ev => {
      push(ev.bannerUrl);
      (ev.objectives || []).forEach(o => push((o as any).rewardFrameImageUrl));
    });
  } catch {}

  try {
    getCustomBanners().forEach(b => push((b as any).imageUrl));
  } catch {}

  try {
    getPngFrames().forEach(f => push((f as any).imageUrl));
  } catch {}

  STATIC_UI_ASSETS.forEach(push);

  return Array.from(urls);
}

export default function ArenaLoading({ onComplete }: { onComplete: () => void }) {
  const { t, language } = useLanguage();
  const [progress, setProgress] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState('');

  const messages = language === 'en' ? ARENA_MESSAGES_EN : ARENA_MESSAGES_PT;

  // Rotating message every 2.8s
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % messages.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadingDetail(t('Coletando recursos...', 'Collecting resources...'));
      const urls = collectImageUrls();

      // Quests come from the server (covers included)
      try {
        const data = await safeFetchJson<{ success?: boolean; quests?: any[] }>('/api/quests');
        if (data && data.success && Array.isArray(data.quests)) {
          data.quests.forEach(q => {
            if (q.coverUrl) urls.push(q.coverUrl);
            (q.rewards || []).forEach((rw: any) => {
              if (rw.imageUrl) urls.push(rw.imageUrl);
            });
          });
        }
      } catch {}

      const total = Math.max(urls.length, 1);
      let done = 0;
      const BATCH = 14;
      const startedAt = Date.now();

      setLoadingDetail(t('Baixando imagens e preparando o cache...', 'Downloading images and preparing the cache...'));

      for (let i = 0; i < urls.length; i += BATCH) {
        if (cancelled) return;
        const batch = urls.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map(async u => {
            await preloadImage(u);
            if (cancelled) return;
            done += 1;
            setProgress(Math.min(96, Math.round((done / total) * 100)));
          })
        );
      }

      // Minimum display time so the experience feels smooth
      const elapsed = Date.now() - startedAt;
      if (elapsed < 2000) {
        await new Promise(resolve => setTimeout(resolve, 2000 - elapsed));
      }

      if (cancelled) return;
      setLoadingDetail(t('Arena pronta! Entrando...', 'Arena ready! Entering...'));
      setProgress(100);
      setTimeout(onComplete, 600);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [onComplete, t]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-slate-950 overflow-hidden flex flex-col items-center justify-center select-none font-sans"
    >
      {/* Background glows */}
      <div className="absolute top-[-25%] left-[-15%] w-[70%] h-[70%] rounded-full bg-orange-600/15 blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-25%] right-[-15%] w-[70%] h-[70%] rounded-full bg-amber-500/10 blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08),transparent_60%)] pointer-events-none" />

      {/* Spinning shuriken ring */}
      <div className="relative mb-8 flex items-center justify-center">
        <div className="absolute w-36 h-36 rounded-full border-2 border-dashed border-orange-500/30 animate-spin" style={{ animationDuration: '14s' }} />
        <div className="absolute w-44 h-44 rounded-full border border-orange-500/10 animate-spin" style={{ animationDuration: '22s', animationDirection: 'reverse' }} />
        <div className="absolute w-28 h-28 rounded-full bg-orange-600/10 blur-xl" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
          className="relative"
        >
          <Swords className="w-16 h-16 text-orange-500 drop-shadow-[0_0_18px_rgba(249,115,22,0.6)]" />
        </motion.div>
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase bg-gradient-to-r from-white via-amber-100 to-orange-500 bg-clip-text text-transparent text-center px-4">
        {t('É um prazer ter você conosco!', 'It’s a pleasure to have you with us!')}
      </h1>

      {/* Rotating message */}
      <div className="h-12 flex items-center justify-center mt-3 max-w-lg px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="text-xs sm:text-sm text-amber-100/90 font-medium leading-relaxed"
          >
            {messages[msgIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-72 sm:w-96 mt-8">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
            <img src="/static/img/icon/star.svg" alt="Loading" className="w-3 h-3 object-contain animate-spin" />
            {loadingDetail}
          </span>
          <span className="text-xs font-mono font-black text-orange-400">{progress}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden shadow-inner">
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ ease: 'easeOut', duration: 0.3 }}
            className="h-full rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-400 relative"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
          </motion.div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-3 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
          <Flame className="w-3 h-3 text-orange-500/70" />
          {t('Naruto Arena — Vontade de Fogo', 'Naruto Arena — Will of Fire')}
          <Flame className="w-3 h-3 text-orange-500/70" />
        </div>
      </div>
    </motion.div>
  );
}
