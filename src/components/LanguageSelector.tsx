import React from 'react';
import { useLanguage, Language } from '../lib/i18n';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  className?: string;
  variant?: 'compact' | 'full' | 'pills';
  playClickSound?: () => void;
}

export default function LanguageSelector({ className = '', variant = 'compact', playClickSound }: LanguageSelectorProps) {
  const { language, setLanguage } = useLanguage();

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
