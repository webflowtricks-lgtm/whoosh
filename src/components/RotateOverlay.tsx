import React, { useState, useEffect } from 'react';
import { Smartphone, RotateCw, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function RotateOverlay() {
  const [isPortrait, setIsPortrait] = useState<boolean>(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if height is strictly greater than width (portrait orientation)
      const portrait = window.innerHeight > window.innerWidth;
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

  if (!isPortrait) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999999] bg-slate-950/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
      >
        <div className="max-w-md w-full bg-slate-900/95 border border-amber-500/40 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Animated rotating phone icon */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-orange-500/20 border border-orange-500/40 animate-ping" />
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
              <RotateCw className="w-4 h-4 animate-spin object-contain" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold font-sans text-amber-400 flex items-center justify-center gap-2">
              <Monitor className="w-5 h-5 text-orange-400" />
              Gire o seu Celular
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans font-medium">
              O jogo é exclusivamente <strong className="text-orange-400 font-bold">Widescreen / Horizontal (Landscape)</strong>. Por favor, gire seu celular de lado para liberar a arena de batalha!
            </p>
          </div>

          <div className="flex flex-col w-full gap-2.5 pt-2">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-3 py-2.5 rounded-xl shadow">
              <RotateCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Aguardando rotação da tela para iniciar...</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
