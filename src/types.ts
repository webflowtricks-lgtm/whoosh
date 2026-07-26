/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChakraType = 'Tai' | 'Nin' | 'Gen' | 'Blood' | 'Rand';

export interface ChakraPool {
  Tai: number;
  Nin: number;
  Gen: number;
  Blood: number;
}

export interface SkillCostRule {
  activeSkillName: string; // Active skill/effect name required on character (e.g. "Two-Headed Wolf")
  reduceType?: ChakraType | 'Any'; // Type of chakra cost to reduce ('Rand', 'Tai', 'Nin', 'Gen', 'Blood', 'Any')
  reduceAmount?: number; // Quantity of chakra to reduce (e.g. 1)
  reduceRandCost?: number; // Legacy compatibility
  reduceSpecificType?: ChakraType; // Legacy compatibility
  reduceSpecificAmount?: number; // Legacy compatibility
}

export interface SkillDamageRule {
  activeSkillName: string; // Active skill/effect required on character
  damageBoost: number; // Extra damage when condition is active
  icon?: string; // Icon of the boosting skill
}

export interface SkillChakraRemoveRule {
  activeSkillName: string; // Active skill/effect required on any combatant
  removeAmount: number; // Quantity of chakra to remove from enemy stock when condition is active
}

export interface SkillHealRule {
  activeSkillName: string; // Active skill/effect required on character
  healBoost: number; // Extra healing when condition is active
}

export interface Skill {
  name: string;
  desc: string;
  icon: string;
  cost: ChakraType[];
  costRules?: SkillCostRule[];
  damageRules?: SkillDamageRule[];
  chakraRemoveRules?: SkillChakraRemoveRule[];
  healRules?: SkillHealRule[];
  costRuleActiveSkill?: string;
  costRuleReduceRand?: number;
  costRuleReduceSpecificType?: ChakraType;
  costRuleReduceSpecificAmount?: number;
  cooldown: number; // max cooldown
  currentCooldown: number; // remaining cooldown turns
  targetType: 'Enemy' | 'Ally' | 'Self' | 'AllEnemies' | 'AllAllies';
  classes: string[]; // ['Physical', 'Melee', 'Chakra', etc.]
  requireEffect?: string; // e.g. "Shadow Clones"
  requirePreviousSkill?: string; // Skill name that must have been used on the previous turn
  requireHpBelow?: number; // HP threshold below which the skill can be used (0-100)
  
  // Custom Dynamic Effects (configured from the Admin Dashboard)
  damage?: number;
  directDamage?: number;
  heal?: number;
  stunTurns?: number;
  stunType?: ('mental' | 'physical' | 'affliction' | 'chakra')[];
  shieldVal?: number;
  shieldDuration?: number;
  damageReductionVal?: number;
  damageReductionDuration?: number;
  damageBuffVal?: number;
  damageBuffDuration?: number;
  damageDebuffVal?: number;
  damageDebuffDuration?: number;
  dotVal?: number;
  dotDuration?: number;
  dotInstant?: number;
  removeShield?: boolean;
  removeShieldDuration?: number;
  invulnerableDuration?: number;
  gainChakra?: number;
  gainChakraDuration?: number;
  drainChakra?: number;
  drainChakraDuration?: number;
  removeChakra?: number;
  removeChakraDuration?: number;
  removeChakraMode?: 'choice' | 'random';
  stealChakra?: number;
  stealChakraDuration?: number;
  invisible?: boolean;
  invisibleDuration?: number;
  ignoreInvulnerable?: boolean;
  ignoreDamageReduction?: boolean;
  ignoreDamageReductionVal?: number;
  missingHpDamageType?: '' | 'normal' | 'direct' | 'dot' | 'bleeding' | 'affliction'; // Damage = caster's missing HP

  // New custom dynamic effects (Bleeding, Affliction, Paralyze Cooldown, Cannot Reduce Damage, Cannot Be Invulnerable)
  bleedingVal?: number;
  bleedingDuration?: number;
  bleedingInstant?: number;
  afflictionVal?: number;
  afflictionDuration?: number;
  afflictionInstant?: number;
  paralyzeCooldownDuration?: number;
  cannotReduceDamageDuration?: number;
  cannotBeInvulnerableDuration?: number;

  // New Durations
  damageDuration?: number;
  directDamageDuration?: number;
  healDuration?: number;

  // Effect targets overrides
  damageTarget?: TargetOverride;
  directDamageTarget?: TargetOverride;
  healTarget?: TargetOverride;
  shieldTarget?: TargetOverride;
  damageBuffTarget?: TargetOverride;
  damageDebuffTarget?: TargetOverride;
  stunTarget?: TargetOverride;
  dotTarget?: TargetOverride;
  bleedingTarget?: TargetOverride;
  afflictionTarget?: TargetOverride;
  paralyzeCooldownTarget?: TargetOverride;
  cannotReduceDamageTarget?: TargetOverride;
  cannotBeInvulnerableTarget?: TargetOverride;
  invulnerableTarget?: TargetOverride;
  gainChakraTarget?: TargetOverride;
  drainChakraTarget?: TargetOverride;
  removeChakraTarget?: TargetOverride;
  stealChakraTarget?: TargetOverride;

  // Remove effect types overrides (cleanse)
  damageRemoveType?: string;
  directDamageRemoveType?: string;
  healRemoveType?: string;
  stunRemoveType?: string;
  shieldRemoveType?: string;
  damageReductionRemoveType?: string;
  damageBuffRemoveType?: string;
  damageDebuffRemoveType?: string;
  dotRemoveType?: string;
  bleedingRemoveType?: string;
  afflictionRemoveType?: string;
  paralyzeCooldownRemoveType?: string;
  cannotReduceDamageRemoveType?: string;
  cannotBeInvulnerableRemoveType?: string;
  invulnerableRemoveType?: string;
  gainChakraRemoveType?: string;
  drainChakraRemoveType?: string;
  removeChakraRemoveType?: string;
  stealChakraRemoveType?: string;
  removeShieldRemoveType?: string;
  invisibleRemoveType?: string;
  counterAttackRemoveType?: string;
  reflectRemoveType?: string;

  // Irremovable effect overrides (protected)
  damageIrremovable?: boolean;
  directDamageIrremovable?: boolean;
  healIrremovable?: boolean;
  stunIrremovable?: boolean;
  shieldIrremovable?: boolean;
  damageReductionIrremovable?: boolean;
  damageBuffIrremovable?: boolean;
  damageDebuffIrremovable?: boolean;
  dotIrremovable?: boolean;
  bleedingIrremovable?: boolean;
  afflictionIrremovable?: boolean;
  paralyzeCooldownIrremovable?: boolean;
  cannotReduceDamageIrremovable?: boolean;
  cannotBeInvulnerableIrremovable?: boolean;
  gainChakraIrremovable?: boolean;
  drainChakraIrremovable?: boolean;
  removeChakraIrremovable?: boolean;
  stealChakraIrremovable?: boolean;
  removeShieldIrremovable?: boolean;
  invulnerableIrremovable?: boolean;
  invisibleIrremovable?: boolean;
  // ==============================
// Counter Attack
// ==============================

counterAttack?: boolean;
counterAttackDuration?: number;
counterAttackType?: 'attacker' | 'defender';
counterAttackTarget?: TargetOverride;

counterAttackIrremovable?: boolean;
counterAttackCannotBeCountered?: boolean;
counterAttackCannotBeReflected?: boolean;


// ==============================
// Reflect
// ==============================

reflect?: boolean;
reflectDuration?: number;

reflectMode?: 'Caster' | 'RandomAlly';

reflectTarget?: TargetOverride;

reflectIrremovable?: boolean;
reflectCannotBeCountered?: boolean;
reflectCannotBeReflected?: boolean;

reflectType?: 'active' | 'passive';
reflectCharges?: number;


// ==============================
// Skill Protection & Rules
// ==============================

cannotBeCountered?: boolean;

cannotBeReflected?: boolean;

  noChakraCost?: boolean;

  doNotApplyIfActive?: boolean;

  permanent?: boolean; // If true, skill stays forever (shows ∞ instead of turn count)
}

export type TargetOverride =
  | 'Target'
  | 'Self'
  | 'Both'
  | 'Ally'
  | 'AllAllies'
  | 'AllEnemies'
  | 'AllLiving'
  | 'AllNonInvulnerable'
  | 'AllInvulnerable'
  | 'OneInvulnerable'
  | 'OneInvulnerableAlly'
  | 'SelfAndAllEnemies';

export interface CharacterSkin {
  id: string;
  name: string;
  image: string; // PNG transparent artwork URL
}

export interface Character {
  id: string;
  name: string;
  description: string;
  tags: string[];
  skills: Skill[];
  portrait: string;
  folder: string; // original folder name in public/static/img/ninja/
  skins?: CharacterSkin[];
  selectedSkinId?: string;
  selectedSkinUrl?: string;
  requiredQuestIds?: string[]; // IDs/Nomes de missões necessárias para desbloquear o personagem
}

export interface ActiveEffect {
  name: string; // name of skill or effect (e.g. "Shadow Clones", "Sand Coffin")
  type:
'shield'
| 'damage_reduction'
| 'damage_buff'
| 'stun'
| 'invulnerable'
| 'dot'
| 'counter'
| 'counter_attack'
| 'reflect'
| 'custom'
| 'invisible'
| 'bleeding'
| 'affliction'
| 'paralyze_cooldown'
| 'damage'
| 'direct_damage'
| 'heal'
| 'cannot_reduce_damage'
| 'cannot_be_invulnerable'
| 'damage_debuff';
  value?: number; // magnitude of shield, reduction, damage, etc.
  duration: number; // remaining turns
  icon?: string; // Icon of the skill that caused this effect/debuff
  sourceSkillName?: string; // Base skill name for grouping debuffs
  stunType?: ('mental' | 'physical' | 'affliction' | 'chakra')[];
  irremovable?: boolean;
  cannotBeCountered?: boolean;
  cannotBeReflected?: boolean;

  casterId?: string;
  casterSide?: 'player' | 'enemy';
  isInvisible?: boolean;
  targetId?: string;
  reflectMode?: 'Caster' | 'RandomAlly';
  reflectType?: 'active' | 'passive';
  reflectCharges?: number;
  counterAttackType?: 'attacker' | 'defender';
  castTurn?: number;
}

export interface CombatCharacter {
  id: string; // unique combat id, e.g. 'player-0', 'enemy-2'
  character: Character;
  health: number;
  maxHealth: number;
  shield: number;
  activeEffects: ActiveEffect[];
  isDead: boolean;
  lastTurnStatus?: 'ANULADO' | 'REFLETIDO' | 'CONTRA-ATAQUE' | null;
}

export interface CombatLog {
  id: string;
  turn: number;
  message: string;
  type: 'system' | 'damage' | 'heal' | 'buff' | 'stun' | 'death' | 'chakra';
}

export interface FloatingText {
  id: string;
  targetId: string;
  text: string;
  type: 'damage' | 'heal' | 'shield' | 'stun' | 'invulnerable' | 'dodge' | 'effect';
}

export interface SelectionState {
  playerTeam: Character[];
  enemyTeam: Character[];
}

export interface UserProfile {
  username: string;
  name: string;
  photoUrl: string;
  completedQuestIds?: string[];
  unlockedCharacterNames?: string[];
  title?: string;
  unlockedTitles?: string[];
  ryos?: number;
  gems?: number;
  unlockedSkins?: string[];
  unlockedFrames?: string[];
  unlockedFrameUrls?: string[];
  equippedFrame?: string;
  equippedFrameUrl?: string;
  unlockedBanners?: string[];
  unlockedBannerUrls?: string[];
  equippedBannerUrl?: string;
  claimedEventRewardIds?: string[];
}

export interface ShopItem {
  id: string;
  name: string;
  category: 'title' | 'skin' | 'frame' | 'bundle';
  description: string;
  currency: 'ryos' | 'gems';
  price: number;
  icon?: string;
  frameStyle?: string;
  frameImageUrl?: string;
  skinImageUrl?: string;
  characterName?: string;
  badge?: string;
  bundleGrant?: {
    type: 'ryos' | 'gems';
    amount: number;
  };
}

export interface NinjaEventObjective {
  id: string;
  description: string;
  current: number;
  target: number;
  rewardType: 'ryos' | 'gems' | 'title' | 'frame' | 'skin' | 'banner';
  rewardValue: string | number;
  rewardLabel: string;
  rewardFrameImageUrl?: string;
}

export interface NinjaEvent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  bannerUrl: string;
  badge: string;
  timeLeft: string;
  featured: boolean;
  objectives: NinjaEventObjective[];
}

export type GameScreen = 'main-menu' | 'character-select' | 'battle' | 'victory' | 'defeat' | 'admin' | 'quests';

export interface QuestGoal {
  id: string;
  type:
    | 'win_battles_with_chars'             // Ganhar batalhas utilizando personagens específicos (no mesmo time)
    | 'win_consecutive_battles_with_chars' // Ganhar batalhas consecutivas com personagens específicos (reseta se perder)
    | 'win_battles_with_tag'               // Ganhar batalhas com um time (3 personagens) usando a mesma tag (ex: Time Guy)
    | 'use_skill'                          // Usar habilidade N vezes
    | 'heal'                               // Curar pontos de vida
    | 'kill_with_skill'                    // Matar um inimigo (com personagem/habilidade/tag)
    | 'shield'                             // Gerar escudo
    | 'damage_received'                    // Receber dano
    | 'damage_dealt'                       // Infligir dano
    | 'stun_enemy'                         // Atordoar um inimigo N vezes
    | 'counter_cancel_skill';              // Contra-atacar / Anular / Refletir habilidades

  targetCharacters?: string[]; // Lista de nomes de personagens (autocomplete)
  targetSkill?: string;        // Nome da habilidade (autocomplete)
  targetTags?: string[];       // Lista de tags de personagem (autocomplete - ex: Time Guy, Akatsuki, Konoha)
  targetValue: number;         // Valor alvo
  currentValue: number;        // Valor atual de progresso
  singleMatch?: boolean;       // Se é em uma única partida ou acumulativo
  consecutive?: boolean;       // Se é em sequência
  currentStreak?: number;      // Contador de sequência atual
}

export interface QuestReward {
  type: 'title' | 'unlock_character' | 'frame' | 'banner';
  value: string; // Título, nome do personagem, ou nome/descrição da moldura ou banner
  imageUrl?: string; // URL da imagem da moldura ou banner de fundo do perfil
}

export interface Quest {
  id: string;
  title: string;
  desc: string;
  coverUrl: string; // Capa de foto da missão
  minRank: 'Estudante de Academia' | 'Genin' | 'Chunin' | 'Jonin' | 'ANBU' | 'Hokage'; // Requisitos
  requiredQuestIds: string[]; // Missões necessárias para estar liberada
  goals: QuestGoal[];
  rewards: QuestReward[];
  completed: boolean;
}

export function getEffectiveSkillCost(skill: Skill, sourceChar?: CombatCharacter, allCombatants?: CombatCharacter[]): ChakraType[] {
  if (!skill) return [];
  if (skill.noChakraCost || !skill.cost || skill.cost.length === 0) {
    return [];
  }

  let currentCost = [...skill.cost];

  if (sourceChar && sourceChar.activeEffects) {
    const rules: SkillCostRule[] = skill.costRules ? [...skill.costRules] : [];

    if (skill.costRuleActiveSkill && !rules.some(r => r.activeSkillName === skill.costRuleActiveSkill)) {
      rules.push({
        activeSkillName: skill.costRuleActiveSkill,
        reduceRandCost: skill.costRuleReduceRand ?? 1,
        reduceSpecificType: skill.costRuleReduceSpecificType,
        reduceSpecificAmount: skill.costRuleReduceSpecificAmount,
      });
    }

    for (const rule of rules) {
      if (!rule.activeSkillName) continue;
      const targetNameLower = rule.activeSkillName.trim().toLowerCase();

      const otherCombatants = (allCombatants || []).filter(c => c.id !== sourceChar.id);
      console.log(`[CostRule] Verificando "${rule.activeSkillName}" em ${sourceChar.activeEffects.length} efeitos do source + ${otherCombatants.length} combatentes`);
      const allActiveEffects = [
        ...sourceChar.activeEffects,
        ...otherCombatants.flatMap(c => c.activeEffects),
      ];

      const isReqActive = allActiveEffects.some(e => {
        if (!e.name) return false;
        const eNameLower = e.name.toLowerCase();
        return (
          eNameLower === targetNameLower ||
          eNameLower.startsWith(targetNameLower) ||
          eNameLower.includes(targetNameLower)
        );
      });
      if (isReqActive) {
        const matched = allActiveEffects.find(e => e.name && e.name.toLowerCase().includes(targetNameLower));
        console.log(`[CostRule] "${rule.activeSkillName}" ativo via "${matched?.name}" - custo reduzido`);
      }

      if (isReqActive) {
        const typeToReduce: ChakraType | 'Any' =
          rule.reduceType ||
          rule.reduceSpecificType ||
          'Rand';
        const amt =
          rule.reduceAmount ??
          rule.reduceSpecificAmount ??
          rule.reduceRandCost ??
          1;

        for (let i = 0; i < amt; i++) {
          if (typeToReduce === 'Any') {
            if (currentCost.length > 0) {
              currentCost.pop();
            }
          } else if (typeToReduce === 'Rand') {
            const randIdx = currentCost.indexOf('Rand');
            if (randIdx !== -1) {
              currentCost.splice(randIdx, 1);
            } else if (currentCost.length > 0) {
              currentCost.pop();
            }
          } else {
            const specIdx = currentCost.indexOf(typeToReduce);
            if (specIdx !== -1) {
              currentCost.splice(specIdx, 1);
            } else {
              const randIdx = currentCost.indexOf('Rand');
              if (randIdx !== -1) {
                currentCost.splice(randIdx, 1);
              } else if (currentCost.length > 0) {
                currentCost.pop();
              }
            }
          }
        }
      }
    }
  }

  return currentCost;
}
