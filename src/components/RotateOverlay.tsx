import React, { useState, useEffect } from 'react';
import { Smartphone, RotateCw, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function RotateOverlay() {
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if width is smaller than height or screen width is less than 900 in portrait
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 1024;
      setIsPortrait(portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
      >
        <div className="max-w-md w-full bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Animated rotating phone icon */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-orange-500/10 border border-orange-500/30 animate-ping" />
            <motion.div
              animate={{ rotate: [0, -90, -90, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatDelay: 1,
                ease: "easeInOut"
              }}
              className="relative bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl text-orange-400"
            >
              <Smartphone className="w-12 h-12" />
            </motion.div>
            <div className="absolute bottom-0 right-0 bg-amber-500 text-slate-950 p-1.5 rounded-full shadow-lg">
              <RotateCw className="w-4 h-4 animate-spin" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold font-sans text-amber-400 flex items-center justify-center gap-2">
              <Monitor className="w-5 h-5 text-orange-400" />
              Gire o seu Dispositivo
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              O jogo foi otimizado para <strong className="text-orange-400">visualização em Desktop / Horizontal (Landscape)</strong>. Por favor, vire seu celular de lado para ter a melhor experiência visual e de batalha!
            </p>
          </div>

          <div className="flex flex-col w-full gap-2.5 pt-2">
            <div className="flex items-center justify-center gap-2 text-[11px] text-amber-300/80 bg-amber-950/40 border border-amber-500/20 px-3 py-2 rounded-xl">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Gire a tela para desaparecer esta mensagem automaticamente</span>
            </div>

            <button
              onClick={() => setDismissed(true)}
              className="mt-1 text-xs text-slate-400 hover:text-slate-200 underline decoration-slate-600 transition-colors py-1 cursor-pointer"
            >
              Continuar em modo desktop sem girar
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
