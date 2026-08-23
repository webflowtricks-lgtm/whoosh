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
  overrideCost?: ChakraType[]; // Custom chakra cost array required when activeSkillName is active. Empty array [] = FREE skill (0 cost).
  reduceType?: ChakraType | 'Any'; // Type of chakra cost to reduce ('Rand', 'Tai', 'Nin', 'Gen', 'Blood', 'Any')
  reduceAmount?: number; // Quantity of chakra to reduce (e.g. 1)
  reduceRandCost?: number; // Legacy compatibility
  reduceSpecificType?: ChakraType; // Legacy compatibility
  reduceSpecificAmount?: number; // Legacy compatibility
}

export interface SkillTargetRule {
  activeSkillName: string; // Skill/Efeito ativo necessário no combatente ou equipe
  overrideTarget: 'Enemy' | 'AllEnemies' | 'Ally' | 'AllAllies' | 'Self' | 'SelfAndAlly'; // Novo Alvo quando ativo
  /** Só altera o alvo na PRIMEIRA skill usada por ativação da condição. Depois volta ao normal; reativar a condição reseta. */
  oncePerActivation?: boolean;
}

export interface SkillCooldownRule {
  activeSkillName: string; // Skill/Efeito ativo necessário no combatente ou equipe
  overrideCooldown: number; // Novo Cooldown quando ativo (ex: 0)
}

export interface SkillCooldownReduceRule {
  activeSkillName: string; // Skill/Efeito ativo necessário no combatente ou equipe para a regra disparar
  targetSkillName: string; // Skill cujo cooldown ATUAL será reduzido
  reduceAmount: number; // Quanto reduzir da recarga atual (ex: 1, 2)
}

export interface SkillCountdownDamageRule {
  damage: number; // Dano aplicado quando o timer acabar (contagem regressiva)
  duration: number; // Turnos até explodir (ex: 2 = em 2 turnos o alvo recebe o dano)
  damageType?: 'damage' | 'direct_damage' | 'piercing' | 'affliction' | 'bleeding' | 'dot' | 'true'; // Tipo de dano ao explodir
  target?: 'holder' | 'enemy'; // Quem recebe o dano: 'holder' = quem tem a bomba (padrão), 'enemy' = um inimigo do portador
}

export interface SkillDamageRule {
  activeSkillName: string; // Active skill/effect required on character
  damageBoost: number; // Damage amount when condition is active
  icon?: string; // Icon of the boosting skill
  damageType?: 'damage' | 'direct_damage' | 'piercing' | 'affliction' | 'bleeding' | 'dot' | 'life_steal'; // Tipo de dano da regra
  ignoreBaseDamage?: boolean; // Se true, ignora o dano base/direto normal da habilidade quando a regra é ativada
}

export interface SkillOnSkillUseDamageRule {
  damage: number; // Dano sofrido ao usar qualquer habilidade
  duration: number; // Duração em turnos do efeito de punição
  damageType?: 'damage' | 'direct_damage' | 'piercing' | 'affliction' | 'bleeding' | 'dot' | 'life_steal'; // Tipo de dano
  target?: 'target' | 'self' | 'enemies' | 'allies'; // Alvo que recebe a regra (padrão: 'target')
  irremovable?: boolean; // Se não pode ser removido por cleanse
}

export interface SkillStackUseEffectRule {
  /** Ao usar a skill com esta quantidade de stacks do próprio conjurador (combo), aplica os efeitos abaixo.
   * Ex: 1ª vez = ganha stack (nada acontece), 2ª vez = stun, 3ª vez = remove chakra + stun.
   * Se a stack sumir (não usar a skill a tempo), o combo reinicia. */
  requiredStacks: number;
  /** Stuna o alvo da skill ao atingir esta quantidade de stacks */
  stun?: boolean;
  /** Turnos de stun (padrão 1) */
  stunDuration?: number;
  /** Tipos de stun bloqueados (vazio = Stun Completo) */
  stunType?: string[];
  /** Remove X chakras do estoque do oponente ao atingir esta quantidade de stacks */
  chakraRemove?: number;
  /** StackType a contar (vazio = usa o stackType da própria skill) */
  stackType?: string;
  /** Se true (padrão), a regra continua ativa para stacks MAIORES (ex: "3 em diante" = ativa no 3, 4, 5...).
   * Se false, ativa apenas quando a quantidade for EXATAMENTE requiredStacks. */
  onwards?: boolean;
}

export interface SkillSelfCastStackRule {
  /** StackType a checar NO CONJURADOR (vazio = usa o stackType da própria skill ou o nome dela) */
  stackType?: string;
  /** Quantidade mínima de stacks que o conjurador precisa ter para disparar */
  requiredStacks?: number;
  /** Nome de uma skill do PRÓPRIO personagem que, se estiver ATIVA no conjurador, dispara a regra (independente de stacks) */
  activeSkillName?: string;
  /** Nome de uma skill do PRÓPRIO personagem que será aplicada/usada em si mesmo */
  skillName?: string;
  /** Se true, a skill é aplicada SEM log/floating text (invisível para o oponente) */
  invisible?: boolean;
}

/** 💜 Regra condicional de aflição: se a skill `activeSkillName` estiver ATIVA (efeito ativo em qualquer combatente),
 *  o dano de aflição POR TURNO desta skill vira `value` ao invés do afflictionVal padrão. Primeira regra que casar ganha. */
export interface SkillAfflictionConditionalRule {
  /** Nome da skill que deve estar ativa para a regra valer */
  activeSkillName: string;
  /** Valor por turno alternativo da aflição enquanto a condição estiver ativa */
  value: number;
}

export interface SkillPrisonRule {
  /** Ativa a regra "Prisão de Madeira" (Wood Spire Prison) nesta skill */
  enabled?: boolean;
  /** Aliado: redução de dano recebido de skills NÃO-Aflição (padrão 15) */
  allyReduction?: number;
  /** Inimigo: redução de dano causado por skills NÃO-Mentais (padrão 15) */
  enemyReduction?: number;
  /** Inimigo: dano por turno se não usar habilidade ofensiva (padrão 15) */
  punishmentDamage?: number;
  /** Duração em turnos dos efeitos (padrão 2) */
  duration?: number;
  /** Valor da redução quando o alvo tem Geyser Spring (padrão 25) */
  geyserBoost?: number;
  /** Aliado: limpar todos os debuffs (padrão true) */
  cleanseAlly?: boolean;
  /** Aliado: zerar cooldowns de todas as skills (padrão true) */
  resetCooldownsAlly?: boolean;
}

export interface SkillChakraRemoveRule {
  activeSkillName: string; // Active skill/effect required on any combatant
  removeAmount: number; // Quantity of chakra to remove from enemy stock when condition is active
}

export interface SkillChakraStealRule {
  /** Nome da skill/efeito que deve estar ativo para acionar o roubo */
  activeSkillName: string;
  /** Quantidade de chakras a roubar por ativação */
  chakraAmount: number;
  /** Se true, ignora a invulnerabilidade do oponente (rouba mesmo se invulneravel) */
  ignoreInvulnerable?: boolean;
}

export interface SkillKillWhenActiveRule {
  activeSkillName: string; // Skill/efeito ativo no Oponente que será morto instantaneamente
  /** Quem morre ao executar: 'target' (Somente o Oponente - padrão) ou 'self_and_target' (Mim e o Oponente / sacrifício) */
  killScope?: 'target' | 'self_and_target';
  /** Limite de vida: se definido (>0), o Oponente só morre se a vida dele estiver com HP <= este valor no momento do uso */
  killHpThreshold?: number;
}

export interface SkillIgnoreInvulnWhenActiveRule {
  activeSkillName: string; // Skill/efeito que, se ATIVO, faz esta skill ignorar a invulnerabilidade
  /** Onde a habilidade condicional precisa estar ativa: 'target' (No Oponente - padrão) ou 'self' (Em Mim / Conjurador) */
  activeOn?: 'target' | 'self';
}

export interface SkillStunWhenActiveRule {
  activeSkillName: string; // Skill/efeito que, se ATIVO, faz esta skill stunnar o inimigo
  /** Onde a habilidade condicional precisa estar ativa: 'target' (No Oponente - padrão) ou 'self' (Em Mim / Conjurador) */
  activeOn?: 'target' | 'self';
  /** Classes bloqueadas pelo stun: 'physical', 'chakra', 'mental', 'affliction' (vazio/ausente = Stun Completo) */
  stunClasses?: string[];
  /** Duração do stun em turnos (padrão: 1) */
  stunTurns?: number;
}

export interface SkillShieldWhenActiveRule {
  activeSkillName: string; // Skill/efeito que, se ATIVO, faz esta skill conceder escudo
  /** Onde a habilidade condicional precisa estar ativa: 'target' (No Oponente - padrão) ou 'self' (Em Mim / Conjurador) */
  activeOn?: 'target' | 'self';
  /** Quantidade de escudo concedida quando a condição estiver ativa */
  shieldVal: number;
  /** Quem recebe o escudo: 'self' (Eu / Conjurador - padrão) ou 'team' (Minha Equipe / todos os aliados vivos) */
  shieldTarget?: 'self' | 'team';
  /** Duração do escudo em turnos (padrão: 99 = até quebrar) */
  shieldDuration?: number;
}

export interface SkillNoCounterReflectWhenActiveRule {
  activeSkillName: string; // Skill/efeito que, se ATIVO, faz esta skill não poder ser contra-atacada/refletida
  /** Onde a habilidade condicional precisa estar ativa: 'target' (No Oponente - padrão) ou 'self' (Em Mim / Conjurador) */
  activeOn?: 'target' | 'self';
  /** Esta skill NÃO pode ser contra-atacada enquanto a condição estiver ativa */
  noCounter?: boolean;
  /** Esta skill NÃO pode ser refletida enquanto a condição estiver ativa */
  noReflect?: boolean;
}

export interface SkillCounterSuccessDamageRule {
  /** Dano que o inimigo que atacou recebe quando o CONTRA-ATAQUE desta skill é efetuado com sucesso */
  damage: number;
  /** Tipo de dano: 'direct_damage' (Direto - padrão), 'damage' (Normal, consumido por escudo), 'dot' (Queimadura), 'bleeding' (Sangramento), 'affliction' (Aflição) */
  damageType?: string;
}

export interface SkillCounterSuccessBuffRule {
  /** Valor do buff de dano aplicado quando o CONTRA-ATAQUE desta skill é efetuado com sucesso */
  buffValue: number;
  /** Classes de skill que recebem o aumento de dano: physical, chakra, mental, affliction (vazio = todas as classes) */
  buffClasses?: string[];
  /** Quem recebe o buff: 'self' (apenas o conjurador - padrão) ou 'team' (todos os aliados vivos) */
  buffTarget?: 'self' | 'team';
  /** Duração do buff em turnos. Vazio/0/99999 = INFINITO (permanente) */
  duration?: number;
}

export interface SkillCounterSuccessStunRule {
  /** Turnos que o inimigo que atacou fica STUNADO quando o CONTRA-ATAQUE desta skill é efetuado com sucesso */
  stunTurns: number;
  /** Dano adicional que o inimigo que atacou recebe de skills das classes escolhidas (vazio = qualquer classe) */
  bonusDamage: number;
  /** Classes de skill que causam o dano adicional nele: physical, chakra, mental, affliction (vazio = qualquer classe) */
  damageClasses?: string[];
}

export interface SkillCounterSuccessStackRule {
  /** Nome da stack aplicada no inimigo que atacou quando o CONTRA-ATAQUE desta skill é efetuado com sucesso */
  stackName: string;
  /** Duração da stack em turnos. Vazio/0/99999 = INFINITO (permanente) */
  duration?: number;
}

export interface SkillOnCounteredDamageRule {
  /** Dano aplicado quando ESTA skill for CONTRA-ATACADA (anulada por um contra-ataque inimigo) */
  damage: number;
  /** Tipo de dano: 'direct_damage'/'piercing' (Direto - padrão), 'damage' (Normal), 'dot' (Queimadura), 'bleeding' (Sangramento), 'affliction' (Aflição) */
  damageType?: string;
  /** Quem recebe o dano: 'counterer' (o inimigo que contra-atacou - padrão) ou 'random_enemy' (um inimigo aleatório) */
  target?: 'counterer' | 'random_enemy';
}

export interface SkillChakraCostReduceRule {
  /** Tipos de chakra cujo custo das skills do alvo será reduzido: Tai, Nin, Gen, Blood, Rand */
  chakraTypes: ChakraType[];
  /** Quantidade reduzida do custo (ex: 1 = remove 1 chakra do tipo escolhido do custo da skill) */
  amount: number;
  /** Duração em turnos do buff no alvo */
  durationTurns: number;
}

export interface SkillReflectByStackRule {  /** Nome do stackType que deve estar ativo NO PORTADOR (alvo desta skill) E NO ATACANTE
   * para que skills ofensivas do atacante sejam redirecionadas ao ALIADO do atacante.
   * Vazio/omitido = aplica à própria stack desta skill. */
  activeStackName: string;
  /** Duração da REFLEXÃO em turnos. Vazio/0/omitido = reflexão permanente enquanto a stack estiver ativa.
   * Ex: 2 = a reflexão só funciona nos 2 primeiros turnos após a stack ser aplicada. */
  durationTurns?: number;
}

export type SkillTargetType = 'Enemy' | 'Ally' | 'Self' | 'SelfAndAlly' | 'AllEnemies' | 'AllAllies' | 'AnyLiving';
export interface SkillStackLowHpProtectionRule {
  /** Nome do stackType que o aliado precisa ter para receber a proteção */
  stackType: string;
  /** Quantidade mínima de stacks necessária (padrão: 1) */
  requiredStacks?: number;
  /** Percentual de vida (%) igual ou abaixo do qual a proteção é ativada (padrão: 50) */
  hpPercentThreshold?: number;
  /** Se true, as skills do aliado protegido NÃO podem ser CONTRA-ATACADAS (padrão: true) */
  noCounter?: boolean;
  /** Se true, as skills do aliado protegido NÃO podem ser REFLETIDAS (padrão: true) */
  noReflect?: boolean;
}
export interface SkillTargetChangeOnStacksRule {
  /** Marcação (stack) que precisa ter X stacks para ativar */
  markingSkillName: string;
  /** Quantidade de stacks necessária na marcação */
  requiredStacks: number;
  /** Novo alvo da skill enquanto o efeito estiver ativo: 'Enemy' | 'Ally' | 'Self' | 'SelfAndAlly' | 'AllEnemies' | 'AllAllies' */
  overrideTarget?: SkillTargetType;
  /** Duração em turnos do efeito (some quando o turno acabar) */
  durationTurns?: number;
}

export interface SkillBonusDamageOnStacksRule {
  /** Marcação (stack) que precisa ter X stacks para ativar */
  markingSkillName: string;
  /** Quantidade de stacks necessária na marcação */
  requiredStacks: number;
  /** Dano adicional desta skill enquanto o efeito estiver ativo */
  bonusDamage: number;
  /** Tipo do dano adicional: 'damage' (Normal), 'direct_damage' (Direto), 'physical' (Físico), 'chakra', 'mental', 'ranged', 'affliction', 'dot', 'bleeding' */
  damageType?: string;
  /** Duração em turnos do efeito (some quando o turno acabar) */
  durationTurns?: number;
}

export interface SkillHealRule {
  activeSkillName: string; // Active skill/effect required on character
  healBoost: number; // Extra healing when condition is active
}

export interface SkillStackDamageRule {
  /** Nome do stackType que será verificado (ex: 'Marca', 'Veneno', 'Cortes') */
  stackType: string;
  /** Onde verificar/contar as stacks: 'target' (No Alvo - padrão), 'self' (Em Mim / Conjurador), 'enemies' (Em Todos os Inimigos), 'allies' (Em Todos os Aliados), 'all' (Em Todos em Campo) */
  stackSource?: 'target' | 'self' | 'enemies' | 'allies' | 'all';
  /** Dano adicional por cada stack encontrada (instantâneo ou por turno) */
  damagePerStack: number;
  /** Quantidade de stacks para remover do alvo ao usar esta skill. Se não definido, não remove. */
  removeStacks?: number;
  /** Se definido, aplica o dano como efeito contínuo por turno com esta duração */
  duration?: number;
  /** Tipo de dano contínuo (padrão: 'dot') */
  damageType?: 'dot' | 'bleeding' | 'affliction' | 'direct_damage' | 'damage' | 'life_steal';
  /** Se true, ignora o dano base da skill quando o alvo tiver stacks (só aplica o dano por stack) */
  ignoreBaseDamage?: boolean;
}

export interface SkillSelfStackDamageRule {
  /** Nome do stackType que será verificado em mim mesmo */
  stackType: string;
  /** Dano adicional por stack que eu possuo */
  damagePerStack: number;
  /** Tipo de dano da stack (padrão: 'damage') */
  damageType?: 'dot' | 'bleeding' | 'affliction' | 'direct_damage' | 'damage' | 'life_steal';
}

export interface SkillSelfStackReductionRule {
  /** Nome do stackType que será verificado em mim mesmo */
  stackType: string;
  /** Tipo de redução: 'damage_reduction' (Guard) ou 'damage_reduction_pierce' (imune a perfuração) */
  reductionType?: 'damage_reduction' | 'damage_reduction_pierce';
  /** Valor de redução por stack que eu possuo */
  reductionValue: number;
  /** Duração em turnos (99999 = infinito) */
  duration?: number;
}

export interface SkillStackDurationRule {
  /** Nome do stackType que será verificado no alvo (ex: 'Marca', 'Veneno', 'Cortes') */
  stackType: string;
  /** Duração override dos efeitos desta skill quando o alvo tiver stacks desse tipo */
  durationOverride: number;
}

export interface SkillShieldPerStackRule {
  /** Nome do stackType que será verificado em mim mesmo (ex: 'Raikiri', 'Uchiha Clan Member') */
  stackType: string;
  /** Quantidade de escudo adicionada POR CADA stack deste tipo que o conjurador possuir */
  shieldPerStack: number;
  /** Se true, ao usar a skill a contagem de stacks deste tipo no conjurador volta para resetStacksTo */
  resetStackOnUse?: boolean;
  /** Valor para o qual a contagem de stacks volta quando resetStackOnUse = true (padrão: 1) */
  resetStacksTo?: number;
}

export interface Skill {
  name: string;
  desc: string;
  icon: string;
  cost: ChakraType[];
  costRules?: SkillCostRule[];
  targetRules?: SkillTargetRule[];
  cooldownRules?: SkillCooldownRule[];
  /** Regras condicionais que REDUZEM o cooldown ATUAL de uma skill específica quando outra habilidade/efeito estiver ativo */
  cooldownReduceRules?: SkillCooldownReduceRule[];
  damageRules?: SkillDamageRule[];
  onSkillUseDamageRules?: SkillOnSkillUseDamageRule[];
  /** Combo por stacks: ao usar a skill com X stacks do conjurador, aplica os efeitos da regra (stun, remover chakra...) */
  stackUseEffectRules?: SkillStackUseEffectRule[];
  /** Skill em Mim com Stack: se X stack estiver no conjurador, ao usar esta skill uma das próprias skills
   * do personagem é aplicada/usada em si mesmo (opcionalmente de forma invisível para o oponente) */
  selfCastStackRules?: SkillSelfCastStackRule[];
  /** 🛡️ Proteção por Stack em Vida Baixa: aliados marcados com X stack, quando estiverem com Y% de vida ou
   * menos, ganham um buff que impede que suas skills sejam contra-atacadas e/ou refletidas. Ideal para
   * skills PASSIVAS (avaliada automaticamente a cada turno, sem precisar usar a skill). */
  stackLowHpProtectionRules?: SkillStackLowHpProtectionRule[];
  /** ⚡ Escudo por Stack em Mim: ao usar a skill, o conjurador ganha X de escudo por cada
   * stack do tipo Y que ele mesmo possuir no momento do uso */
  shieldPerStackRules?: SkillShieldPerStackRule[];
  /** Regra "Prisão de Madeira" (Wood Spire Prison): aliado recebe limpeza + redução de dano não-Aflição;
   * inimigo sofre fraqueza não-Mental + punição por turno se não usar skill ofensiva */
  prisonRule?: SkillPrisonRule;
  /** Contagem regressiva (bomba): ao usar a skill no alvo, ele recebe um timer de X turnos; quando o tempo acabar, recebe o dano configurado */
  countdownDamageRules?: SkillCountdownDamageRule[];
  chakraRemoveRules?: SkillChakraRemoveRule[];
  /** Regras de roubo de chakras: quando a skill listada abaixo estiver ATIVA no conjurador,
   * esta skill rouba X chakras do stock do oponente (respecta invulnerabilidade,
   * exceto se o oponente tiver debuff "incapaz de ficar invulneravel") */
  chakraStealRules?: SkillChakraStealRule[];
  /** Regras condicionais de morte instantânea: mata o Oponente que estiver com a habilidade ativa */
  killWhenActiveRules?: SkillKillWhenActiveRule[];
  /** Regras condicionais: se a habilidade listada estiver ATIVA no Oponente, esta skill IGNORA a invulnerabilidade dele */
  ignoreInvulnWhenActiveRules?: SkillIgnoreInvulnWhenActiveRule[];
  /** Regras condicionais de stun: se a habilidade listada estiver ATIVA (em mim ou no Oponente), esta skill STUNNA o inimigo */
  stunWhenActiveRules?: SkillStunWhenActiveRule[];
  /** Regras condicionais de escudo: se a habilidade listada estiver ATIVA (em mim ou no Oponente), esta skill concede escudo a mim ou à minha equipe */
  shieldWhenActiveRules?: SkillShieldWhenActiveRule[];
  /** Regras condicionais de contra-ataque/reflexo: se a habilidade listada estiver ATIVA (em mim ou no Oponente), esta skill NÃO pode ser contra-atacada e/ou refletida */
  noCounterReflectWhenActiveRules?: SkillNoCounterReflectWhenActiveRule[];
  /** Quando o CONTRA-ATAQUE desta skill é efetuado com sucesso, o inimigo que atacou recebe dano direto */
  counterSuccessDamageRules?: SkillCounterSuccessDamageRule[];
  /** Quando o CONTRA-ATAQUE desta skill é efetuado com sucesso, o conjurador (ou todos os aliados) recebe um BUFF de dano das classes escolhidas por X turnos */
  counterSuccessBuffRules?: SkillCounterSuccessBuffRule[];
  /** Quando o CONTRA-ATAQUE desta skill é efetuado com sucesso, o inimigo que atacou fica STUNADO e recebe dano adicional de skills das classes escolhidas */
  counterSuccessStunRules?: SkillCounterSuccessStunRule[];
  /** Quando o CONTRA-ATAQUE desta skill é efetuado com sucesso, o inimigo que atacou recebe uma STACK (por X turnos ou infinito) */
  counterSuccessStackRules?: SkillCounterSuccessStackRule[];
  /** Quando ESTA skill for CONTRA-ATACADA (anulada), um inimigo (o que contra-atacou ou um aleatório) recebe dano do tipo escolhido */
  onCounteredDamageRules?: SkillOnCounteredDamageRule[];
  /** Quando esta skill é usada, as skills do(s) alvo(s) têm o custo de chakra dos tipos escolhidos reduzido pela quantidade definida por X turnos */
  chakraCostReduceRules?: SkillChakraCostReduceRule[];
  /** Reflexão por Stack: quando o portador desta stack E o atacante inimigo possuírem a stack,
   * as skills ofensivas do atacante usadas no portador são redirecionadas ao ALIADO do atacante
   * (exceto skills marcadas como "não pode ser refletida"). */
  reflectByStackRules?: SkillReflectByStackRule[];
  /** Quando a marcação tiver X stacks, muda o alvo desta skill por X turnos (some quando o turno acabar) */
  targetChangeOnStacksRules?: SkillTargetChangeOnStacksRule[];
  /** Quando a marcação tiver X stacks, esta skill dá X de dano adicional por X turnos (some quando o turno acabar) */
  bonusDamageOnStacksRules?: SkillBonusDamageOnStacksRule[];
  healRules?: SkillHealRule[];
  costRuleActiveSkill?: string;
  costRuleReduceRand?: number;
  costRuleReduceSpecificType?: ChakraType;
  costRuleReduceSpecificAmount?: number;
  cooldown: number; // max cooldown
  currentCooldown: number; // remaining cooldown turns
  targetType: SkillTargetType;
  classes: string[]; // ['Physical', 'Melee', 'Chakra', etc.]
  requireEffect?: string; // e.g. "Shadow Clones"
  requirePreviousSkill?: string; // Skill name that must have been used on the previous turn
  requireHpBelow?: number; // HP threshold below which the skill can be used (0-100)
  requireTargetEffect?: string; // Effect name that must be active on the target enemy to use this skill (e.g. "Chain Wrap")
  immortalHpThreshold?: number; // When HP ≤ this value, character becomes immortal (can't die)
  immortalDuration?: number; // How many turns the immortality lasts
  immortalImmediate?: boolean; // If true, immortality activates immediately upon using the skill
  reviveOnDeath?: boolean; // Ao morrer, o personagem ressuscita com reviveHp de vida (consumido ao reviver)
  reviveHp?: number; // Quantidade de vida ao ressuscitar
  requireRevived?: boolean; // Skill só pode ser usada se o personagem já ressuscitou nesta partida
  blockIfRevived?: boolean; // Skill fica bloqueada se o personagem já ressuscitou nesta partida
  
  // Custom Dynamic Effects (configured from the Admin Dashboard)
  customEffects?: any[];
  damage?: number;
  directDamage?: number;
  heal?: number;
  stunTurns?: number;
  stunType?: ('mental' | 'physical' | 'affliction' | 'chakra' | 'ranged' | 'friendly' | string)[];
  shieldVal?: number;
  shieldDuration?: number;
  shieldMaxVal?: number;
  /** Enquanto o alvo tiver escudo desta skill, ele não pode ser stunado */
  shieldStunImmunity?: boolean;
  /** CONVERSÃO DE DANO EM ESCUDO: enquanto durar, TODO o dano que o alvo receber vira escudo */
  damageToShieldDuration?: number;
  /** Duração do escudo gerado pela conversão (99999 = infinito) */
  damageToShieldShieldTurns?: number;
  /** Alvo do efeito de conversão de dano em escudo */
  damageToShieldTarget?: TargetOverride;
  /** Efeito de conversão de dano em escudo não pode ser removido */
  damageToShieldIrremovable?: boolean;
  /** Tipos de dano que serão convertidos em escudo (vazio/undefined = TODOS os tipos) */
  damageToShieldTypes?: string[];
  /** Se true, apenas o PRIMEIRO dano recebido durante a duração será convertido em escudo */
  damageToShieldFirstHitOnly?: boolean;
  /** Tipos de dano dos quais o alvo fica imune (vazio/undefined = TODO o dano) */
  damageImmunityTypes?: string[];
  shieldRegenTurns?: number; // Quantos turnos a skill gera shieldVal ADICIONAL de escudo por turno
  damageReductionVal?: number;
  damageReductionDuration?: number;
  /** 🔄 Guard: se verdadeiro, a duração da Redução de Dano passa a ser o TOTAL de stacks
   * do tipo configurado que o conjurador possuir no momento do uso */
  damageReductionStacksAsDuration?: boolean;
  /** StackType (autocomplete) cuja contagem define a duração do Guard */
  damageReductionStacksType?: string;
  /** Redução de Dano Imune a Perfuração: igual ao damageReductionVal (Guard), mas TAMBÉM reduz dano direto/perfuração */
  damageReductionPierceVal?: number;
  damageReductionPierceDuration?: number;
  damageReductionPierceTarget?: SkillTargetType;
  damageReductionPierceRemoveType?: string;
  damageReductionPierceIrremovable?: boolean;
  /** Cópia de Habilidades: substitui minhas habilidades pelas habilidades do alvo selecionado por X turnos */
  skillCopyDuration?: number;
  /** Alvo da cópia de habilidades (padrão: 'AnyLiving' = qualquer personagem vivo) */
  skillCopyTarget?: SkillTargetType;
  /** Modo aleatório: em vez de copiar TODAS as habilidades do alvo, copia UMA habilidade ALEATÓRIA dele e substitui apenas a própria skill de cópia por ela durante a duração */
  skillCopyRandom?: boolean;
  damageBuffVal?: number;
  damageBuffTypes?: string[]; // Classes de skill que o buff aumenta (vazio = todas: physical, mental, affliction, chakra, ranged, friendly)
  damageBuffDuration?: number;
  /** Sofrer Dano: o(s) alvo(s) escolhido(s) (conjurador, aliado, equipe) sofrem dano por X turnos ao usar a skill */
  friendlyDamageVal?: number;
  friendlyDamageDuration?: number;
  friendlyDamageTarget?: TargetOverride;
  friendlyDamageType?: 'damage' | 'direct_damage' | 'dot' | 'bleeding' | 'affliction';
  /** Sofrer Dano Não Mata: o dano próprio deixa o alvo com no mínimo 1 de HP em vez de derrotá-lo */
  friendlyDamageCantKill?: boolean;
  damageDebuffVal?: number;
  damageDebuffDuration?: number;
  damageDebuffTypes?: ('skill' | 'dot' | 'bleeding' | 'affliction' | 'direct_damage' | 'damage')[];
  damageVulnerabilityVal?: number;
  damageVulnerabilityDuration?: number;
  damageVulnerabilityTypes?: string[]; // Classes de skill afetadas: physical, mental, affliction, chakra, ranged, friendly
  damageVulnerabilityTarget?: TargetOverride;
  damageVulnerabilityIrremovable?: boolean;
  damageVulnerabilityRemoveType?: string;
  dotVal?: number;
  dotDuration?: number;
  dotInstant?: number;
  removeShield?: boolean;
  removeShieldDuration?: number;
  removeCounterReflect?: boolean;
  removeCounterReflectTarget?: TargetOverride;
  invulnerableDuration?: number;
  invulnerableTypes?: ('damage' | 'direct_damage' | 'affliction' | 'bleeding' | 'dot' | 'mental' | 'physical' | 'chakra' | 'ranged' | 'friendly' | 'stun' | 'all')[];
  /** Classes de skill (skill.classes) contra as quais o alvo fica invulnerável (protegido delas). Vazio = proteção por tipos. */
  invulnerableClasses?: string[];
  gainChakra?: number;
  gainChakraDuration?: number;
  /** Tipos de chakra gerados pelo gainChakra: 'Tai' | 'Nin' | 'Gen' | 'Blood' | 'Rand' | 'Existing' (vazio = aleatório) */
  gainChakraTypes?: string[];
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
  /** 🌀 HABILIDADE PASSIVA: não pode ser selecionada em batalha (clicar mostra "Habilidade Passiva");
   * seus efeitos principais já iniciam aplicados no início da batalha no alvo escolhido (passiveStartTarget) */
  isPassive?: boolean;
  /** Alvo inicial dos efeitos da passiva: 'self' (em mim - padrão), 'allies' (nos meus aliados) ou 'enemies' (nos inimigos) */
  passiveStartTarget?: 'self' | 'allies' | 'enemies';
  /** Total de vezes que esta skill pode ser usada com sucesso. Refletida ainda conta como uso;
   * anulada por contra-ataque NÃO conta. Vazio/undefined = ilimitado. Ao atingir o limite, fica bloqueada. */
  maxUses?: number;
  removedOnTargetSkillUse?: boolean; // Remove os efeitos desta skill do alvo quando ele usar uma habilidade (mesmo que infinita)
  removedOnCasterDeath?: boolean; // Remove os efeitos desta skill dos alvos quando o conjurador morrer
  /** Se true, esta skill pode ser usada mesmo enquanto o conjurador está atordoado (imune a stun) */
  cannotBeStunned?: boolean;
  /** 🚑 Enquanto esta skill estiver ATIVA em alguém, essa pessoa NÃO pode ser curada */
  blocksHealsWhileActive?: boolean;
  /** 🔓 Liberação atrasada de skills: enquanto este efeito durar (delayedUnlockDuration turnos), as skills
   * listadas ficam BLOQUEADAS no conjurador; quando o efeito termina, elas ficam liberadas por
   * delayedUnlockWindowTurns turnos. Passada a janela, voltam a ficar bloqueadas. */
  delayedUnlockSkills?: string[];
  /** Turnos que o bloqueio inicial dura antes de abrir a janela de liberação */
  delayedUnlockDuration?: number;
  /** Turnos que a janela de liberação dura depois do bloqueio terminar */
  delayedUnlockWindowTurns?: number;
  /** 💞 Vínculo de Morte (Death Link): por X turnos, se o conjurador OU o alvo morrer, o outro também morre */
  deathLinkDuration?: number;
  ignoreDamageReduction?: boolean;
  ignoreDamageReductionVal?: number;
  missingHpDamageType?: '' | 'normal' | 'direct' | 'dot' | 'bleeding' | 'affliction'; // Damage = caster's missing HP
  bonusDamagePerMissingHp?: number; // Extra bonus damage per step of missing HP (e.g. +10 damage)
  missingHpStep?: number; // Step size of missing HP (e.g. for every 20 HP lost)
  missingHpSource?: 'caster' | 'target'; // Whose missing HP (default 'caster')
  missingHpBonusType?: 'damage' | 'direct' | 'dot' | 'bleeding' | 'affliction'; // Type of damage to apply the bonus to (default 'damage')

  // New custom dynamic effects (Bleeding, Affliction, Paralyze Cooldown, Cannot Reduce Damage, Cannot Be Invulnerable)
  bleedingVal?: number;
  bleedingDuration?: number;
  bleedingInstant?: number;
  bleedingDelay?: number; // Turnos de atraso antes do sangramento começar a causar dano (não causa agora)
  afflictionVal?: number;
  afflictionDuration?: number;
  afflictionInstant?: number;
  afflictionDelay?: number; // Turnos de atraso antes da aflição começar a causar dano (não causa agora)
  /** Quando afflictionTarget = 'Both' (Mim e Alvo), quanto de aflição por turno o CONJURADOR recebe (padrão = afflictionVal) */
  afflictionSelfVal?: number;
  /** 💜 Regras condicionais de aflição: se a skill indicada estiver ATIVA, o dano por turno vira `value` ao invés do afflictionVal padrão */
  afflictionConditionalRules?: SkillAfflictionConditionalRule[];
  // Roubo de Vida (Vampirismo): rouba vida do alvo por turno; o conjurador recupera o dano causado (Dano Normal: sofre redução e escudo)
  stealLifeVal?: number;
  stealLifeDuration?: number;
  stealLifeTarget?: TargetOverride;
  stealLifeIrremovable?: boolean;
  stealLifeRemoveType?: string;
  paralyzeCooldownDuration?: number;
  /** AUMENTAR COOLDOWN: enquanto o debuff durar, cada skill que o alvo usar ganha +X de cooldown (ex.: skill de 1 cooldown vira 2) */
  cooldownIncreaseAmount?: number;
  /** Duração do debuff de aumento de cooldown em turnos */
  cooldownIncreaseDuration?: number;
  /** Alvo do debuff de aumento de cooldown (ex: Target, AllEnemies) */
  cooldownIncreaseTarget?: TargetOverride;
  /** Debuff de aumento de cooldown não pode ser removido */
  cooldownIncreaseIrremovable?: boolean;
  /** Purificação: remove efeitos do alvo ao aplicar (all, debuff, etc.) */
  cooldownIncreaseRemoveType?: string;
  cannotReduceDamageDuration?: number;
  cannotBeInvulnerableDuration?: number;
  cannotReceiveFriendlyDuration?: number;
  /** Negação de efeitos amigáveis: enquanto ativo no alvo, TODOS os efeitos amigáveis (buff de dano, invulnerabilidade, redução de dano, cura, escudo etc.) são IGNORADOS por esta duração */
  negateFriendlyDuration?: number;
  negateFriendlyTarget?: TargetOverride;
  negateFriendlyIrremovable?: boolean;
  negateFriendlyRemoveType?: string;
  ignoreStunDuration?: number;
  damageImmunityDuration?: number;
  /** Se true, a imunidade a dano só bloqueia o PRIMEIRO dano recebido e depois é consumida */
  damageImmunityFirstHitOnly?: boolean;
  revealInvisibleDuration?: number;
  captureAndArrest?: boolean;

  // New Durations
  damageDuration?: number;
  /** 🔄 Dano Normal: se verdadeiro, a duração do dano contínuo passa a ser o TOTAL de stacks
   * do tipo configurado que o conjurador possuir no momento do uso */
  damageStacksAsDuration?: boolean;
  /** StackType (autocomplete) cuja contagem define a duração do dano */
  damageStacksAsDurationType?: string;
  directDamageDuration?: number;
  healDuration?: number;

  /** Dano ATRASADO (Dano Normal): no PRÓXIMO turno (não neste), o alvo recebe X de dano normal */
  delayedDamage?: number;
  /** Em quantos turnos o dano normal atrasado é efetuado (padrão 1 = próximo turno) */
  delayedDamageTurns?: number;
  /** Dano ATRASADO (Dano Direto): no PRÓXIMO turno (não neste), o alvo recebe X de dano direto/perfurante */
  delayedDirectDamage?: number;
  /** Em quantos turnos o dano direto atrasado é efetuado (padrão 1 = próximo turno) */
  delayedDirectDamageTurns?: number;
  /** Invulnerabilidade ATRASADA (Desvio): no PRÓXIMO turno, o alvo fica invulnerável por X turnos (usa os mesmos tipos/classes do Desvio) */
  delayedInvulnerableDuration?: number;
  /** Em quantos turnos a invulnerabilidade atrasada é efetuada (padrão 1 = próximo turno) */
  delayedInvulnerableTurns?: number;

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
  cannotReceiveFriendlyTarget?: TargetOverride;
  ignoreStunTarget?: TargetOverride;
  damageImmunityTarget?: TargetOverride;
  invulnerableTarget?: TargetOverride;
  invisibleTarget?: TargetOverride;
  revealInvisibleTarget?: TargetOverride;
  gainChakraTarget?: TargetOverride;
  drainChakraTarget?: TargetOverride;
  removeChakraTarget?: TargetOverride;
  stealChakraTarget?: TargetOverride;

  cleanseDebuffs?: boolean;
  cleanseDebuffTypes?: string[];
  cleanseDebuffTarget?: TargetOverride;

  /** Remover buffs amigáveis do alvo (damage_buff, damage_reduction, shield, invulnerable, etc.) */
  cleanseBuffs?: boolean;
  cleanseBuffTypes?: string[];
  cleanseBuffTarget?: TargetOverride;

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
  cannotReceiveFriendlyRemoveType?: string;
  ignoreStunRemoveType?: string;
  damageImmunityRemoveType?: string;
  invulnerableRemoveType?: string;
  gainChakraRemoveType?: string;
  drainChakraRemoveType?: string;
  removeChakraRemoveType?: string;
  stealChakraRemoveType?: string;
  removeShieldRemoveType?: string;
  invisibleRemoveType?: string;
  revealInvisibleRemoveType?: string;
  counterAttackRemoveType?: string;
  reflectRemoveType?: string;
  retaliateDamageRemoveType?: string;

  // ==============================
  // Retaliation / Reactive Damage
  // ==============================
  retaliateDamage?: boolean;
  retaliateDamageVal?: number;
  retaliateDamageDuration?: number;
  retaliateDamagePermanent?: boolean;
  retaliateDamageType?: 'damage' | 'direct_damage' | 'piercing' | 'affliction' | 'dot' | 'bleeding' | 'true';
  retaliateTargetScope?: 'self' | 'ally' | 'self_or_ally' | 'team';
  retaliateTriggerMode?: 'always' | 'first_only';
  retaliateDamageTarget?: TargetOverride;
  retaliateDamageIrremovable?: boolean;
  /** Classes de skill que disparam a retaliação (vazio = todas) */
  retaliateClasses?: string[];

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
  /** Aflição por turno: se o alvo já tiver qualquer aflição ativa, não aplica outra (sem stack) */
  afflictionNoStack?: boolean;
  paralyzeCooldownIrremovable?: boolean;
  cannotReduceDamageIrremovable?: boolean;
  cannotBeInvulnerableIrremovable?: boolean;
  cannotReceiveFriendlyIrremovable?: boolean;
  ignoreStunIrremovable?: boolean;
  damageImmunityIrremovable?: boolean;
  gainChakraIrremovable?: boolean;
  drainChakraIrremovable?: boolean;
  removeChakraIrremovable?: boolean;
  stealChakraIrremovable?: boolean;
  removeShieldIrremovable?: boolean;
  invulnerableIrremovable?: boolean;
  /** ===== Invulnerabilidade TOTAL (independente da Invulnerabilidade/Desvio acima — pode coexistir) ===== */
  totalInvulnerableDuration?: number;
  totalInvulnerableTypes?: ('damage' | 'direct_damage' | 'affliction' | 'bleeding' | 'dot' | 'mental' | 'physical' | 'chakra' | 'ranged' | 'friendly' | 'stun' | 'all')[];
  /** Classes de skill (skill.classes) contra as quais o alvo fica invulnerável TOTAL (protegido delas). Vazio = proteção por tipos. */
  totalInvulnerableClasses?: string[];
  totalInvulnerableTarget?: TargetOverride;
  totalInvulnerableRemoveType?: string;
  totalInvulnerableIrremovable?: boolean;
  invisibleIrremovable?: boolean;
  revealInvisibleIrremovable?: boolean;
  // ==============================
// Counter Attack
// ==============================

counterAttack?: boolean;
  counterAttackDuration?: number;
  counterAttackType?: 'attacker' | 'defender';
  counterAttackMode?: 'first' | 'all';
  /** Anular apenas skills destas classes (vazio = anula qualquer skill). Ex.: ['Físico', 'Chakra'] */
  counterAttackClasses?: string[];
  /** Fica ativo por tempo INFINITO e só é removido quando de fato contra-atacar uma habilidade (persiste até acertar) */
  counterAttackUntilTriggered?: boolean;
  counterAttackTarget?: TargetOverride;

counterAttackIrremovable?: boolean;
counterAttackCannotBeCountered?: boolean;
counterAttackCannotBeReflected?: boolean;

// ==============================
// Redirection / Bodyguard
// ==============================

redirectOffensiveToCaster?: boolean;
/** Se verdadeiro, usar esta habilidade em SI MESMO remove o efeito Guarda-Costas do conjurador
 * (em vez de aplicar/atualizar a proteção nos aliados) */
redirectOffensiveRemoveOnSelfCast?: boolean;
  /** ♻️ Usar esta skill de novo enquanto ela está ativa CANCELA o efeito anterior (portador volta a ficar vulnerável) em vez de reaplicar */
  cancelSelfOnReuse?: boolean;
redirectOffensiveDuration?: number;
redirectOffensiveScope?: 'ally' | 'team';
redirectOffensiveTarget?: TargetOverride;
redirectOffensiveIrremovable?: boolean;
redirectOffensiveRemoveType?: string;


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
   
   permanent?: boolean; // If true, skill stays forever (shows � ∞ instead of turn count)
   blocksOffensiveSkills?: boolean;
   
   // ==============================
   // STACK SYSTEM - Acumular efeitos
  // ==============================
/** Se true, o efeito desta skill pode acumular stacks no mesmo alvo */
   stackable?: boolean;
   /** Nome do tipo de stack para agrupar (ex: 'Marca', 'Veneno', 'Cortes') */
   stackType?: string;
   /** Duração da stack em turnos no oponente (padrão: 999 = praticamente permanente) */
   stackDuration?: number;
   /** Onde aplicar as stacks quando a skill é usada (padrão: 'Target') */
   stackTarget?: TargetOverride;
   /** Se true, a stack já está ativa no início da batalha (passiva, sem precisar usar a skill) */
   stackStartActive?: boolean;
   /** Quantidade de stacks iniciais quando stackStartActive é true (padrão: 1) */
   stackStartCount?: number;
   /** Como a stack ganha stacks adicionais: 'turn' (a cada turno), 'skill' (quando o personagem usa qualquer skill) ou 'both' */
   stackGainMode?: 'turn' | 'skill' | 'both';
   /** Quantidade de stacks ganhas por ganho (por turno ou por skill usada) (padrão: 1) */
   stackGainAmount?: number;
/** Se definido, quando a stack atingir esse valor ela reseta para 1 (limite + reset) */
    stackCapReset?: number;
    /** Se true, o inimigo que ATACAR o portador desta stack recebe a mesma stack (marca quem atacou) */
    stackApplyOnAttack?: boolean;
    /** Duração em turnos da stack aplicada no inimigo que atacou (99999 = infinito). Vazio = usa a duração da própria stack */
    stackApplyOnAttackDuration?: number;
    /** Se true, a stack NÃO acumula: fica sempre em 1x mesmo sendo reaplicada */
    stackNonCumulative?: boolean;
    /** ⏳ Atraso de stack: ao usar a skill a stack NÃO é aplicada na hora — fica pendente e é aplicada após X turnos */
    stackDelayTurns?: number;
    /** 🏷️ Auto-aplicar as stacks no início da batalha se o personagem tiver QUALQUER uma destas Tags/Afiliações (separadas por vírgula, com autocomplete) */
    stackStartTags?: string[];

  // ==============================
  // SPLASH/AOE DAMAGE - Dano em área
  // ==============================
  /** Dano secundário aplicado aos outros alvos (splash) */
  splashDamage?: number;
  /** Para onde o splash dano vai (padrão: mesmo que targetType) */
  splashTarget?: TargetOverride;

  // ==============================
  // STACK DAMAGE RULES - Dano por stack no alvo
  // ==============================
  /** Regras de dano adicional baseado em stacks no alvo */
  stackDamageRules?: SkillStackDamageRule[];
  /** Regras de duração extendida quando o alvo possui stacks do tipo especificado */
  stackDurationRules?: SkillStackDurationRule[];
  /** Aumento de dano por stack em mim mesmo */
  selfStackDamageRules?: SkillSelfStackDamageRule[];
  /** Redução de dano por stack em mim mesmo (buff de redução no conjurador escalando com minhas stacks) */
  selfStackReductionRules?: SkillSelfStackReductionRule[];

  // ==============================
  // CHAKRA COST INCREASE - Aumentar custo de chakra do inimigo
  // ==============================
  /** Tipos de chakra cujo custo será aumentado (ex: ['Nin', 'Tai']) */
  chakraCostIncreaseTypes?: ChakraType[];
  /** Tipos de skill afetados pelo aumento (physical, mental, affliction, chakra, ranged, friendly) */
  chakraCostIncreaseSkillTypes?: string[];
  /** Duração do debuff em turnos */
  chakraCostIncreaseDuration?: number;
  /** Alvo do debuff (ex: Target, AllEnemies) */
  chakraCostIncreaseTarget?: TargetOverride;
  /** Debuff não pode ser removido */
  chakraCostIncreaseIrremovable?: boolean;
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
  | 'SelfAndAllEnemies'
  | 'RandomEnemy'
  | 'RandomAlly'
  | 'AllEnemiesExceptTarget'
  | 'AllAlliesExceptTarget';

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
  | 'damage_to_shield'
  | 'damage_reduction'
  | 'damage_reduction_pierce'
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
  | 'cooldown_increase'
  | 'damage'
  | 'direct_damage'
  | 'heal'
  | 'gain_chakra'
  | 'heal_over_time'
  | 'blocks_offensive_skills'
  | 'cannot_reduce_damage'
  | 'cannot_be_invulnerable'
  | 'cannot_receive_friendly'
  | 'negate_friendly_effects'
  | 'ignore_stun'
  | 'shield_stun_immunity'
  | 'damage_immunity'
  | 'damage_debuff'
  | 'damage_vulnerability'
  | 'retaliate_damage'
  | 'immortal'
  | 'heal_over_time'
  | 'gain_chakra'
  | 'reveal_invisible'
  | 'on_skill_use_damage'
  | 'capture_arrest_trap'
  | 'capture_arrest_debuff'
  | 'chakra_cost_increase'
  | 'chakra_cost_reduce'
  | 'redirect_offensive'
  | 'revive_on_death'
  | 'temporary_target_change'
  | 'temporary_damage_boost'
  | 'life_steal'
  | 'redirect_by_stack'
  | 'countdown_bomb'
  | 'no_counter_reflect'
  | 'skill_copy'
  | 'pending_invulnerable'
  | 'death_link';
  value?: number; // magnitude of shield, reduction, damage, etc.
  buffAtCast?: number; // damage_buff value included at cast time (for dynamic tick recomputation)
  /** Novo alvo aplicado pelo efeito temporary_target_change */
  newTargetType?: string;
  /** Turno em que a regra de alvo "uma vez por ativação" foi consumida (reseta ao reativar a condição) */
  targetRuleConsumedAt?: number;
  duration: number; // remaining turns
  damageType?: string;
  /** Quem recebe o dano da bomba (countdown_bomb) quando o tempo acabar: 'holder' = quem tem a bomba, 'enemy' = um inimigo do portador */
  bombTarget?: 'holder' | 'enemy';
  icon?: string; // Icon of the skill that caused this effect/debuff
  sourceSkillName?: string; // Base skill name for grouping debuffs
  stunType?: ('mental' | 'physical' | 'affliction' | 'chakra' | 'ranged' | 'friendly' | string)[];
  invulnerableTypes?: ('damage' | 'direct_damage' | 'affliction' | 'bleeding' | 'dot' | 'mental' | 'physical' | 'chakra' | 'ranged' | 'friendly' | 'stun' | 'all')[];
  invulnerableClasses?: string[];
  /** Marca este efeito como INVULNERABILIDADE TOTAL (sela o personagem: não age e não pode ser alvo nem de aliados). Desvio NÃO usa esta flag. */
  invulnerableTotal?: boolean;
  /** Dano pendente (pending_damage): dano aplicado no PRÓXIMO turno; usado por delayedDamage */
  pendingDamage?: number;
  /** Duração da invulnerabilidade que será aplicada quando o efeito pending_invulnerable disparar */
  pendingInvulnDuration?: number;
  irremovable?: boolean;
  /** Este efeito de dano NÃO pode matar: deixa o alvo com no mínimo 1 de HP (usado pelo Dano Próprio "não mata") */
  cantKill?: boolean;
  regenPerTurn?: boolean; // Se true, gera value de escudo ADICIONAL a cada turno (escudo por turno)
  regenMaxVal?: number; // Limite máximo de escudo para a geração por turno
  cannotBeCountered?: boolean;
  cannotBeReflected?: boolean;

  casterId?: string;
  casterSide?: 'player' | 'enemy';
  isInvisible?: boolean;
  description?: string;
  targetId?: string;
  reflectMode?: 'Caster' | 'RandomAlly';
  reflectType?: 'active' | 'passive';
  reflectCharges?: number;

  // Redirection / Bodyguard (Redirecionar Skills Ofensivas em Mim)
  redirectOffensiveToCaster?: boolean;
  redirectOffensiveDuration?: number;
  redirectOffensiveScope?: 'ally' | 'team';
  redirectOffensiveTarget?: TargetOverride;
  redirectOffensiveIrremovable?: boolean;
  redirectOffensiveRemoveType?: string;
  blocksOffensiveSkills?: boolean; // Se verdadeiro, impede o alvo de usar skills ofensivas
  /** 🚑 Marcador: efeito originado de skill com blocksHealsWhileActive — bloqueia curas no portador */
  blocksHeals?: boolean;
  /** 💜 Valor BASE de aflição por turno (snapshot do cast) — o tick reavalia regras condicionais e ajusta `value` dinamicamente */
  afflictionBaseValue?: number;
counterAttackType?: 'attacker' | 'defender';
  counterAttackMode?: 'first' | 'all';
  /** Anular apenas skills destas classes (vazio = anula qualquer skill) */
  counterAttackClasses?: string[];
  /** Persiste (duração infinita) até efetivamente contra-atacar uma habilidade */
  counterAttackUntilTriggered?: boolean;
  /** Fase do efeito de liberação atrasada: 'locked' (bloqueando) → 'window' (janela liberada) */
  delayedUnlockPhase?: 'locked' | 'window';
  /** Nomes das skills afetadas pela liberação atrasada */
  delayedUnlockSkills?: string[];
  /** Duração (turnos) da janela em que as skills ficam liberadas após o efeito terminar */
  delayedUnlockWindowTurns?: number;
  castTurn?: number;
  /** Quantidade de stacks acumuladas */
  stacks?: number;
  /** Turno até o qual a expiração da stack fica congelada (mecânica Raikiri de ANBU Kakashi) */
  frozenUntilTurn?: number;
  /** Nome do tipo de stack para agrupar */
  stackType?: string;
  /** Se o efeito é stackable (pode acumular) */
  stackable?: boolean;
  /** Se true, o inimigo que ATACAR o portador desta stack recebe a mesma stack (marca quem atacou) */
  stackApplyOnAttack?: boolean;
  /** Duração em turnos da stack aplicada no inimigo que atacou (99999 = infinito). Vazio = usa a duração da própria stack */
  stackApplyOnAttackDuration?: number;
  /** Se true, a stack NÃO acumula: fica sempre em 1x mesmo sendo reaplicada */
  stackNonCumulative?: boolean;
  /** Tipos de chakra cujo custo aumenta enquanto este debuff estiver ativo */
  costIncreaseChakraTypes?: ChakraType[];
  /** Tipos de skill afetados pelo aumento de custo (physical, mental, affliction, chakra, ranged, friendly) */
  costIncreaseSkillTypes?: string[];
  /** Tipos de chakra cujo custo das skills do portador é REDUZIDO enquanto este buff estiver ativo */
  costReduceChakraTypes?: ChakraType[];
  /** Tipos de skill afetados pela redução de custo (physical, mental, affliction, chakra, ranged, friendly) */
  costReduceSkillTypes?: string[];
  /** Duração em turnos do escudo gerado pela conversão de dano em escudo (99999 = infinito) */
  shieldDurationTurns?: number;
  /** Tipos de dano cobertos pela conversão em escudo (vazio/undefined = TODOS) */
  shieldDamageTypes?: string[];
  /** Se true, apenas o PRIMEIRO dano recebido será convertido em escudo */
  shieldFirstHitOnly?: boolean;
  /** Marca se a conversão de 1º dano já foi consumida */
  conversionConsumed?: boolean;
  /** Tipos de dano cobertos pela imunidade a dano (vazio/undefined = TODO o dano) */
  immunityTypes?: string[];
  /** 🛡️ Proteção "no_counter_reflect": impede que as skills do portador sejam CONTRA-ATACADAS (padrão: true) */
  noCounterProtect?: boolean;
  /** 🛡️ Proteção "no_counter_reflect": impede que as skills do portador sejam REFLETIDAS (padrão: true) */
  noReflectProtect?: boolean;
  /** Se true, este debuff (ex: DoT infinito) é removido quando o alvo usa uma skill amigável/passiva */
  removedOnFriendlySkillUse?: boolean;
  /** Se true, esta imunidade a dano é consumida após bloquear o primeiro dano recebido */
  firstHitOnly?: boolean;
  /** Tipos de chakra gerados pelo gainChakra: 'Tai' | 'Nin' | 'Gen' | 'Blood' | 'Rand' | 'Existing' (vazio = aleatório) */
  gainChakraTypes?: string[];
  /** Tipos de dano que este debuff afeta (para damage_debuff) */
  debuffTypes?: string[];
  /** Classes de skill que recebem dano adicional enquanto este efeito estiver ativo (para damage_vulnerability): physical, mental, affliction, chakra, ranged, friendly */
  vulnerabilityTypes?: string[];
  buffTypes?: string[]; // Classes de skill que o damage_buff aumenta (vazio = todas)
  retaliateDamageVal?: number;
  retaliateDamageType?: 'damage' | 'direct_damage' | 'piercing' | 'affliction' | 'dot' | 'bleeding' | 'true';
  retaliateTargetScope?: 'self' | 'ally' | 'self_or_ally' | 'team';
  retaliateTriggerMode?: 'always' | 'first_only';
  retaliateTriggeredCount?: number;
  /** Classes de skill que disparam a retaliação (vazio = todas) */
  retaliateClasses?: string[];
  redirectCasterId?: string;
  excludeAffliction?: boolean;
  /** Classes de skill que NÃO sofrem o debuff (fraqueza por classe, ex: excludeClasses: ['mental']) */
  excludeClasses?: string[];
  permanent?: boolean;
  /** ⏳ Stack pendente (stackDelayTurns): turnos restantes até a stack ser aplicada */
  stackPendingTurns?: number;
  /** ⏳ Quantidade de stacks acumuladas aguardando aplicação */
  stackPendingStacks?: number;
  /** ⏳ Duração final da stack quando ela for aplicada (guardada porque o alvo pode não ter a skill de origem) */
  stackPendingDuration?: number;
  /** Cópia de Habilidades: as habilidades ORIGINAIS do conjurador guardadas para restaurar quando o efeito expirar */
  storedSkills?: Skill[];
  /** Turnos restantes de atraso antes do efeito (bleeding/affliction) começar a causar dano */
  delayTurns?: number;
}

export interface CombatCharacter {
  id: string; // unique combat id, e.g. 'player-0', 'enemy-2'
  character: Character;
  health: number;
  maxHealth: number;
  shield: number;
  shieldExpiresTurn?: number;
  activeEffects: ActiveEffect[];
  isDead: boolean;
  hasRevived?: boolean; // Se o personagem já ressuscitou nesta partida (reviveOnDeath)
  lastTurnStatus?: 'ANULADO' | 'REFLETIDO' | 'CONTRA-ATAQUE' | null;
  /** Contagem de usos BEM-SUCEDIDOS por nome de skill (para o limite maxUses). Anulado por contra-ataque não incrementa. */
  skillUseCounts?: Record<string, number>;
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
  xp?: number;
  rank?: string;
  wins?: number;
  losses?: number;
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
  equippedBannerPositionY?: number;
  equippedBannerPositionX?: number;
  equippedShowcaseSkinUrl?: string;
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
  category?: string;
  requiredQuestIds: string[]; // Missões necessárias para estar liberada
  goals: QuestGoal[];
  rewards: QuestReward[];
  completed: boolean;
}

export function getEffectiveSkillCost(skill: Skill, sourceChar?: CombatCharacter, allCombatants?: CombatCharacter[]): ChakraType[] {
  if (!skill) return [];

  if (skill.noChakraCost) {
    return [];
  }

  if (!skill.cost) {
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
        // OVERRIDE COST (Specific chakra cost requirement OR 0 cost / free skill)
        if (rule.overrideCost !== undefined) {
          return [...rule.overrideCost];
        }

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

  // Chakra cost increase debuff: raises the cost of matching chakra types for matching skill types
  if (sourceChar && sourceChar.activeEffects) {
    const skillTypes = getSkillCombatTypes(skill);
    for (const eff of sourceChar.activeEffects) {
      if (eff.type !== 'chakra_cost_increase') continue;
      if (!eff.costIncreaseChakraTypes || eff.costIncreaseChakraTypes.length === 0) continue;
      if (eff.costIncreaseSkillTypes && eff.costIncreaseSkillTypes.length > 0) {
        const matchesSkillType = eff.costIncreaseSkillTypes.some(t => skillTypes.includes(t));
        if (!matchesSkillType) continue;
      }
      for (const ct of eff.costIncreaseChakraTypes) {
        currentCost.push(ct);
      }
    }
  }

  // Chakra cost reduction buff: lowers the cost of matching chakra types for matching skill types.
  // Só reduz chakra dos tipos escolhidos presentes no custo da skill (skills que não possuam o tipo não são afetadas).
  if (sourceChar && sourceChar.activeEffects) {
    const skillTypes = getSkillCombatTypes(skill);
    for (const eff of sourceChar.activeEffects) {
      if (eff.type !== 'chakra_cost_reduce') continue;
      if (!eff.costReduceChakraTypes || eff.costReduceChakraTypes.length === 0) continue;
      if (eff.costReduceSkillTypes && eff.costReduceSkillTypes.length > 0) {
        const matchesSkillType = eff.costReduceSkillTypes.some(t => skillTypes.includes(t));
        if (!matchesSkillType) continue;
      }
      const amt = Math.max(0, eff.value || 1);
      for (let i = 0; i < amt; i++) {
        const idx = currentCost.findIndex(c => eff.costReduceChakraTypes!.includes(c));
        if (idx === -1) break;
        currentCost.splice(idx, 1);
      }
    }
  }

  return currentCost;
}

export function getSkillCombatTypes(skill: Skill | null): string[] {
  if (!skill) return [];
  const classes = (skill.classes || []).map(c => c.toLowerCase());
  const types: string[] = [];
  if (classes.some(cls => ['physical', 'físico', 'fisico', 'taijutsu', 'melee', 'corpo a corpo'].includes(cls))) types.push('physical');
  if (classes.some(cls => ['mental', 'genjutsu'].includes(cls))) types.push('mental');
  if (classes.some(cls => ['affliction', 'aflição', 'aflicao', 'affliction'].includes(cls))) types.push('affliction');
  if (classes.some(cls => ['chakra', 'ninjutsu'].includes(cls))) types.push('chakra');
  if (classes.some(cls => ['ranged', 'à distância', 'distância', 'distancia'].includes(cls))) types.push('ranged');
  if (classes.some(cls => ['friendly', 'suporte', 'cura', 'heal', 'amigável', 'amigavel'].includes(cls))) types.push('friendly');
  return types;
}

export function getEffectiveTargetType(
  skill: Skill,
  sourceChar?: CombatCharacter,
  allCombatants?: CombatCharacter[],
  currentTurn?: number
): SkillTargetType {
  if (!skill) return 'Enemy';
  const defaultTarget = skill.targetType || 'Enemy';

  if (sourceChar && sourceChar.activeEffects && skill.targetRules && skill.targetRules.length > 0) {
    const otherCombatants = (allCombatants || []).filter(c => c.id !== sourceChar.id);
    const allActiveEffects = [
      ...sourceChar.activeEffects,
      ...otherCombatants.flatMap(c => c.activeEffects),
    ];

    for (const rule of skill.targetRules) {
      if (!rule.activeSkillName || !rule.overrideTarget) continue;
      const targetNameLower = rule.activeSkillName.trim().toLowerCase();

      const matchedEffect = allActiveEffects.find(e => {
        if (!e.name) return false;
        const eNameLower = e.name.toLowerCase();
        return (
          eNameLower === targetNameLower ||
          eNameLower.startsWith(targetNameLower) ||
          eNameLower.includes(targetNameLower)
        );
      });

      if (!matchedEffect) continue;

      // Regra "uma vez por ativação": o marcador guarda o turno do 1º uso.
      // Usos no MESMO turno (a própria resolução) ainda valem; turnos seguintes ignoram até reativar a condição.
      if (rule.oncePerActivation && (matchedEffect as any).targetRuleConsumedAt && (matchedEffect as any).targetRuleConsumedAt !== currentTurn) {
        continue;
      }

      return rule.overrideTarget;
    }
  }

  // Regras de mudança de alvo por marcação (stack): quando a janela temporária estiver ativa no conjurador
  if (sourceChar && sourceChar.activeEffects && skill.targetChangeOnStacksRules && skill.targetChangeOnStacksRules.length > 0) {
    for (const rule of skill.targetChangeOnStacksRules) {
      if (!rule.markingSkillName || !rule.overrideTarget) continue;
      const hasWindow = sourceChar.activeEffects.some(e =>
        e.type === 'temporary_target_change' && (e.stackType || '') === rule.markingSkillName
      );
      if (hasWindow) {
        return rule.overrideTarget as SkillTargetType;
      }
    }
  }

  return defaultTarget;
}

export function getEffectiveCooldown(
  skill: Skill,
  sourceChar?: CombatCharacter,
  allCombatants?: CombatCharacter[]
): number {
  if (!skill) return 0;
  const defaultCd = skill.cooldown ?? 0;

  if (sourceChar && sourceChar.activeEffects && skill.cooldownRules && skill.cooldownRules.length > 0) {
    const otherCombatants = (allCombatants || []).filter(c => c.id !== sourceChar.id);
    const allActiveEffects = [
      ...sourceChar.activeEffects,
      ...otherCombatants.flatMap(c => c.activeEffects),
    ];

    for (const rule of skill.cooldownRules) {
      if (!rule.activeSkillName) continue;
      const targetNameLower = rule.activeSkillName.trim().toLowerCase();

      const isReqActive = allActiveEffects.some(e => {
        if (!e.name) return false;
        const eNameLower = e.name.toLowerCase();
        return (
          eNameLower === targetNameLower ||
          eNameLower.startsWith(targetNameLower) ||
          eNameLower.includes(targetNameLower)
        );
      });

      if (isReqActive && rule.overrideCooldown !== undefined) {
        return rule.overrideCooldown;
      }
    }
  }

  return defaultCd;
}