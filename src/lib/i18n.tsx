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
    [/^🔥 CHAKRA REMOVIDO: (.+) removeu (\d+) chakra \((.+)\) do estoque do oponente!$/i, "🔥 CHAKRA REMOVED: $1 removed $2 chakra ($3) from the opponent's pool!"],
    [/^🔥 (.+) removeu (\d+) chakra \((.+)\) do estoque de seu time!$/i, "🔥 $1 removed $2 chakra ($3) from your team's pool!"],
    [/^🔥 (.+) removeu (\d+) chakra \((.+)\) do estoque de seu oponente!$/i, "🔥 $1 removed $2 chakra ($3) from your opponent's pool!"],
    [/^🔥 (.+) removeu (\d+) chakra do estoque de seu time!$/i, "🔥 $1 removed $2 chakra from your team's pool!"],
    [/^🔥 (.+) removeu (\d+) chakra do estoque de seu oponente!$/i, "🔥 $1 removed $2 chakra from your opponent's pool!"],
    [/remoção de chakra/gi, "Chakra Removal"],
    [/chakra removido/gi, "CHAKRA REMOVED"],
    [/remocao chakra continua/gi, "CONTINUOUS CHAKRA REMOVAL"],
    [/dreno chakra continuo/gi, "CONTINUOUS CHAKRA DRAIN"],
    [/roubo chakra continuo/gi, "CONTINUOUS CHAKRA STEAL"],
    [/^Daqui a (\d+) turno\(s\), fica invulnerável a (.+?) por (.+)$/i, "In $1 turn(s), becomes invulnerable to $2 for $3"],
    [/^Daqui a (\d+) turno\(s\), fica invulnerável (.+?) por (.+)$/i, "In $1 turn(s), becomes invulnerable $2 for $3"],
    [/^Fica com INVULNERABILIDADE TOTAL a (.+?) por (.+)$/i, "Becomes fully invulnerable to $1 for $2"],
    [/^Fica com INVULNERABILIDADE TOTAL (.+?) por (.+)$/i, "Becomes fully invulnerable $1 for $2"],
    [/^Fica invulnerável a (.+?) por (.+)$/i, "Becomes invulnerable to $1 for $2"],
    [/^Fica invulnerável (.+?) por (.+)$/i, "Becomes invulnerable $1 for $2"],
    [/todos os danos e efeitos/gi, "all damage and effects"],
    [/^🚑 Enquanto este efeito estiver ativo, o portador NÃO pode ser curado$/i, "While this effect is active, its holder cannot be healed"],
    [/^Devolve (\d+) de (dano direto|dano) a quem atacar por (.+?)(?: \(acumula por stack\))?$/i, "Deals $1 $2 back to anyone who attacks for $3"],
    [/^Pode mirar e atingir inimigos invulneráveis mesmo com a invulnerabilidade ativa$/i, "Can target and hit invulnerable enemies even while invulnerability is active"],
    [/^Cada skill usada pelo alvo ganha \+(\d+) de cooldown por (.+)$/i, "Each skill used by the target gains +$1 cooldown for $2"],
    [/^Inimigo recebe \+(\d+) de dano extra( de classes \([^)]+\))? por (.+)$/i, "Enemy takes +$1 bonus damage$2 for $3"],
    [/ de classes \(([^)]+)\)/gi, " from classes ($1)"],
    [/^Imune a todo dano por (.+)$/i, "Immune to all damage for $1"],
    [/^Imune apenas ao PRIMEIRO dano recebido \(a imunidade é consumida após bloquear\)$/i, "Immune only to the first damage hit; the immunity is consumed after blocking"],
    [/^Imune ao dano \(Todos os tipos\) \(só o 1º dano\) por (.+)$/i, "Immune to the first hit of all damage for $1"],
    [/^Imune ao dano \(Todos os tipos\) por (.+)$/i, "Immune to all damage for $1"],
    [/^Imune ao dano \((.+?)\)(?: \(só o 1º dano\))? por (.+)$/i, "Immune to damage types ($1) for $2"],
    [/^O dano recebido \((.+?)\) \(só o 1º dano\) vira escudo(.*?) durante (.+)$/i, "Damage received ($1) (first hit only)$2 becomes a shield during $3"],
    [/^O dano recebido \((.+?)\) vira escudo(.*?) durante (.+)$/i, "Damage received ($1)$2 becomes a shield during $3"],
    [/^Reflete a próxima habilidade recebida \((.+?)\) por (.+)$/i, "Reflects the next incoming skill ($1) for $2"],
    [/^Anula TODAS as habilidades ofensivas usadas pelo alvo por (.+)$/i, "Nullifies all offensive skills used by the target for $1"],
    [/^Anula TODAS as habilidades recebidas pelo alvo por (.+)$/i, "Nullifies all skills received by the target for $1"],
    [/^Anula somente a 1ª habilidade ofensivas usadas pelo alvo por (.+)$/i, "Nullifies only the first offensive skill used by the target for $1"],
    [/^Anula somente a 1ª habilidade recebidas pelo alvo por (.+)$/i, "Nullifies only the first skill received by the target for $1"],
    [/^Remove os efeitos de Contra-Ataque e Refletir do alvo$/i, "Removes the target's Counter and Reflect effects"],
    [/^Fica imortal por (.+?) ao usar ou quando tiver (\d+) ou menos de vida$/i, "Becomes immortal for $1 when used or at $2 HP or below"],
    [/^Fica imortal por (.+?) quando tiver (\d+) ou menos de vida$/i, "Becomes immortal for $1 at $2 HP or below"],
    [/^Fica imortal por (.+?) Ao usar a habilidade$/i, "Becomes immortal for $1 when this skill is used"],
    [/^Stack passiva: cada uso adiciona \+1 ressurreição; ao morrer, 1 é consumida e ressuscita com (\d+) de vida$/i, "Passive stack: each use adds 1 resurrection; on death, one is consumed and the character revives with $1 HP"],
    [/^Efeitos ocultos do oponente por (.+)$/i, "Opponent's hidden effects for $1"],
    [/^Remove escudos ativos por (.+)$/i, "Removes active shields for $1"],
    [/^Paralisa cooldowns por (.+)$/i, "Freezes cooldowns for $1"],
    [/^Marca o alvo até de fato contra-atacar \(∞ turnos, sai ao acionar\) nas skills ofensivas usadas por ele \(apenas classes: (.+)\)$/i, "Marks the target until the counterattack triggers (infinite duration, removed when triggered) on offensive skills they use (classes only: $1)"],
    [/^Marca o alvo até de fato contra-atacar \(∞ turnos, sai ao acionar\) nas skills ofensivas usadas por ele$/i, "Marks the target until the counterattack triggers (infinite duration, removed when triggered) on offensive skills they use"],
    [/^Marca o alvo até de fato contra-atacar \(∞ turnos, sai ao acionar\) nas skills recebidas por ele \(apenas classes: (.+)\)$/i, "Marks the target until the counterattack triggers (infinite duration, removed when triggered) on skills they receive (classes only: $1)"],
    [/^Marca o alvo até de fato contra-atacar \(∞ turnos, sai ao acionar\) nas skills recebidas por ele$/i, "Marks the target until the counterattack triggers (infinite duration, removed when triggered) on skills they receive"],
    [/^Dano Base \((\d+)\) \+ (\d+) de (.+?) a cada (\d+) de HP perdido \((.+)\)$/i, "Base damage ($1) + $2 $3 for every $4 missing HP ($5)"],
    [/^Causa (.+?) igual a todo o HP perdido do Conjurador$/i, "Deals $1 equal to all HP lost by the caster"],
    [/^Sofre (\d+) de (.+?) a cada skill usada por (.+)$/i, "Takes $1 $2 each time a skill is used for $3"],
    [/^Sofre (\d+) de dano de aflição ao usar$/i, "Takes $1 affliction damage when used"],
    [/^Por (.+?), se o conjurador OU o alvo morrer, o outro também morre\.$/i, "For $1, if the caster OR target dies, the other dies too."],
    [/^Reduz o dano causado pelo inimigo em (\d+) por (.+)$/i, "Reduces the enemy's damage dealt by $1 for $2"],
    [/^Incapaz de reduzir dano por (.+)$/i, "Cannot reduce damage for $1"],
    [/^Incapaz de ficar invulnerável por (.+)$/i, "Cannot become invulnerable for $1"],
    [/^Incapaz de receber habilidades amigáveis por (.+)$/i, "Cannot receive friendly skills for $1"],
    [/^TODOS os efeitos amigáveis \((.+)\) são ignorados por (.+)$/i, "All friendly effects ($1) are ignored for $2"],
    [/^Aumenta o custo \(\+1 (.+?)\) das habilidades de (.+?) por (.+)$/i, "Increases the cost of $2 skills by 1 $1 for $3"],
    [/^Aumenta o custo \(\+1 (.+?)\) por (.+)$/i, "Increases skill cost by 1 $1 for $2"],
    [/^MATA instantaneamente o Oponente que estiver com (.+?) ativo nele/i, "Instantly kills the opponent with $1 active"],
    [/^IGNORA a invulnerabilidade quando (.+?) estiver ativo (em MIM|no Oponente)$/i, "Ignores invulnerability when $1 is active $2"],
    [/^STUNNA o inimigo por (.+?) \((.+?)\) quando (.+?) estiver ativo (em MIM|no Oponente)$/i, "Stuns the enemy for $1 ($2) when $3 is active $4"],
    [/^Concede \+(\d+) de escudo a MIM por (.+?) quando (.+?) estiver ativo (em MIM|no Oponente)$/i, "Grants +$1 shield to self for $2 when $3 is active $4"],
    [/^Concede \+(\d+) de escudo a MIM quando (.+?) estiver ativo (em MIM|no Oponente)$/i, "Grants +$1 shield to self when $2 is active $3"],
    [/^Concede \+(\d+) de escudo a TODA a minha equipe por (.+?) quando (.+?) estiver ativo (em MIM|no Oponente)$/i, "Grants +$1 shield to my entire team for $2 when $3 is active $4"],
    [/^Concede \+(\d+) de escudo a TODA a minha equipe quando (.+?) estiver ativo (em MIM|no Oponente)$/i, "Grants +$1 shield to my entire team when $2 is active $3"],
    [/e a vida dele estiver com HP ≤ (\d+)/gi, "if their HP is $1 or lower"],
    [/— e VOCÊ também morre \(sacrifício\)/gi, "— you also die as a sacrifice"],
    [/a TODA a minha equipe/gi, "to my entire team"],
    [/\bTODA a minha equipe\b/gi, "my entire team"],
    [/\bMIM\b/g, "self"],
    [/\bStun Completo\b/gi, "Full stun"],
    [/todos os tipos/gi, "all types"],
    [/só o 1º dano/gi, "first hit only"],
    [/de volta pro atacante/gi, "back to the attacker"],
    [/para um aliado aleatório/gi, "to a random ally"],
    [/ofensivas/gi, "offensive"],
    [/usadas pelo alvo/gi, "used by the target"],
    [/recebidas pelo alvo/gi, "received by the target"],
    [/em MIM/gi, "on self"],
    [/no Oponente/gi, "on the opponent"],
    [/redução de dano/gi, "damage reduction"],
    [/a todo dano e efeito negativo/gi, "to all damage and negative effects"],
    [/a todas as classes de dano/gi, "to all damage classes"],
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
    [/de dano recebido/gi, "damage received"],
    [/de dano causado/gi, "damage dealt"],
    [/de dano extra/gi, "bonus damage"],
    [/^Remove (\d+) chakra \(Aleatório\) por (.+)$/i, "Remove $1 random chakra for $2"],
    [/^Remove (\d+) chakra \(Escolha\) por (.+)$/i, "Remove $1 chosen chakra for $2"],
    [/^Custa (\d+) Chakra Aleatório a menos enquanto (.+) estiver ativo$/i, "Costs $1 less random chakra while $2 is active"],
    [/^Custa (\d+) (Tai|Nin|Gen|Blood) a menos enquanto (.+) estiver ativo$/i, "Costs $1 less $2 chakra while $3 is active"],
    [/^Skills do alvo custam -(\d+) (.+) por (.+)$/i, "The target's skills cost $1 less $2 for $3"],
    [/^Custo alterado para \[(.+)\] quando (.+) estiver ativo$/i, "Cost changes to [$1] when $2 is active"],
    [/^Drena (\d+) chakra por turno por (.+)$/i, "Drains $1 chakra per turn for $2"],
    [/^Rouba (\d+) chakra aleatório por (.+)$/i, "Steals $1 random chakra for $2"],
    [/^Gera (\d+) chakra por turno por (.+?)(?: \(aleatório\))?$/i, "Generates $1 random chakra per turn for $2"],
    [/^Imune a stuns por (.+)$/i, "Immune to stuns for $1"],
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
    [/ao usar a skill/gi, "when using the skill"],
    [/^Remove (\d+) chakra aleatório do estoque inimigo quando (.+) estiver ativo$/i, "Remove $1 random chakra from the enemy pool when $2 is active"],
    [/^Rouba (\d+) chakra aleatório do estoque inimigo quando (.+) estiver ativo(.*)$/i, "Steals $1 random chakra from the enemy pool when $2 is active$3"],
    [/quando (.*?) estiver ativo/gi, "when $1 is active"],
    [/^Remover Chakra \((.+)\)$/i, "Remove Chakra ($1)"],
    [/^Roubar Chakra \((.+)\)$/i, "Steal Chakra ($1)"],
    [/^Drenar Chakra \((.+)\)$/i, "Drain Chakra ($1)"],
    [/^Gerar Chakra \((.+)\)$/i, "Generate Chakra ($1)"],
    [/^Regra de Dano \((.+)\)$/i, "Damage Rule ($1)"],
    [/^Execução Instantânea \((.+)\)$/i, "Instant Execution ($1)"],
    [/^Ignorar Invuln\. \((.+)\)$/i, "Ignore Invulnerability ($1)"],
    [/^Stun Condicional \((.+)\)$/i, "Conditional Stun ($1)"],
    [/^Escudo Condicional \((.+)\)$/i, "Conditional Shield ($1)"],
    [/^Sem Contra-Ataque\/Reflexo Condicional \((.+)\)$/i, "Cannot Be Countered/Reflected ($1)"],
    [/^Novo Alvo \((.+)\)$/i, "New Target ($1)"],
    [/^Novo Cooldown \((.+)\)$/i, "New Cooldown ($1)"],
    [/^Reduzir Recarga \((.+)\)$/i, "Reduce Cooldown ($1)"],
    [/^Cura Extra \((.+)\)$/i, "Bonus Healing ($1)"],
    [/^Novo Custo \((.+)\)$/i, "New Cost ($1)"],
    [/^Custo Reduzido \((.+)\)$/i, "Reduced Cost ($1)"],
    [/^Dano por Stack em Mim \((.+)\)$/i, "Damage per Stack on Me ($1)"],
    [/^Dano por Stack no Alvo \((.+)\)$/i, "Damage per Stack on Target ($1)"],
    [/^Mudança de Alvo \((.+)\)$/i, "Target Change ($1)"],
    [/^Dano Adicional \((.+)\)$/i, "Bonus Damage ($1)"],
    [/reduz a recarga atual de/gi, "reduces the current cooldown of"],
    [/reduzir a recarga atual de/gi, "reduce the current cooldown of"],
    [/em (\d+) turno\(s\)/gi, "by $1 turn(s)"],
    [/dano por stack em mim/gi, "damage per stack on me"],
    [/dano por stack no alvo/gi, "damage per stack on the target"],
    [/aumenta o ataque/gi, "increases the attack"],
    [/de recarga/gi, "of cooldown"],
    [/a cada habilidade/gi, "each skill"],
    [/cada habilidade/gi, "each skill"],
    [/a partir do próximo turno/gi, "starting next turn"],
    [/não pode usar qualquer habilidade/gi, "cannot use any skill"],
    [/não pode usar habilidades das categorias/gi, "cannot use skills in these categories"],
    [/enquanto este efeito estiver ativo/gi, "while this effect is active"],
    [/esta habilidade/gi, "this skill"],
    [/a habilidade/gi, "the skill"],
    [/suas habilidades/gi, "your skills"],
    [/este personagem/gi, "this character"],
    [/o oponente/gi, "the opponent"],
    [/a equipe/gi, "the team"],
    [/um aliado/gi, "an ally"],
    [/todos os efeitos amigáveis/gi, "all friendly effects"],
    [/danos e efeitos/gi, "damage and effects"],
    [/em (\d+) turnos?/gi, "in $1 turns"],
    [/bloqueia apenas habilidades ofensivas do alvo por (\d+) turnos?/gi, "blocks only the target's offensive skills for $1 turns"],
    [/habilidades amigáveis ou em si mesmo continuam liberadas/gi, "friendly or self-targeted skills remain available"],
    [/pode mirar e atingir inimigos invulneráveis mesmo com a invulnerabilidade ativa/gi, "can target and hit invulnerable enemies even while invulnerability is active"],
    [/esta habilidade não pode ser contra-atacada ou anulada/gi, "this skill cannot be countered or nullified"],
    [/esta habilidade não pode ser refletida/gi, "this skill cannot be reflected"],
    [/remove ([^.!]+) do alvo/gi, "removes $1 from the target"],
    [/do alvo curado/gi, "from the healed target"],
    [/do alvo/gi, "from the target"],
    [/no alvo/gi, "on the target"],
    [/no conjurador \(mim\)/gi, "on the caster (self)"],
    [/conjurador \(mim\)/gi, "caster (self)"],
    [/em todos os combatentes/gi, "on all combatants"],
    [/em si mesmo/gi, "on self"],
    [/em mim/gi, "on me"],
    [/no inimigo/gi, "on the enemy"],
    [/nos inimigos/gi, "on enemies"],
    [/nos aliados/gi, "on allies"],
    [/a cada acúmulo/gi, "for each stack"],
    [/acúmulo(s)? \(stack\)/gi, "stack$1"],
    [/por tempo indeterminado/gi, "indefinitely"],
    [/consome (\d+) stack\(s\)/gi, "consumes $1 stack(s)"],
    [/turno\(s\)/gi, "turn(s)"],
    [/turnos/gi, "turns"],
    [/turno/gi, "turn"],
    [/\bpor\b/gi, "for"],
    [/alvo principal/gi, "main target"],
    [/\balvo\b/gi, "target"],
    [/\bfísico\b/gi, "physical"],
    [/\bdistância\b/gi, "ranged"],
    [/\bamigável\b/gi, "friendly"],
    [/\baleatório\b/gi, "random"],
    [/\bcuras\b/gi, "healing"],
    [/dano normal/gi, "normal damage"],
    [/dano direto/gi, "direct damage"],
    [/dano atrasado/gi, "delayed damage"],
    [/dano de aflição/gi, "affliction damage"],
    [/dano de sangramento/gi, "bleeding damage"],
    [/dano de queimadura/gi, "burn damage"],
    [/dano verdadeiro/gi, "true damage"],
    [/dano perfurante/gi, "piercing damage"],
    [/aumento de dano/gi, "damage increase"],
    [/dano causado/gi, "damage dealt"],
    [/dano recebido/gi, "damage received"],
    [/de cura/gi, "healing"],
    [/cura contínua/gi, "continuous healing"],
    [/bloqueio de cura/gi, "healing block"],
    [/de escudo/gi, "shield"],
    [/escudo/gi, "shield"],
    [/cura/gi, "healing"],
    [/dano/gi, "damage"],
    [/aflição/gi, "affliction"],
    [/sangramento/gi, "bleeding"],
    [/queimadura/gi, "burn"],
    [/atordoamento/gi, "stun"],
    [/vulnerabilidade/gi, "vulnerability"],
    [/invisibilidade/gi, "invisibility"],
    [/invulnerabilidade/gi, "invulnerability"],
    [/acúmulos?/gi, "stacks"],
    [/conjurador/gi, "caster"],
    [/condicional/gi, "conditional"],
    [/direto/gi, "direct"],
    [/infinito/gi, "infinite"],
    [/não pode matar/gi, "cannot kill"],
    [/habilidades/gi, "skills"],
    [/habilidade/gi, "skill"],
    [/\bganha\b/gi, "gains"],
    [/\bganhar\b/gi, "gain"],
    [/\breduz\b/gi, "reduces"],
    [/\baumenta\b/gi, "increases"],
    [/\brecebe\b/gi, "takes"],
    [/\breceber\b/gi, "receive"],
    [/\bregenera\b/gi, "regenerates"],
    [/\bvida\b/gi, "health"],
    [/\bpara\b/gi, "for"],
    [/\bquando\b/gi, "when"],
    [/\bestiver\b/gi, "is"],
    [/\bativo(s|a|as)?\b/gi, "active"],
    [/\benquanto\b/gi, "while"],
    [/\bcom\b/gi, "with"],
    [/\besta\b/gi, "this"],
    [/\beste\b/gi, "this"],
    [/\bseus?\b/gi, "your"],
    [/^gains\b/i, "Gains"],
    [/^reduces\b/i, "Reduces"],
    [/\brecarga\b/gi, "cooldown"],
    [/\batual\b/gi, "current"],
    [/\brecebido(s|a|as)?\b/gi, "received"],
    [/\bcausado(s|a|as)?\b/gi, "dealt"],
    [/\badicional\b/gi, "additional"],
    [/\bfixa\b/gi, "fixed"],
    [/\bdurante\b/gi, "for"],
    [/mín\./gi, "min."],
    [/\bem\b/gi, "on"],
    [/\bde\b/gi, "of"],
  ];

  for (const [pattern, replacement] of replacements) {
    translated = translated.replace(pattern, replacement);
  }

  return translated;
}

const configuredEnglishText: Record<string, string> = {
  'Renegado S-Rank': 'S-Rank Rogue',
  ESTUDANTE: 'STUDENT',
  'Dano Normal': 'Normal Damage',
  'Dano Direto': 'Direct Damage',
  'Dano Atrasado': 'Delayed Damage',
  'Dano Direto Atrasado': 'Delayed Direct Damage',
  'Dano de Aflição': 'Affliction Damage',
  'Dano de Sangramento': 'Bleeding Damage',
  'Dano de Queimadura': 'Burn Damage',
  'Dano Verdadeiro': 'True Damage',
  'Dano Perfurante': 'Piercing Damage',
  'Cura Contínua': 'Continuous Healing',
  Cura: 'Healing',
  'Bloqueio de Cura': 'Healing Block',
  'Escudo por Turno (Adicional)': 'Additional Shield per Turn',
  'Escudo por Stack': 'Shield per Stack',
  'Redução de Dano': 'Damage Reduction',
  'Aumento de Dano': 'Damage Increase',
  Retaliação: 'Retaliation',
  'Stun Ofensivo (Impedimento Ofensivo)': 'Offensive Stun (Offensive Block)',
  'Atordoar (Stun)': 'Stun',
  'Escudo (Shield)': 'Shield',
  'Dano Bônus p/ HP Perdido': 'Bonus Damage per Missing HP',
  'Dano = HP Perdido': 'Damage = Missing HP',
  'Punição por Habilidade': 'Skill Punishment',
  'Dano Contínuo (DoT)': 'Damage over Time (DoT)',
  'Sangramento (Bleeding)': 'Bleeding',
  'Aflição (Aflicção)': 'Affliction',
  'Aflição Instantânea': 'Instant Affliction',
  'Vínculo de Morte': 'Death Link',
  'Reduz Dano do Inimigo': 'Reduce Enemy Damage',
  'Vulnerabilidade de Classe': 'Class Vulnerability',
  'Paralisar Cooldown': 'Paralyze Cooldown',
  'Aumentar Cooldown': 'Increase Cooldown',
  'Imunidade a Dano': 'Damage Immunity',
  'Destruir Escudos': 'Destroy Shields',
  'Remover Contra-Ataques e Refletir': 'Remove Counters and Reflect',
  'Invulnerabilidade Total': 'Total Invulnerability',
  'Invulnerabilidade (Desvio)': 'Invulnerability (Evasion)',
  'Invulnerabilidade Atrasada': 'Delayed Invulnerability',
  'Contra-Ataque (Anular)': 'Counter (Nullify)',
  'Stack no Contra-Ataque': 'Stack on Counter',
  'Dano ao ser Contra-Atacada': 'Damage When Countered',
  'Dano Bônus no Contra-Ataque': 'Bonus Damage on Counter',
  'Buff de Dano no Contra-Ataque': 'Damage Buff on Counter',
  'Stun no Contra-Ataque': 'Stun on Counter',
  'Dano Adicional': 'Bonus Damage',
  'Gerar Chakra': 'Generate Chakra',
  'Drenar Chakra': 'Drain Chakra',
  'Remover Chakra': 'Remove Chakra',
  'Remoção de Chakra': 'Chakra Removal',
  'Chakra Removido': 'Chakra Removed',
  'Roubar Chakra': 'Steal Chakra',
  'Aumentar Custo de Chakra': 'Increase Chakra Cost',
  'Reduzir Custo de Chakra': 'Reduce Chakra Cost',
  'Incapaz de Ficar Invulnerável': 'Cannot Become Invulnerable',
  'Incapaz de Reduzir Dano': 'Cannot Reduce Damage',
  'Incapaz de Receber Skills Amigáveis': 'Cannot Receive Friendly Skills',
  'Anulação de Efeitos Amigáveis': 'Friendly Effect Nullification',
  'Ignorar Stun': 'Ignore Stun',
  'Imortalidade Condicional': 'Conditional Immortality',
  Ressurreição: 'Resurrection',
  'Efeitos Invisíveis': 'Hidden Effects',
  'Conversão de Dano em Escudo': 'Damage-to-Shield Conversion',
  'Sofrer Dano': 'Take Damage',
  'Limpeza de Debuffs': 'Debuff Removal',
  'Limpeza de Buffs': 'Buff Removal',
  'Limpeza ao Curar': 'Cleanse on Heal',
  'Ignorar Invulnerabilidade': 'Ignore Invulnerability',
  'Incontra-atacável': 'Uncounterable',
  'Irrefletível': 'Unreflectable',
  'Alvo Principal': 'Main Target',
  'Conjurador (Mim)': 'Caster (Self)',
  'Portador do Efeito': 'Effect Holder',
  Condicional: 'Conditional',
  'Todos os Tipos': 'All Types',
  Infinito: 'Infinite',
  'Bloqueio de Efeitos Amigáveis': 'Friendly Effect Block',
  EVENTO: 'EVENT',
  'EVENTO NARUTO': 'NARUTO EVENT',
  'EVENTO UCHIHA': 'UCHIHA EVENT',
  'EVENTO PRINCIPAL': 'MAIN EVENT',
  FESTIVAL: 'FESTIVAL',
  'DESAFIO ESPECIAL': 'SPECIAL CHALLENGE',
  'Evento Limitado': 'Limited-Time Event',
  'Evento especial': 'Special Event',
  'Evento ativo': 'Event active',
  'Evento encerrado': 'Event ended',
  '4 dias 18 horas': '4 days 18 hours',
  '11 dias': '11 days',
  '2 dias 05 horas': '2 days 05 hours',
  'Evento Ninja': 'Ninja Event',
  Ativo: 'Active',
  'Naruto: O Início de uma Lenda': 'Naruto: The Beginning of a Legend',
  PRONTO: 'READY',
  metas: 'goals',
  'das metas completas': 'of goals completed',
  METAS: 'GOALS',
  COMPLETAS: 'COMPLETED',
  Resgatado: 'Claimed',
  Resgatando: 'Claiming',
  Resgatar: 'Claim',
  'Em andamento': 'In progress',
  'Fechar eventos': 'Close events',
  'resgatado!': 'claimed!',
  'Recompensa:': 'Reward:',
  'Prêmio surpresa': 'Surprise reward',
  Moedas: 'Coins',
  moedas: 'coins',
  Ryos: 'Ryos',
  Gems: 'Gems',
  '500 moedas': '500 coins',
  '300 moedas': '300 coins',
  '50 Ryos': '50 Ryos',
  '40 Ryos': '40 Ryos',
  'Título: "Herói da Aliança"': 'Title: "Alliance Hero"',
  'Moldura Exclusiva "Guerra Shinobi"': 'Exclusive "Shinobi War" Frame',
  'Título: "Caçador de Renegados"': 'Title: "Rogue Hunter"',
  '4ª Grande Guerra Shinobi': 'Fourth Great Shinobi War',
  'Evento de Batalha Global de Aliança': 'Global Alliance Battle Event',
  'A Aliança Shinobi precisa da sua força no campo de batalha! Participe das batalhas da Arena, vença com seus ninjas e ajude a proteger o mundo ninja contra a ameaça dos Edo Tensei.':
    'The Shinobi Alliance needs your strength on the battlefield! Join arena battles, win with your ninjas, and help protect the ninja world from the Edo Tensei threat.',
  'Vença 3 partidas na Arena Tática': 'Win 3 matches in the Tactical Arena',
  'Cause 1.500 de dano total em combate': 'Deal 1,500 total damage in combat',
  'Use habilidades de Ninjutsu 15 vezes': 'Use Ninjutsu skills 15 times',
  'Complete 5 Missões Ninja no Quadro de Missões': 'Complete 5 Ninja Missions on the Mission Board',
  'Festival da Folha - Konoha': 'Leaf Festival - Konoha',
  'Comemoração de Outono': 'Autumn Celebration',
  'Celebre a paz em Konohagakure! Ganhe bônus de moedas ao jogar partidas diárias e complete desafios de suporte e cura.':
    'Celebrate peace in Konohagakure! Earn bonus coins by playing daily matches and complete support and healing challenges.',
  'Recupere 800 de Vida acumulados em batalhas': 'Restore 800 total health in battles',
  'Monte um esquadrão completo de ninjas da Folha': 'Build a full squad of Leaf Village ninjas',
  'Ameaça Vermelha: Caça às Bestas': 'Red Threat: Tailed Beast Hunt',
  'Desafio Semanal Akatsuki': 'Weekly Akatsuki Challenge',
  'Membros da Akatsuki foram avistados nas fronteiras do País do Fogo. Conclua combates usando invulnerabilidade e contra-ataque!':
    'Akatsuki members have been spotted at the borders of the Land of Fire. Finish battles using invulnerability and counterattacks!',
  'Aplique Atordoamento ou Silêncio 5 vezes em inimigos': 'Apply Stun or Silence to enemies 5 times',
  'Gere 600 de Escudo acumulados': 'Generate 600 total shield points',
  'Laços de Sangue: Sasuke & Itachi': 'Blood Ties: Sasuke & Itachi',
  'Desafio especial do Clã Uchiha': 'Special Uchiha Clan Challenge',
  'Lute ao lado dos irmãos Uchiha em batalhas contra a IA e online. Vença, use suas habilidades e prove sua força para conquistar prêmios surpresa.':
    'Fight alongside the Uchiha brothers in AI and online battles. Win, use your skills, and prove your strength to earn surprise rewards.',
  'Vença 1 batalha na Arena': 'Win 1 battle in the Arena',
  'Vença 5 batalhas com Sasuke na equipe': 'Win 5 battles with Sasuke on your team',
  'Vença 5 batalhas com Itachi na equipe': 'Win 5 battles with Itachi on your team',
  'Use 30 habilidades com Sasuke': 'Use 30 skills with Sasuke',
  'Use 30 habilidades com Itachi': 'Use 30 skills with Itachi',
  'Cause 10.000 de dano usando Sasuke': 'Deal 10,000 damage using Sasuke',
  'Cause 10.000 de dano usando Itachi': 'Deal 10,000 damage using Itachi',
  'Receba 5.000 de dano em batalhas com Sasuke na equipe': 'Take 5,000 damage in battles with Sasuke on your team',
  '500 Moedas': '500 Coins',
  '900 Moedas': '900 Coins',
  '600 Moedas': '600 Coins',
  '1.000 Moedas': '1,000 Coins',
  '750 Moedas': '750 Coins',
  '1.250 Moedas': '1,250 Coins',
  '15 Gems': '15 Gems',
  '20 Gems': '20 Gems',
  '25 Gems': '25 Gems',
  'Um genin entusiasmado do Time 7. Naruto tem o objetivo de se tornar Hokage. Seus Clones das Sombras o protegem e copiam seus movimentos para realizar combos poderosos e desferir o lendário Rasengan.':
    'An enthusiastic genin on Team 7, Naruto dreams of becoming Hokage. His Shadow Clones protect him and copy his moves, letting him perform powerful combos and unleash the legendary Rasengan.',
  'Vila da Folha': 'Leaf Village',
  'Vila da Areia': 'Sand Village',
  'Vila da Névoa': 'Hidden Mist Village',
  'Vila da Nuvem': 'Hidden Cloud Village',
  'Vila da Pedra': 'Hidden Stone Village',
  'Time 7': 'Team 7',
  Jinchuriki: 'Jinchuriki',
  Vento: 'Wind',
  Agulhas: 'Needles',
  Besta: 'Beast',
  Clássico: 'Classic',
  'Clã Shinobi': 'Shinobi Clan',
  Cobras: 'Snakes',
  Dançarino: 'Dancer',
  'Espadachins da Névoa': 'Mist Swordsmen',
  Espelhos: 'Mirrors',
  Estiloso: 'Stylish',
  Estrategista: 'Strategist',
  Fogo: 'Fire',
  Gelo: 'Ice',
  Insetos: 'Insects',
  Leque: 'Fan',
  Mente: 'Mind',
  Médico: 'Medical Ninja',
  Portões: 'Inner Gates',
  Reencarnado: 'Reanimated',
  Relâmpago: 'Lightning',
  Sapos: 'Toads',
  'Shinobi Solitário': 'Lone Shinobi',
  Sombras: 'Shadows',
  Sons: 'Sounds',
  Terra: 'Earth',
  'Time 10': 'Team 10',
  'Time 8': 'Team 8',
  'Time Asuma': 'Team Asuma',
  'Time Guy': 'Team Guy',
  'Vila do Som': 'Sound Village',
  'À Distância': 'Ranged',
  Água: 'Water',
  'Pacote de Fragmentos de Skin': 'Skin Fragment Pack',
  'Receba de 1 a 10 fragmentos de uma skin aleatória.': 'Receive 1 to 10 fragments of a random skin.',
  'Lenda dos Sannin': 'Legend of the Sannin',
  'Título exclusivo de prestígio reconhecido por todos os países ninjas.': 'An exclusive prestige title recognized by every ninja nation.',
  'Akatsuki Renegado': 'Rogue Akatsuki',
  'Título para aqueles que trilham o caminho da névoa e das sombras.': 'A title for those who walk the path of mist and shadows.',
  'Mestre dos Oito Portões': 'Eight Gates Master',
  'Título honroso concedido a guerreiros que dominam a força do Taijutsu.': 'An honorable title awarded to warriors who have mastered the power of taijutsu.',
  'Deus dos Shinobis': 'God of Shinobi',
  'O mais alto título do mundo ninja, gravado nos monumentos da arena.': 'The highest title in the ninja world, engraved on the arena monuments.',
  'Naruto Modo Sábio': 'Naruto Sage Mode',
  'Visual lendário de Naruto vestindo a capa vermelha do Modo Sábio de Senjutsu.': "Naruto's legendary look wearing the red cloak of Senjutsu Sage Mode.",
  'Sasuke Traje Hebi': 'Sasuke Hebi Outfit',
  'Visual de Sasuke durante a formação do esquadrão Hebi na caça a Itachi.': "Sasuke's outfit during the formation of the Hebi squad in its hunt for Itachi.",
  'Kakashi Capitão ANBU': 'Kakashi, ANBU Captain',
  'Traje operacional sombrio das Forças Especiais ANBU de Konoha.': "A dark operational uniform of Konoha's ANBU Special Forces.",
  'Rasengan Perfeito': 'Perfect Rasengan',
  'Efeito visual especial de carga, lançamento e impacto para a habilidade Rasengan do Naruto.': "A special charge, launch, and impact visual effect for Naruto's Rasengan skill.",
  'Fogo da Vontade': 'Will of Fire',
  'Moldura reluzente inspirada no fogo e determinação dos ninjas de Konoha.': "A radiant frame inspired by the fire and determination of Konoha's ninjas.",
  'Sharingan Carmesim': 'Crimson Sharingan',
  'Moldura com áurea rubra misteriosa inspirada no lendário Dōjutsu do Clã Uchiha.': 'A frame with a mysterious crimson aura, inspired by the legendary dojutsu of the Uchiha Clan.',
  'Operativo ANBU': 'ANBU Operative',
  'Moldura prateada elegante reservada para ninjas das forças especiais de esquadrão.': 'An elegant silver frame reserved for special squad forces ninjas.',
  'Bolsa de Moedas': 'Coin Pouch',
  'Bolsa contendo 1.000 moedas para desbloqueios e compras na loja.': 'A pouch containing 1,000 coins for unlocks and shop purchases.',
  'Baú do Tesouro Ninja': 'Ninja Treasure Chest',
  'Grande baú com 3.000 moedas para expansão rápida do seu império ninja.': 'A large chest with 3,000 coins to quickly expand your ninja empire.',
  'Título existente concedido por padrão ou como recompensa.': 'An existing title granted by default or as a reward.',
  Estudante: 'Student',
  'Genin de Konoha': 'Konoha Genin',
  'Herói da Aliança': 'Alliance Hero',
  'Novo Título': 'New Title',
  'Giro da roleta': 'Roulette Spin',
  'Gire a roleta e ganhe uma figurinha aleatória.': 'Spin the roulette to win a random card.',
  'TÍTULO': 'TITLE',
  'MÍTICO': 'MYTHIC',
  'LENDÁRIO': 'LEGENDARY',
  'RARO': 'RARE',
  'HABILIDADE': 'SKILL',
  'PACOTE': 'BUNDLE',
  'OFERTA': 'DEAL',
  'RECOMPENSA': 'REWARD',
  'Moedas insuficientes!': 'Not enough coins!',
  'Ryos insuficientes!': 'Not enough Ryos!',
  'Sasuke se defende, ganhando invulnerabilidade total a todas as habilidades por 1 turno.':
    'Sasuke defends himself, becoming completely invulnerable to all skills for 1 turn.',
};

const characterDescriptionsEn: Record<string, string> = {
  'Um prodígio do Time 7. Buscando poder e vingança, Sasuke ativa seu Sharingan para analisar inimigos, antecipar seus ataques e golpear com relâmpagos letais do Chidori.':
    "A Team 7 prodigy. Seeking power and revenge, Sasuke activates his Sharingan to analyze enemies, anticipate their attacks, and strike with Chidori's deadly lightning.",
  'Uma ninja médica genin do Time 7. Altamente inteligente, Sakura cura seus aliados, utiliza sua Sakura Interior para resistir ao combate e desfere socos devastadores de chakra.':
    'A genin medical ninja on Team 7. Highly intelligent, Sakura heals her allies, uses her Inner Sakura to endure combat, and delivers devastating chakra-powered punches.',
  'O líder Jonin de elite do Time 7. Conhecido mundialmente como o Ninja Copiador, Kakashi usa seu Sharingan para antecipar movimentos, se esconde no subsolo e desfere sua icônica Espada Relâmpago.':
    'The elite jonin leader of Team 7. Known worldwide as the Copy Ninja, Kakashi uses his Sharingan to anticipate movements, hides underground, and delivers his iconic Lightning Blade.',
  'Um genin aterrorizante da Vila da Areia que abriga o Shukaku de Uma Cauda. Gaara se protege com uma armadura de areia e manipula a areia para prender e soterrar seus oponentes.':
    'A fearsome genin from the Sand Village who hosts the One-Tail Shukaku. Gaara protects himself with a sand armor and manipulates sand to trap and bury his opponents.',
  'Um especialista dedicado da Vila da Folha. Sem habilidades em ninjutsu, Lee treina incansavelmente em taijutsu, usando força física extrema e abrindo os portões internos para colidir com os oponentes.':
    'A dedicated specialist from the Leaf Village. With no ninjutsu abilities, Lee trains tirelessly in taijutsu, using extreme physical strength and opening the Inner Gates to charge into opponents.',
  'O infame shinobi renegado da organização Akatsuki. Itachi prende os inimigos in genjutsus mentais profundos e comanda as chamas negras inextinguíveis do Amaterasu.':
    "The infamous rogue shinobi of the Akatsuki. Itachi traps enemies in deep mental genjutsu and commands Amaterasu's inextinguishable black flames.",
  'O prodígio genial do Clã Hyuga. Usando seu Byakugan, Neji atinge as vias de chakra do oponente, bloqueando suas habilidades e desviando todo o dano com a rotação de palmas.':
    "The brilliant prodigy of the Hyuga Clan. Using his Byakugan, Neji strikes an opponent's chakra points, blocking their abilities and deflecting all damage with Palm Rotation.",
  'Um adorável e forte membro do clã Akimichi. Choji expande o tamanho do seu corpo para esmagar os inimigos e consome pílulas secretas para se curar e amplificar dramaticamente sua força.':
    'A lovable and strong member of the Akimichi Clan. Choji enlarges his body to crush enemies and consumes secret pills to heal himself and dramatically amplify his strength.',
  'O estrategista genial do Time 10. Shikamaru usa suas sombras para prender e estrangular os oponentes de longe, enquanto medita para recuperar chakra e planejar cada passo da batalha.':
    'The brilliant strategist of Team 10. Shikamaru uses his shadows to trap and strangle opponents from afar while meditating to recover chakra and plan every move of the battle.',
  'A herdeira tímida do Clã Hyuga do Time 8. Hinata ativa seu Byakugan para obter excelente percepção defensiva e usa seu Punho Suave para golpear precisamente as vias de chakra inimigas.':
    'The shy heiress of the Hyuga Clan on Team 8. Hinata activates her Byakugan for excellent defensive perception and uses her Gentle Fist to strike enemy chakra points with precision.',
  'O Jonin mestre supremo de taijutsu do Time Guy. A lendária "Fera Nobre Verde da Folha" usa chutes devastadores e abre seus portões internos para obliterar qualquer barreira oponente.':
    'The supreme taijutsu master jonin of Team Guy. The legendary "Noble Green Beast of the Leaf" uses devastating kicks and opens his Inner Gates to obliterate any opposing barrier.',
  'Um dos lendários Sannin de Konoha, o carismático "Sábio dos Sapos". Ele comanda o óleo de sapo inflamável, agulhas de cabelo protetoras e pode convocar o gigantesco Gamabunta.':
    "One of Konoha's legendary Sannin, the charismatic \"Toad Sage.\" He commands flammable toad oil and protective hair needles, and can summon the gigantic Gamabunta.",
  'Um dos lendários Sannin de Konoha e criador da Vila do Som. Dominando cobras gigantescas e as propriedades da imortalidade, ele estende sua espada Kusanagi para empalar qualquer oponente.':
    "One of Konoha's legendary Sannin and founder of the Sound Village. Mastering giant snakes and the secrets of immortality, he extends his Kusanagi sword to impale any opponent.",
  'A lendária médica Sannin de Konoha. Tsunade acumula uma força colossal em seus músculos para destruir o solo e utiliza o milagroso selo Byakugou para curar qualquer ferimento instantaneamente.':
    "Konoha's legendary medical Sannin. Tsunade channels colossal strength into her muscles to shatter the ground and uses the miraculous Byakugou Seal to heal any wound instantly.",
  'O lendário espadachim "Demônio da Névoa Oculta". Zabuza conjura uma neblina impenetrável para se esconder e fatiar silenciosamente seus oponentes com a enorme espada Kubikiribocho.':
    'The legendary swordsman known as the "Demon of the Hidden Mist." Zabuza conjures an impenetrable mist to hide and silently slice his opponents with the massive Kubikiribocho sword.',
  'O fiel e talentoso parceiro de Zabuza. Detentor do Kekkei Genkai de liberação de gelo, ele prende os oponentes em espelhos de cristais de gelo de altíssima velocidade e ataca com agulhas de acupuntura.':
    "Zabuza's loyal and talented partner. Possessing the Ice Release Kekkei Genkai, he traps opponents in high-speed mirrors of ice crystals and attacks with acupuncture needles.",
  'A lenda lendária das pistas de dança, a versão mais estilosa do deserto. Ele envolve seus oponentes com batidas de discoteca pesadas, aprisionando-os no caixão de funk e dançando até a ressurreição.':
    "The legendary dance-floor legend, the desert's most stylish version. He surrounds opponents with heavy disco beats, trapping them in the funk coffin and dancing until resurrection.",
  'A ninja tática da Vila da Areia. Usando seu leque de ferro gigante, Temari manipula fortes correntes de vento para rasgar e repelir os oponentes, controlando a batalha com furacões cortantes.':
    'The tactical ninja of the Sand Village. Using her giant iron fan, Temari manipulates powerful gusts of wind to tear through and repel opponents, controlling the battle with cutting hurricanes.',
  'O genin selvagem do Time 8. Acompanhado por seu fiel cão Akamaru, Kiba desfere ataques combinados velozes de garras e presas com a técnica Presa Sobre Presa.':
    'The wild genin of Team 8. Accompanied by his loyal dog Akamaru, Kiba unleashes swift combined claw-and-fang attacks with the Fang Over Fang technique.',
  'A bela kunoichi do Time 10. Ino usa técnicas mentais de transferência de mente para controlar ou paralisar as mentes dos oponentes, deixando armadilhas de cabelo de chakra no chão para imobilizar.':
    "The beautiful kunoichi of Team 10. Ino uses mind-transfer techniques to control or paralyze opponents' minds, leaving chakra-hair traps on the ground to immobilize them.",
  'O reservado genin mestre de insetos do Time 8. Shino comanda insetos parasitas Kikaichu que drenam o chakra do oponente lentamente até que sequem.':
    "The reserved genin insect master of Team 8. Shino commands Kikaichu parasitic insects that slowly drain an opponent's chakra until they are left completely depleted.",
  'Um shinobi de elite com habilidades excepcionais e arsenal único. Mestre em técnicas de combate adaptadas para lutas intensas de Unison.':
    'An elite shinobi with exceptional abilities and a unique arsenal. A master of combat techniques adapted for intense Unison battles.',
};

export function localizeContentText(
  portugueseText: string | undefined | null,
  englishText: string | undefined | null,
  lang: Language = currentLanguage,
): string {
  if (lang === 'pt') return portugueseText || '';
  const english = englishText?.trim();
  const source = portugueseText?.trim();
  const containsPortuguese = (value: string) =>
    /[áàâãçéêíóôõú]|\b(?:de|da|do|das|dos|uma|um|em|no|na|nos|nas|por|para|com|que|seu|sua|seus|suas|não|habilidade|habilidades|inimigo|inimigos|aliado|aliados|personagem|personagens|dano|vida|turno|turnos|causa|causar|aumenta|reduz|atordoamento|recompensa|você|oponente|jogador|atacou|usou|executou|bloqueada|bloqueado|curou|perdeu|ganhou|passou|aguardando|venceu|derrotou|partida|batalha|alvo|alvos|efeito|efeitos|cura|drenou|roubou|removido|removida|recuperou|concedeu|recebeu|recebido|causado|adicional|fixa|durante|criou|destruiu|consumiu|custo|reduzido|reduzir|recarga|condicional|execução|drenar|remover|roubar|gerar|escudo|novo|nova|imortalidade|ressurreição|invulnerável|contra-ataque)\b/i.test(value);

  if (english && !containsPortuguese(english)) return english;
  if (!source) return '';
  if (configuredEnglishText[source] || characterDescriptionsEn[source]) {
    return configuredEnglishText[source] || characterDescriptionsEn[source];
  }
  const translated = translateGameText(source, lang);
  if (translated !== source && !containsPortuguese(translated)) return translated;
  if (!containsPortuguese(source)) return source;
  return 'English translation missing';
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
    const storedLanguage = typeof window !== 'undefined'
      ? localStorage.getItem(LANGUAGE_KEY)
      : null;
    if (storedLanguage === 'pt' || storedLanguage === 'en') {
      currentLanguage = storedLanguage;
      setLang(storedLanguage);
    }

    const unsubscribe = subscribeLanguage((newLang) => {
      setLang(newLang);
    });
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_KEY) return;
      const newLang: Language = event.newValue === 'en' ? 'en' : 'pt';
      currentLanguage = newLang;
      setLang(newLang);
      subscribers.forEach((cb) => cb(newLang));
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
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
