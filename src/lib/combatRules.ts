import type { ActiveEffect, CombatCharacter, Skill } from '../types';

export function isOffensiveSkill(skill: Skill | null): boolean {
  if (!skill) return false;
  const target = skill.targetType || 'Enemy';
  if (target === 'Self' || target === 'Ally' || target === 'AllAllies' || target === 'SelfAndAlly' || target === 'AnyLiving') {
    return false;
  }
  if (target === 'Enemy' || target === 'AllEnemies' || target === 'EnemyAndAlly') {
    return true;
  }
  const classes = (skill.classes || []).map(c => c.toLowerCase());
  if (classes.some(c => c.includes('friendly') || c.includes('amigável') || c.includes('suporte') || c.includes('cura') || c.includes('heal'))) {
    return false;
  }
  return true;
}

export function isSkillBlockedByStun(skill: Skill | null, activeEffects: ActiveEffect[]): boolean {
  if (!activeEffects || activeEffects.length === 0) return false;
  if (skill && skill.cannotBeStunned) return false;
  if (activeEffects.some(e => e.type === 'ignore_stun')) return false;

  const blocksOffensive = activeEffects.some(e => e.blocksOffensiveSkills || e.type === 'blocks_offensive_skills');
  if (blocksOffensive && skill && isOffensiveSkill(skill)) {
    return true;
  }

  const stunEffects = activeEffects.filter(e => e.type === 'stun');
  if (stunEffects.length === 0) return false;
  if (!skill) return true;

  for (const eff of stunEffects) {
    if (eff.blocksOffensiveSkills) {
      if (isOffensiveSkill(skill)) return true;
      continue;
    }
    if (!eff.stunType || eff.stunType.length === 0 || eff.stunType.length >= 4) {
      return true;
    }
    const skillClasses = (skill.classes || []).map(c => c.toLowerCase());
    for (const stunType of eff.stunType) {
      if (stunType === 'physical' && (skillClasses.includes('physical') || skillClasses.includes('físico') || skillClasses.includes('melee') || skillClasses.includes('corpo a corpo') || skillClasses.includes('taijutsu'))) {
        return true;
      }
      if (stunType === 'mental' && (skillClasses.includes('mental') || skillClasses.includes('genjutsu'))) {
        return true;
      }
      if (stunType === 'affliction' && (skillClasses.includes('affliction') || skillClasses.includes('aflição') || skillClasses.includes('dot'))) {
        return true;
      }
      if (stunType === 'chakra' && (skillClasses.includes('chakra') || skillClasses.includes('ninjutsu') || skillClasses.includes('ranged') || skillClasses.includes('à distância'))) {
        return true;
      }
    }
  }
  return false;
}

export function tickStunEffectsOnTurnPass(
  combatants: CombatCharacter[],
  turn: number,
  casterSide: 'player' | 'enemy',
): CombatCharacter[] {
  return combatants.map(combatant => ({
    ...combatant,
    activeEffects: combatant.activeEffects.flatMap(effect => {
      const effectCasterSide = effect.casterSide
        ?? (effect.casterId?.startsWith('player') ? 'player' : effect.casterId?.startsWith('enemy') ? 'enemy' : undefined);
      if (
        effect.type !== 'stun' ||
        effect.duration >= 99999 ||
        effect.castTurn === turn ||
        effectCasterSide !== casterSide
      ) {
        return [effect];
      }
      const duration = effect.duration - 1;
      return duration > 0 ? [{ ...effect, duration }] : [];
    }),
  }));
}

export function isSkillBlockedByDelayedUnlock(skill: Skill | null, activeEffects: ActiveEffect[]): boolean {
  if (!skill || !activeEffects || activeEffects.length === 0) return false;
  const skillName = (skill.name || '').toLowerCase();
  for (const effect of activeEffects) {
    if (effect.type !== 'custom' || !Array.isArray(effect.delayedUnlockSkills)) continue;
    const listed = effect.delayedUnlockSkills.map(name => (name || '').toLowerCase());
    if (!listed.includes(skillName)) continue;
    if (effect.delayedUnlockPhase === 'locked') return true;
  }
  return false;
}

function isSingleTypeProtected(typeName: string, protectedTypes: string[]): boolean {
  if (protectedTypes.includes('all')) return true;
  const normalizedType = typeName.toLowerCase();
  if (protectedTypes.includes(normalizedType)) return true;
  if (['físico', 'fisico', 'taijutsu', 'melee', 'corpo a corpo'].includes(normalizedType) && protectedTypes.includes('physical')) return true;
  if (normalizedType === 'genjutsu' && protectedTypes.includes('mental')) return true;
  if (normalizedType === 'ninjutsu' && protectedTypes.includes('chakra')) return true;
  if (['aflição', 'aflicao'].includes(normalizedType) && protectedTypes.includes('affliction')) return true;
  if (['à distância', 'distância', 'distancia', 'ranged'].includes(normalizedType) && protectedTypes.includes('ranged')) return true;
  return false;
}

export function hasEffectWithName(combatant: CombatCharacter | undefined, name: string): boolean {
  if (!combatant || !name) return false;
  const normalizedName = name.trim().toLowerCase();
  return (combatant.activeEffects || []).some(effect => {
    if (!effect.name) return false;
    const effectName = effect.name.toLowerCase();
    return effectName === normalizedName || effectName.startsWith(normalizedName) || effectName.includes(normalizedName);
  });
}

export function hasConditionalInvulnerabilityBypass(
  target: CombatCharacter,
  skill: Skill,
  caster?: CombatCharacter,
): boolean {
  if (!skill.ignoreInvulnWhenActiveRules?.length) return false;
  return skill.ignoreInvulnWhenActiveRules.some(rule => {
    const name = (rule.activeSkillName || '').trim();
    if (!name) return false;
    return rule.activeOn === 'self'
      ? hasEffectWithName(caster, name)
      : hasEffectWithName(target, name);
  });
}

export function hasNegateFriendlyEffects(combatant?: CombatCharacter | null): boolean {
  return !!combatant?.activeEffects?.some(effect => effect.type === 'negate_friendly_effects');
}

export function hasTotalInvulnerability(combatant?: CombatCharacter | null): boolean {
  if (!combatant?.activeEffects) return false;
  if (combatant.activeEffects.some(effect => effect.type === 'cannot_be_invulnerable')) return false;
  if (hasNegateFriendlyEffects(combatant)) return false;
  return combatant.activeEffects.some(effect => effect.type === 'invulnerable' && effect.invulnerableTotal === true);
}

export function checkCombatantInvulnerable(
  combatant: CombatCharacter,
  skillOrType?: Skill | string | string[],
  caster?: CombatCharacter,
): boolean {
  if (!combatant?.activeEffects) return false;
  if (combatant.activeEffects.some(effect => effect.type === 'cannot_be_invulnerable')) return false;
  if (hasNegateFriendlyEffects(combatant)) return false;
  if (
    skillOrType &&
    typeof skillOrType === 'object' &&
    !Array.isArray(skillOrType) &&
    hasConditionalInvulnerabilityBypass(combatant, skillOrType, caster)
  ) {
    return false;
  }
  const invulnerabilityEffects = combatant.activeEffects.filter(effect => effect.type === 'invulnerable');
  if (invulnerabilityEffects.length === 0) return false;

  return invulnerabilityEffects.some(effect => {
    const types = effect.invulnerableTypes;
    const protectedClasses = effect.invulnerableClasses;
    if (protectedClasses?.length) {
      if (!skillOrType) return true;
      if (typeof skillOrType === 'object' && !Array.isArray(skillOrType)) {
        const classes = (skillOrType.classes || []).map(name => name.toLowerCase());
        const normalizedProtected = protectedClasses.map(name => name.trim().toLowerCase()).filter(Boolean);
        return normalizedProtected.length > 0 && classes.some(name => normalizedProtected.includes(name));
      }
      return true;
    }
    if (!types) {
      if (skillOrType === 'friendly') return false;
      if (skillOrType && typeof skillOrType === 'object' && !Array.isArray(skillOrType)) {
        const classes = (skillOrType.classes || []).map(name => name.toLowerCase());
        if (classes.some(name => ['friendly', 'suporte', 'cura'].includes(name))) return false;
      }
      return true;
    }
    if (types.length === 0) return false;
    if (typeof skillOrType === 'string') return isSingleTypeProtected(skillOrType, types);
    if (Array.isArray(skillOrType)) return skillOrType.some(type => isSingleTypeProtected(type, types));
    if (skillOrType) {
      const skill = skillOrType;
      const classes = (skill.classes || []).map(name => name.toLowerCase());
      const isPhysical = classes.some(name => ['physical', 'físico', 'fisico', 'taijutsu', 'melee', 'corpo a corpo'].includes(name));
      const isMental = classes.some(name => ['mental', 'genjutsu'].includes(name));
      const isChakra = classes.some(name => ['chakra', 'ninjutsu'].includes(name));
      const isRanged = classes.some(name => ['ranged', 'à distância', 'distância', 'distancia'].includes(name));
      const isAffliction = classes.some(name => ['affliction', 'aflição', 'aflicao'].includes(name));
      const isFriendly = classes.some(name => ['friendly', 'suporte', 'cura'].includes(name));
      if (isPhysical && !types.includes('physical')) return false;
      if (isMental && !types.includes('mental')) return false;
      if (isChakra && !types.includes('chakra')) return false;
      if (isRanged && !types.includes('ranged')) return false;
      if (isAffliction && !types.includes('affliction')) return false;
      if (isFriendly && !types.includes('friendly')) return false;
      if (isPhysical || isMental || isChakra || isRanged || isAffliction || isFriendly) return true;
      if (skill.directDamage && skill.directDamage > 0 && !types.some(type => ['direct_damage', 'damage', 'all'].includes(type))) return false;
      if (skill.dotVal && skill.dotVal > 0 && !types.some(type => ['dot', 'damage', 'all'].includes(type))) return false;
      if (skill.bleedingVal && skill.bleedingVal > 0 && !types.some(type => ['bleeding', 'damage', 'all'].includes(type))) return false;
      return true;
    }
    if (types.includes('all')) return true;
    return true;
  });
}

export function isInvulnerableToFriendlyEffects(combatant: CombatCharacter, skill?: Skill): boolean {
  if (skill?.ignoreInvulnerable) return false;
  if (hasTotalInvulnerability(combatant)) return true;
  return checkCombatantInvulnerable(combatant, 'friendly');
}

export function hasImmortalEffect(combatant?: CombatCharacter | null): boolean {
  if (!combatant || hasNegateFriendlyEffects(combatant)) return false;
  return !!combatant.activeEffects?.some(effect => effect.type === 'immortal');
}
