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

export interface Skill {
  name: string;
  desc: string;
  icon: string;
  cost: ChakraType[];
  cooldown: number; // max cooldown
  currentCooldown: number; // remaining cooldown turns
  targetType: 'Enemy' | 'Ally' | 'Self' | 'AllEnemies' | 'AllAllies';
  classes: string[]; // ['Physical', 'Melee', 'Chakra', etc.]
  requireEffect?: string; // e.g. "Shadow Clones"
  
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
  dotVal?: number;
  dotDuration?: number;
  removeShield?: boolean;
  removeShieldDuration?: number;
  invulnerableDuration?: number;
  gainChakra?: number;
  gainChakraDuration?: number;
  drainChakra?: number;
  drainChakraDuration?: number;
  invisible?: boolean;
  invisibleDuration?: number;
  ignoreInvulnerable?: boolean;

  // New custom dynamic effects (Bleeding, Affliction, Paralyze Cooldown)
  bleedingVal?: number;
  bleedingDuration?: number;
  afflictionVal?: number;
  afflictionDuration?: number;
  paralyzeCooldownDuration?: number;

  // New Durations
  damageDuration?: number;
  directDamageDuration?: number;
  healDuration?: number;

  // Effect targets overrides
  damageTarget?: TargetOverride;
  directDamageTarget?: TargetOverride;
  healTarget?: TargetOverride;
  shieldTarget?: TargetOverride;
  stunTarget?: TargetOverride;
  dotTarget?: TargetOverride;
  bleedingTarget?: TargetOverride;
  afflictionTarget?: TargetOverride;
  paralyzeCooldownTarget?: TargetOverride;
  gainChakraTarget?: TargetOverride;
  drainChakraTarget?: TargetOverride;

  // Remove effect types overrides (cleanse)
  damageRemoveType?: string;
  directDamageRemoveType?: string;
  healRemoveType?: string;
  stunRemoveType?: string;
  shieldRemoveType?: string;
  damageReductionRemoveType?: string;
  damageBuffRemoveType?: string;
  dotRemoveType?: string;
  bleedingRemoveType?: string;
  afflictionRemoveType?: string;
  paralyzeCooldownRemoveType?: string;
  gainChakraRemoveType?: string;
  drainChakraRemoveType?: string;
  removeShieldRemoveType?: string;
  invulnerableRemoveType?: string;
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
  dotIrremovable?: boolean;
  bleedingIrremovable?: boolean;
  afflictionIrremovable?: boolean;
  paralyzeCooldownIrremovable?: boolean;
  gainChakraIrremovable?: boolean;
  drainChakraIrremovable?: boolean;
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
// Skill Protection
// ==============================

cannotBeCountered?: boolean;

cannotBeReflected?: boolean;
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
| 'heal';
  value?: number; // magnitude of shield, reduction, damage, etc.
  duration: number; // remaining turns
  icon?: string; // Icon of the skill that caused this effect/debuff
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
    | 'win_battles_with_chars'          // Ganhar batalhas utilizando personagens específicos
    | 'win_consecutive_battles_with_chars' // Ganhar batalhas consecutivas com personagens específicos (reseta se perder)
    | 'use_skill'                          // Usar habilidade N vezes (com opção de acumulativo ou partida única, e não pode ser refletido/contra-atacado)
    | 'heal'                               // Recuperar pontos de vida
    | 'kill_with_skill'                    // Matar um inimigo com uma habilidade específica
    | 'shield'                             // Gerar escudo
    | 'damage_received'                    // Receber dano
    | 'damage_dealt'                       // Infligir dano
    | 'stun_enemy';                        // Atordoar um inimigo N vezes

  targetCharacters?: string[]; // Lista de nomes de personagens (autocomplete)
  targetSkill?: string;        // Nome da habilidade (autocomplete)
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

