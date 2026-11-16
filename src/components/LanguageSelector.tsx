import React, { useState } from 'react';
import { useLanguage, type Language } from '../lib/i18n';
import { ChevronDown, Globe } from 'lucide-react';

interface LanguageSelectorProps {
  className?: string;
  variant?: 'compact' | 'full' | 'pills' | 'accordion';
  playClickSound?: () => void;
}

export default function LanguageSelector({ className = '', variant = 'compact', playClickSound }: LanguageSelectorProps) {
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
    return (
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          aria-expanded={isOpen}
          aria-label={t('Idioma', 'Language')}
          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-3 text-xs font-bold text-slate-200 shadow-md transition hover:border-orange-400/60 hover:text-white"
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
          <div role="group" aria-label={t('Selecione o idioma', 'Choose a language')} className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-slate-700 bg-slate-950/95 p-1 shadow-lg">
            <button
              type="button"
              onClick={() => { handleSelect('pt'); setIsOpen(false); }}
              aria-pressed={language === 'pt'}
              className={`min-h-8 rounded-lg px-2 text-[11px] font-bold transition ${language === 'pt' ? 'bg-orange-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
              title="Português (Brasil)"
            >
              🇧🇷 PT
            </button>
            <button
              type="button"
              onClick={() => { handleSelect('en'); setIsOpen(false); }}
              aria-pressed={language === 'en'}
              className={`min-h-8 rounded-lg px-2 text-[11px] font-bold transition ${language === 'en' ? 'bg-orange-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
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
