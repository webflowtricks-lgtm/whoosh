import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'pt' | 'en';

const LANGUAGE_KEY = 'ninja_app_language';

let currentLanguage: Language = (typeof window !== 'undefined' && (localStorage.getItem(LANGUAGE_KEY) as Language)) || 'pt';
const subscribers: Set<(lang: Language) => void> = new Set();

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_KEY, lang);
  }
  subscribers.forEach((cb) => cb(lang));
}

export function subscribeLanguage(cb: (lang: Language) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Universal translation helper function.
 * Pass Portuguese and English strings directly:
 * t('Entrar na Arena', 'Enter Arena')
 */
export function t(ptText: string, enText: string): string {
  return currentLanguage === 'en' ? enText : ptText;
}

/**
 * Game Text Translator: Converts Portuguese game strings (skill descriptions, quest desc, etc.)
 * into clear English when English is selected.
 */
export function translateGameText(text: string | undefined | null, lang: Language = currentLanguage): string {
  if (!text) return '';
  if (lang === 'pt') return text;

  let translated = text;

  const exactMatches: Record<string, string> = {
    "Descreva os objetivos épicos desta missão para os shinobis.": "Describe the epic objectives of this quest for shinobis.",
    "O Último Espelho de Gelo": "The Last Ice Mirror",
    "Nova Missão Lendária": "New Legendary Quest",
    "Nova Missão Lendária 2": "New Legendary Quest 2",
    "Guerreiro do Amanhecer": "Dawn Warrior",
    "Estudante de Academia": "Academy Student",
    "Estudante Shinobi": "Shinobi Student",
    "Vila da Folha": "Leaf Village",
    "Vila da Areia": "Sand Village",
    "Vila da Névoa": "Mist Village",
    "Vila da Nuvem": "Cloud Village",
    "Vila da Pedra": "Stone Village",
    "Vila da Folha (Konoha)": "Leaf Village (Konoha)",
    "Inimigo Único": "Single Enemy",
    "Todos os Inimigos": "All Enemies",
    "Próprio": "Self",
    "Si mesmo": "Self",
    "Aliado Único": "Single Ally",
    "Todos os Aliados": "All Allies",
    "Físico": "Physical",
    "Chakra": "Chakra",
    "Mental": "Mental",
    "Aflição": "Affliction",
    "Corpo a Corpo": "Melee",
    "Distância": "Ranged",
    "Estratégia": "Strategy",
    "Sangramento": "Bleeding",
    "Invisível": "Invisible",
    "Desconhecido": "Unknown",
  };

  if (exactMatches[translated.trim()]) {
    return exactMatches[translated.trim()];
  }

  // Regex and pattern replacements for skill descriptions & quest descriptions
  const replacements: [RegExp, string][] = [
    [/Descreva os objetivos épicos desta missão para os shinobis\./gi, "Describe the epic objectives of this quest for shinobis."],
    [/causa (\d+) de dano físico/gi, "deals $1 physical damage"],
    [/causa (\d+) de dano de chakra/gi, "deals $1 chakra damage"],
    [/causa (\d+) de dano mental/gi, "deals $1 mental damage"],
    [/causa (\d+) de dano verdadeiro/gi, "deals $1 true damage"],
    [/causa (\d+) de dano de aflição/gi, "deals $1 affliction damage"],
    [/causa (\d+) de dano direto/gi, "deals $1 direct damage"],
    [/causa (\d+) de dano por turno/gi, "deals $1 damage per turn"],
    [/causa (\d+) de dano adicional/gi, "deals $1 additional damage"],
    [/causa (\d+) de dano/gi, "deals $1 damage"],
    [/causando (\d+) de dano/gi, "dealing $1 damage"],
    [/de dano físico/gi, "physical damage"],
    [/de dano de chakra/gi, "chakra damage"],
    [/de dano mental/gi, "mental damage"],
    [/de dano verdadeiro/gi, "true damage"],
    [/de dano de aflição/gi, "affliction damage"],
    [/de dano direto/gi, "direct damage"],
    [/de dano por turno/gi, "damage per turn"],
    [/de dano adicional/gi, "additional damage"],
    [/de dano/gi, "damage"],
    [/a um inimigo/gi, "to an enemy"],
    [/a todos os inimigos/gi, "to all enemies"],
    [/a um aliado/gi, "to an ally"],
    [/a todos os aliados/gi, "to all allies"],
    [/a si mesmo/gi, "to self"],
    [/atordoando-o por (\d+) turno/gi, "stunning them for $1 turn"],
    [/atordoando-o por (\d+) turnos/gi, "stunning them for $1 turns"],
    [/atordoando-os por (\d+) turnos/gi, "stunning them for $1 turns"],
    [/por (\d+) turnos/gi, "for $1 turns"],
    [/por (\d+) turno/gi, "for $1 turn"],
    [/reduz o dano recebido em (\d+)/gi, "reduces damage received by $1"],
    [/redução de dano fixa/gi, "fixed damage reduction"],
    [/redução de dano/gi, "damage reduction"],
    [/concedendo (\d+) pontos de/gi, "granting $1 points of"],
    [/concede (\d+) pontos de/gi, "grants $1 points of"],
    [/pontos de escudo/gi, "shield points"],
    [/pontos de vida/gi, "health points"],
    [/cura (\d+) de HP/gi, "heals $1 HP"],
    [/cura (\d+) HP/gi, "heals $1 HP"],
    [/curando (\d+) de HP/gi, "healing $1 HP"],
    [/requer que \[(.*?)\] esteja ativo/gi, "requires [$1] to be active"],
    [/requer que \[(.*?)\] estejam ativos/gi, "requires [$1] to be active"],
    [/de recarga/gi, "cooldown"],
    [/tornando-se invulnerável a todas as habilidades recebidas/gi, "becoming invulnerable to all incoming skills"],
    [/tornando-se invulnerável/gi, "becoming invulnerable"],
    [/a todas as habilidades/gi, "to all skills"],
    [/a um alvo/gi, "to a target"],
    [/Aumenta o dano causado em (\d+)/gi, "Increases damage dealt by $1"],
    [/Reduz o dano causado em (\d+)/gi, "Decreases damage dealt by $1"],
    [/Cria vários clones/gi, "Creates several clones"],
    [/distrai um inimigo/gi, "distracts an enemy"],
    [/atinge um inimigo com/gi, "strikes an enemy with"],
  ];

  for (const [pattern, replacement] of replacements) {
    translated = translated.replace(pattern, replacement);
  }

  return translated;
}

export function translateTargetType(targetType: string | undefined, lang: Language = currentLanguage): string {
  if (!targetType) return '';
  if (lang === 'pt') {
    switch (targetType) {
      case 'Enemy': return 'Inimigo Único';
      case 'AllEnemies': return 'Todos os Inimigos';
      case 'Self': return 'Próprio';
      case 'Ally': return 'Aliado Único';
      case 'AllAllies': return 'Todos os Aliados';
      case 'AnyLiving': return 'Qualquer Personagem Vivo';
      default: return targetType;
    }
  } else {
    switch (targetType) {
      case 'Enemy': return 'Single Enemy';
      case 'AllEnemies': return 'All Enemies';
      case 'Self': return 'Self';
      case 'Ally': return 'Single Ally';
      case 'AllAllies': return 'All Allies';
      case 'AnyLiving': return 'Any Living Character';
      default: return targetType;
    }
  }
}

export function translateSkillName(skillName: string | undefined, lang: Language = currentLanguage): string {
  if (!skillName) return '';
  if (lang === 'pt') return skillName;
  const namesMap: Record<string, string> = {
    "Clone de Sombra": "Shadow Clone",
    "Técnica de Substituição": "Substitution Technique",
    "Selamento de Chakra": "Chakra Seal",
    "Bola de Fogo": "Fireball",
    "Aflição": "Affliction",
    "Paralisia de Cooldown": "Cooldown Paralyze",
  };
  return namesMap[skillName] || skillName;
}

export function translateSkillDesc(desc: string | undefined, lang: Language = currentLanguage): string {
  return translateGameText(desc, lang);
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (pt: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'pt',
  setLanguage: () => {},
  t: (pt: string, en: string) => pt,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLang] = useState<Language>(getLanguage());

  useEffect(() => {
    const unsubscribe = subscribeLanguage((newLang) => {
      setLang(newLang);
    });
    return unsubscribe;
  }, []);

  const handleSetLanguage = (newLang: Language) => {
    setLanguage(newLang);
  };

  const translate = (pt: string, en: string) => {
    return language === 'en' ? en : pt;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
