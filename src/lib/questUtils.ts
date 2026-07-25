import { QuestGoal, Character } from '../types';

export interface BattleStats {
  damageDealt: number;
  damageReceived: number;
  healingDone: number;
  shieldGenerated: number;
  stunsApplied: number;
  countersReflects?: number;
  skillsUsed: { [skillName: string]: number };
  killsWithSkill: { [skillName: string]: number };
  playerCharactersUsed: string[];
  playerTeamCharacters?: Character[];

  damageDealtRecords?: Array<{ charName: string; tags: string[]; skillName: string; amount: number }>;
  damageReceivedRecords?: Array<{ charName: string; tags: string[]; amount: number }>;
  healingDoneRecords?: Array<{ charName: string; tags: string[]; skillName: string; amount: number }>;
  shieldGeneratedRecords?: Array<{ charName: string; tags: string[]; skillName: string; amount: number }>;
  killRecords?: Array<{ charName: string; tags: string[]; skillName: string }>;
  counterRecords?: Array<{ charName: string; tags: string[]; skillName: string }>;
  skillUseRecords?: Array<{ charName: string; tags: string[]; skillName: string }>;
}

export function getGoalDescription(goal: QuestGoal): string {
  const charsText = goal.targetCharacters && goal.targetCharacters.length > 0 
    ? goal.targetCharacters.join(', ') 
    : '';
  
  const isMultiChar = goal.targetCharacters && goal.targetCharacters.length > 1;
  const sameTeamNote = isMultiChar ? ' (no mesmo time)' : '';
  const skillNote = goal.targetSkill ? ` com [${goal.targetSkill}]` : '';
  const tagsNote = goal.targetTags && goal.targetTags.length > 0 ? ` (tag: ${goal.targetTags.join(', ')})` : '';
  const singleNote = goal.singleMatch ? ' [Em 1 partida]' : '';

  switch (goal.type) {
    case 'win_battles_with_chars':
      return `Ganhar batalhas usando ${charsText || 'personagens específicos'}${sameTeamNote}${tagsNote}${singleNote}`;

    case 'win_consecutive_battles_with_chars':
      return `Ganhar batalhas seguidas usando ${charsText || 'personagens específicos'}${sameTeamNote}${tagsNote}`;

    case 'win_battles_with_tag':
      return `Ganhar batalhas com um time completo (3 ninjas) da tag ${goal.targetTags?.join(', ') || 'especificada'}${singleNote}`;

    case 'use_skill':
      return `Usar ${goal.targetSkill ? `[${goal.targetSkill}]` : 'habilidade'}${charsText ? ` com ${charsText}` : ''}${tagsNote} ${goal.targetValue}x${singleNote}`;

    case 'heal':
      return `Curar ${goal.targetValue} de HP${charsText ? ` com ${charsText}` : ''}${skillNote}${tagsNote}${singleNote}`;

    case 'kill_with_skill':
      return `Derrotar/Matar ${goal.targetValue} inimigo(s)${charsText ? ` usando ${charsText}` : ''}${skillNote}${tagsNote}${singleNote}`;

    case 'shield':
      return `Gerar ${goal.targetValue} de Escudo${charsText ? ` com ${charsText}` : ''}${skillNote}${tagsNote}${singleNote}`;

    case 'damage_received':
      return `Receber ${goal.targetValue} de Dano${charsText ? ` com ${charsText}` : ''}${tagsNote}${singleNote}`;

    case 'damage_dealt':
      return `Causar ${goal.targetValue} de Dano${charsText ? ` com ${charsText}` : ''}${skillNote}${tagsNote}${singleNote}`;

    case 'stun_enemy':
      return `Atordoar inimigos ${goal.targetValue}x${charsText ? ` com ${charsText}` : ''}${tagsNote}${singleNote}`;

    case 'counter_cancel_skill':
      return `Contra-atacar / Anular / Refletir habilidades ${goal.targetValue}x${charsText ? ` com ${charsText}` : ''}${skillNote}${tagsNote}${singleNote}`;

    default:
      return `Completar objetivo (${goal.targetValue})${singleNote}`;
  }
}

export function evaluateQuestGoal(
  goal: QuestGoal,
  victory: boolean,
  stats: BattleStats
): { nextValue: number; nextStreak: number } {
  let valueToAdd = 0;
  let newStreak = goal.currentStreak || 0;
  let currentVal = goal.singleMatch ? 0 : goal.currentValue;

  const matchChar = (recChar: string) => {
    if (!goal.targetCharacters || goal.targetCharacters.length === 0) return true;
    return goal.targetCharacters.includes(recChar);
  };

  const matchSkill = (recSkill?: string) => {
    if (!goal.targetSkill || goal.targetSkill.trim() === '') return true;
    return recSkill?.toLowerCase() === goal.targetSkill.trim().toLowerCase();
  };

  const matchTags = (recTags: string[]) => {
    if (!goal.targetTags || goal.targetTags.length === 0) return true;
    const lowerRec = recTags.map(t => t.toLowerCase());
    return goal.targetTags.some(tag => lowerRec.includes(tag.toLowerCase()));
  };

  switch (goal.type) {
    case 'win_battles_with_chars': {
      if (victory) {
        const hasRequiredChars = !goal.targetCharacters || goal.targetCharacters.length === 0 || 
          goal.targetCharacters.every(name => stats.playerCharactersUsed.includes(name));
        
        const hasRequiredTags = !goal.targetTags || goal.targetTags.length === 0 ||
          (stats.playerTeamCharacters && stats.playerTeamCharacters.some(c => 
            c.tags && goal.targetTags?.some(t => c.tags.map(ct => ct.toLowerCase()).includes(t.toLowerCase()))
          ));

        if (hasRequiredChars && hasRequiredTags) {
          valueToAdd = 1;
        }
      }
      break;
    }

    case 'win_consecutive_battles_with_chars': {
      const hasStreakChars = !goal.targetCharacters || goal.targetCharacters.length === 0 ||
        goal.targetCharacters.every(name => stats.playerCharactersUsed.includes(name));

      const hasStreakTags = !goal.targetTags || goal.targetTags.length === 0 ||
        (stats.playerTeamCharacters && stats.playerTeamCharacters.some(c => 
          c.tags && goal.targetTags?.some(t => c.tags.map(ct => ct.toLowerCase()).includes(t.toLowerCase()))
        ));

      if (hasStreakChars && hasStreakTags) {
        if (victory) {
          newStreak += 1;
          valueToAdd = 1;
        } else {
          newStreak = 0;
          currentVal = 0;
        }
      } else if (!victory) {
        newStreak = 0;
        currentVal = 0;
      }
      break;
    }

    case 'win_battles_with_tag': {
      if (victory && goal.targetTags && goal.targetTags.length > 0 && stats.playerTeamCharacters) {
        const tag = goal.targetTags[0].toLowerCase();
        const charsWithTag = stats.playerTeamCharacters.filter(c => 
          c.tags && c.tags.some(t => t.toLowerCase() === tag || t.toLowerCase().includes(tag))
        );
        if (charsWithTag.length >= 3) {
          valueToAdd = 1;
        }
      }
      break;
    }

    case 'use_skill': {
      if (stats.skillUseRecords && stats.skillUseRecords.length > 0) {
        valueToAdd = stats.skillUseRecords
          .filter(r => matchChar(r.charName) && matchSkill(r.skillName) && matchTags(r.tags))
          .length;
      } else if (goal.targetSkill && stats.skillsUsed[goal.targetSkill]) {
        valueToAdd = stats.skillsUsed[goal.targetSkill];
      }
      break;
    }

    case 'heal': {
      if (stats.healingDoneRecords && stats.healingDoneRecords.length > 0) {
        valueToAdd = stats.healingDoneRecords
          .filter(r => matchChar(r.charName) && matchSkill(r.skillName) && matchTags(r.tags))
          .reduce((sum, r) => sum + r.amount, 0);
      } else {
        valueToAdd = stats.healingDone || 0;
      }
      break;
    }

    case 'kill_with_skill': {
      if (stats.killRecords && stats.killRecords.length > 0) {
        valueToAdd = stats.killRecords
          .filter(r => matchChar(r.charName) && matchSkill(r.skillName) && matchTags(r.tags))
          .length;
      } else if (goal.targetSkill && stats.killsWithSkill[goal.targetSkill]) {
        valueToAdd = stats.killsWithSkill[goal.targetSkill];
      }
      break;
    }

    case 'shield': {
      if (stats.shieldGeneratedRecords && stats.shieldGeneratedRecords.length > 0) {
        valueToAdd = stats.shieldGeneratedRecords
          .filter(r => matchChar(r.charName) && matchSkill(r.skillName) && matchTags(r.tags))
          .reduce((sum, r) => sum + r.amount, 0);
      } else {
        valueToAdd = stats.shieldGenerated || 0;
      }
      break;
    }

    case 'damage_dealt': {
      if (stats.damageDealtRecords && stats.damageDealtRecords.length > 0) {
        valueToAdd = stats.damageDealtRecords
          .filter(r => matchChar(r.charName) && matchSkill(r.skillName) && matchTags(r.tags))
          .reduce((sum, r) => sum + r.amount, 0);
      } else {
        valueToAdd = stats.damageDealt || 0;
      }
      break;
    }

    case 'damage_received': {
      if (stats.damageReceivedRecords && stats.damageReceivedRecords.length > 0) {
        valueToAdd = stats.damageReceivedRecords
          .filter(r => matchChar(r.charName) && matchTags(r.tags))
          .reduce((sum, r) => sum + r.amount, 0);
      } else {
        valueToAdd = stats.damageReceived || 0;
      }
      break;
    }

    case 'stun_enemy': {
      valueToAdd = stats.stunsApplied || 0;
      break;
    }

    case 'counter_cancel_skill': {
      if (stats.counterRecords && stats.counterRecords.length > 0) {
        valueToAdd = stats.counterRecords
          .filter(r => matchChar(r.charName) && matchSkill(r.skillName) && matchTags(r.tags))
          .length;
      } else {
        valueToAdd = stats.countersReflects || 0;
      }
      break;
    }
  }

  const nextValue = Math.min(goal.targetValue, currentVal + valueToAdd);

  return {
    nextValue,
    nextStreak: newStreak,
  };
}
