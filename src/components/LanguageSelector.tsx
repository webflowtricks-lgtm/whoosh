import React, { useState } from 'react';
import { useLanguage, type Language } from '../lib/i18n';
import { ChevronDown, Globe } from 'lucide-react';

interface LanguageSelectorProps {
  className?: string;
  variant?: 'compact' | 'full' | 'pills' | 'accordion';
  playClickSound?: () => void;
  theme?: 'default' | 'battle';
}

export default function LanguageSelector({
  className = '',
  variant = 'compact',
  playClickSound,
  theme = 'default',
}: LanguageSelectorProps) {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (lang: Language) => {
    if (playClickSound) playClickSound();
    setLanguage(lang);
  };

  if (variant === 'pills') {
    return (
      <div className={`flex items-center bg-slate-950/80 border border-slate-800 p-1 rounded-xl shadow-inner ${className}`}>
        <button
          type="button"
          onClick={() => handleSelect('pt')}
          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
            language === 'pt'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-slate-950 shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Português (Brasil)"
        >
          <span className="text-sm">🇧🇷</span>
          <span>PT</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelect('en')}
          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
            language === 'en'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-md font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="English (US)"
        >
          <span className="text-sm">🇺🇸</span>
          <span>EN</span>
        </button>
      </div>
    );
  }

  if (variant === 'accordion') {
    const battleTheme = theme === 'battle';
    return (
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          aria-expanded={isOpen}
          aria-label={t('Idioma', 'Language')}
          className={battleTheme
            ? 'battle-wood-menu-item flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer'
            : 'flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border border-orange-500/30 bg-orange-950/40 px-3 text-xs font-bold text-amber-100 shadow-md transition hover:border-orange-400/70 hover:bg-orange-900/50 hover:text-white'}
        >
          <span className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-orange-400" />
            {t('Idioma', 'Language')}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-400">{language === 'pt' ? 'PT' : 'EN'}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {isOpen && (
          <div
            role="group"
            aria-label={t('Selecione o idioma', 'Choose a language')}
            className={battleTheme
              ? 'battle-wood-menu-inset mt-1 grid grid-cols-2 gap-1 rounded-lg p-1'
              : 'mt-1 grid grid-cols-2 gap-1 rounded-xl border border-orange-500/30 bg-orange-950/65 p-1'}
          >
            <button
              type="button"
              onClick={() => { handleSelect('pt'); setIsOpen(false); }}
              aria-pressed={language === 'pt'}
              className={`min-h-8 rounded-lg border px-2 text-[11px] font-bold transition ${language === 'pt'
                ? battleTheme ? 'border-[#7a4e25] bg-[#d3ad75] text-stone-950' : 'border-orange-400 bg-orange-500 text-slate-950'
                : battleTheme ? 'border-[#7a4e25] bg-[#4a2d1b] text-[#f4d3a3] hover:bg-[#5c371f]' : 'border-orange-500/25 bg-orange-950/40 text-amber-100 hover:bg-orange-900/60'}`}
              title="Português (Brasil)"
            >
              🇧🇷 PT
            </button>
            <button
              type="button"
              onClick={() => { handleSelect('en'); setIsOpen(false); }}
              aria-pressed={language === 'en'}
              className={`min-h-8 rounded-lg border px-2 text-[11px] font-bold transition ${language === 'en'
                ? battleTheme ? 'border-[#7a4e25] bg-[#d3ad75] text-stone-950' : 'border-orange-400 bg-orange-500 text-slate-950'
                : battleTheme ? 'border-[#7a4e25] bg-[#4a2d1b] text-[#f4d3a3] hover:bg-[#5c371f]' : 'border-orange-500/25 bg-orange-950/40 text-amber-100 hover:bg-orange-900/60'}`}
              title="English (US)"
            >
              🇺🇸 EN
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 p-1 rounded-xl shadow-md backdrop-blur-md ${className}`}>
      <Globe className="w-3.5 h-3.5 text-orange-400 ml-1.5" />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleSelect('pt')}
          className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer ${
            language === 'pt'
              ? 'bg-orange-500 text-slate-950 shadow-sm font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Português (Brasil)"
        >
          <span>🇧🇷</span>
          <span>PT</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelect('en')}
          className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer ${
            language === 'en'
              ? 'bg-orange-500 text-slate-950 shadow-sm font-black'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="English (US)"
        >
          <span>🇺🇸</span>
          <span>EN</span>
        </button>
      </div>
    </div>
  );
}
