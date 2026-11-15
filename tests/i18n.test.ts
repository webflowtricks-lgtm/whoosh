import assert from 'node:assert/strict';
import test from 'node:test';
import { localizeContentText, translateGameText } from '../src/lib/i18n';
import { getGoalDescription } from '../src/lib/questUtils';
import { getVillageById } from '../src/lib/villages';

test('prefers the configured English content', () => {
  assert.equal(localizeContentText('Título em português', 'English title', 'en'), 'English title');
});

test('does not expose untranslated Portuguese content in English', () => {
  assert.equal(localizeContentText('Descrição em português', undefined, 'en'), 'English translation missing');
  assert.equal(localizeContentText('O oponente usou habilidade no turno 2.', undefined, 'en'), 'English translation missing');
});

test('translates existing event content without English fields', () => {
  assert.equal(localizeContentText('EVENTO NARUTO', undefined, 'en'), 'NARUTO EVENT');
  assert.equal(localizeContentText('Evento Limitado', undefined, 'en'), 'Limited-Time Event');
  assert.equal(
    localizeContentText('Laços de Sangue: Sasuke & Itachi', undefined, 'en'),
    'Blood Ties: Sasuke & Itachi',
  );
  assert.equal(
    localizeContentText('Naruto: O Início de uma Lenda', undefined, 'en'),
    'Naruto: The Beginning of a Legend',
  );
  assert.equal(localizeContentText('Vença 1 batalha na Arena', undefined, 'en'), 'Win 1 battle in the Arena');
});

test('translates seeded character bios and tags', () => {
  assert.match(
    localizeContentText('Um prodígio do Time 7. Buscando poder e vingança, Sasuke ativa seu Sharingan para analisar inimigos, antecipar seus ataques e golpear com relâmpagos letais do Chidori.', undefined, 'en'),
    /^A Team 7 prodigy\./,
  );
  assert.equal(localizeContentText('Vila do Som', undefined, 'en'), 'Sound Village');
  assert.equal(localizeContentText('Vila da Folha', undefined, 'en'), 'Leaf Village');
  assert.equal(localizeContentText('Relâmpago', undefined, 'en'), 'Lightning');
  assert.equal(localizeContentText('Fogo', undefined, 'en'), 'Fire');
  assert.equal(
    localizeContentText(
      'Sasuke se defende, ganhando invulnerabilidade total a todas as habilidades por 1 turno.',
      undefined,
      'en',
    ),
    'Sasuke defends himself, becoming completely invulnerable to all skills for 1 turn.',
  );
});

test('translates default shop items in English', () => {
  assert.equal(localizeContentText('Naruto Modo Sábio', undefined, 'en'), 'Naruto Sage Mode');
  assert.equal(localizeContentText('Renegado S-Rank', undefined, 'en'), 'S-Rank Rogue');
  assert.equal(localizeContentText('Dano Normal', undefined, 'en'), 'Normal Damage');
  assert.equal(localizeContentText('25 de Dano', undefined, 'en'), '25 damage');
  assert.equal(
    localizeContentText('Ganha +15 de Dano para esta habilidade a cada acúmulo (stack) de "Raikiri" no Conjurador (Mim)', undefined, 'en'),
    'Gains +15 damage for this skill for each stack (stack) of "Raikiri" on the caster (self)',
  );
  assert.equal(
    localizeContentText('Reduz a recarga atual de [Rasengan] em 1 turno(s) quando [Foo] estiver ativo', undefined, 'en'),
    'Reduces the current cooldown of [Rasengan] by 1 turn(s) when [Foo] is active',
  );
  assert.equal(
    localizeContentText('Remover Chakra (Byakugan Activation)', undefined, 'en'),
    'Remove Chakra (Byakugan Activation)',
  );
  assert.equal(
    localizeContentText('Remove 1 chakra aleatório do estoque inimigo quando Byakugan Activation estiver ativo', undefined, 'en'),
    'Remove 1 random chakra from the enemy pool when Byakugan Activation is active',
  );
  assert.equal(localizeContentText('Custo Reduzido (Parasite)', undefined, 'en'), 'Reduced Cost (Parasite)');
  assert.equal(localizeContentText('Stun Condicional (Byakugan Activation)', undefined, 'en'), 'Conditional Stun (Byakugan Activation)');
  assert.equal(localizeContentText('Incapaz de Ficar Invulnerável', undefined, 'en'), 'Cannot Become Invulnerable');
  assert.equal(localizeContentText('Retaliação', undefined, 'en'), 'Retaliation');
  assert.equal(localizeContentText('Vínculo de Morte', undefined, 'en'), 'Death Link');
  assert.equal(localizeContentText('-10 de Dano Recebido por 4 Turnos', undefined, 'en'), '-10 damage received for 4 turns');
  assert.equal(localizeContentText('+5 de Dano causado por 2 turnos', undefined, 'en'), '+5 damage dealt for 2 turns');
  assert.equal(localizeContentText('Remove 1 chakra (Aleatório) por 1 Turno', undefined, 'en'), 'Remove 1 random chakra for 1 turn');
  assert.equal(
    localizeContentText('Custa 1 Chakra Aleatório a menos enquanto Eight Trigrams Rotation estiver ativo', undefined, 'en'),
    'Costs 1 less random chakra while Eight Trigrams Rotation is active',
  );
  assert.equal(
    localizeContentText('Skills do alvo custam -1 Taijutsu por 2 Turnos', undefined, 'en'),
    "The target's skills cost 1 less Taijutsu for 2 turns",
  );
  assert.equal(localizeContentText('Drena 1 chakra por turno por 2 Turnos', undefined, 'en'), 'Drains 1 chakra per turn for 2 turns');
  assert.equal(localizeContentText('Imune a stuns por 2 Turnos', undefined, 'en'), 'Immune to stuns for 2 turns');
  assert.equal(
    localizeContentText('Bolsa contendo 1.000 moedas para desbloqueios e compras na loja.', undefined, 'en'),
    'A pouch containing 1,000 coins for unlocks and shop purchases.',
  );
});

test('translates generated invulnerability details shown in battle', () => {
  assert.equal(
    localizeContentText('Fica invulnerável a todos os danos e efeitos por 1 Turno', undefined, 'en'),
    'Becomes invulnerable to all damage and effects for 1 turn',
  );
  assert.equal(
    localizeContentText('Fica com INVULNERABILIDADE TOTAL a todos os danos e efeitos por 2 Turnos', undefined, 'en'),
    'Becomes fully invulnerable to all damage and effects for 2 turns',
  );
  assert.equal(
    localizeContentText('Daqui a 1 turno(s), fica invulnerável a dano normal por 2 Turnos', undefined, 'en'),
    'In 1 turn(s), becomes invulnerable to normal damage for 2 turns',
  );
});

test('translates chakra removal tooltips and battle notifications', () => {
  assert.equal(localizeContentText('Remoção de Chakra (Gentle Fist)', undefined, 'en'), 'Chakra Removal (Gentle Fist)');
  assert.equal(localizeContentText('-2 CHAKRA REMOVIDO', undefined, 'en'), '-2 CHAKRA REMOVED');
  assert.equal(localizeContentText('REMOCAO CHAKRA CONTINUA', undefined, 'en'), 'CONTINUOUS CHAKRA REMOVAL');
  assert.equal(
    localizeContentText(
      '🔥 CHAKRA REMOVIDO: Kakashi removeu 2 chakra (Taijutsu, Ninjutsu) do estoque do oponente!',
      undefined,
      'en',
    ),
    "🔥 CHAKRA REMOVED: Kakashi removed 2 chakra (Taijutsu, Ninjutsu) from the opponent's pool!",
  );
});

test('translates additional generated battle effect details', () => {
  assert.equal(
    localizeContentText('🚑 Enquanto este efeito estiver ativo, o portador NÃO pode ser curado', undefined, 'en'),
    'While this effect is active, its holder cannot be healed',
  );
  assert.equal(
    localizeContentText('Devolve 20 de dano a quem atacar por 2 Turnos', undefined, 'en'),
    'Deals 20 damage back to anyone who attacks for 2 turns',
  );
  assert.equal(
    localizeContentText('Pode mirar e atingir inimigos invulneráveis mesmo com a invulnerabilidade ativa', undefined, 'en'),
    'Can target and hit invulnerable enemies even while invulnerability is active',
  );
  assert.equal(
    localizeContentText('Cada skill usada pelo alvo ganha +1 de cooldown por 2 Turnos', undefined, 'en'),
    'Each skill used by the target gains +1 cooldown for 2 turns',
  );
  assert.equal(
    localizeContentText('Inimigo recebe +10 de dano extra de classes (physical, chakra) por 2 Turnos', undefined, 'en'),
    'Enemy takes +10 bonus damage from classes (physical, chakra) for 2 turns',
  );
  assert.equal(
    localizeContentText('Imune apenas ao PRIMEIRO dano recebido (a imunidade é consumida após bloquear)', undefined, 'en'),
    'Immune only to the first damage hit; the immunity is consumed after blocking',
  );
  assert.equal(
    localizeContentText('Incapaz de receber habilidades amigáveis por 2 Turnos', undefined, 'en'),
    'Cannot receive friendly skills for 2 turns',
  );
  assert.equal(
    localizeContentText('TODOS os efeitos amigáveis (buffs, invulnerabilidade, redução de dano, curas) são ignorados por 2 Turnos', undefined, 'en'),
    'All friendly effects (buffs, invulnerability, damage reduction, healing) are ignored for 2 turns',
  );
  assert.equal(
    localizeContentText('Aumenta o custo (+1 Taijutsu) das habilidades de Físico por 2 Turnos', undefined, 'en'),
    'Increases the cost of physical skills by 1 Taijutsu for 2 turns',
  );
  assert.equal(
    localizeContentText('IGNORA a invulnerabilidade quando Byakugan Activation estiver ativo em MIM', undefined, 'en'),
    'Ignores invulnerability when Byakugan Activation is active on self',
  );
  assert.equal(
    localizeContentText('STUNNA o inimigo por 1 Turno (Stun Completo) quando Byakugan Activation estiver ativo no Oponente', undefined, 'en'),
    'Stuns the enemy for 1 turn (Full stun) when Byakugan Activation is active on the opponent',
  );
  assert.equal(
    localizeContentText('Concede +20 de escudo a MIM por 2 Turnos quando Byakugan Activation estiver ativo em MIM', undefined, 'en'),
    'Grants +20 shield to self for 2 turns when Byakugan Activation is active on self',
  );
  assert.equal(
    localizeContentText('MATA instantaneamente o Oponente que estiver com Byakugan Activation ativo nele e a vida dele estiver com HP ≤ 20 — e VOCÊ também morre (sacrifício)', undefined, 'en'),
    'Instantly kills the opponent with Byakugan Activation active if their HP is 20 or lower — you also die as a sacrifice',
  );
  assert.equal(
    localizeContentText('Imune ao dano (Todos os tipos) por 2 Turnos', undefined, 'en'),
    'Immune to all damage for 2 turns',
  );
  assert.equal(
    localizeContentText('O dano recebido (Todos os tipos) (só o 1º dano) vira escudo por 3 Turnos durante 2 Turnos', undefined, 'en'),
    'Damage received (all types) (first hit only) for 3 turns becomes a shield during 2 turns',
  );
  assert.equal(
    localizeContentText('Reflete a próxima habilidade recebida (de volta pro atacante) por 2 Turnos', undefined, 'en'),
    'Reflects the next incoming skill (back to the attacker) for 2 turns',
  );
  assert.equal(
    localizeContentText('Anula TODAS as habilidades ofensivas usadas pelo alvo por 2 Turnos', undefined, 'en'),
    'Nullifies all offensive skills used by the target for 2 turns',
  );
  assert.equal(
    localizeContentText('Dano Base (20) + 10 de Dano Direto a cada 20 de HP perdido (Alvo)', undefined, 'en'),
    'Base damage (20) + 10 direct damage for every 20 missing HP (target)',
  );
  assert.equal(
    localizeContentText('Causa Dano Direto igual a todo o HP perdido do Conjurador', undefined, 'en'),
    'Deals direct damage equal to all HP lost by the caster',
  );
  assert.equal(
    localizeContentText('Sofre 10 de Dano a cada skill usada por 2 Turnos', undefined, 'en'),
    'Takes 10 damage each time a skill is used for 2 turns',
  );
  assert.equal(
    localizeContentText('Por 2 Turnos, se o conjurador OU o alvo morrer, o outro também morre.', undefined, 'en'),
    'For 2 turns, if the caster OR target dies, the other dies too.',
  );
  assert.equal(
    localizeContentText('Reduz o dano causado pelo inimigo em 10 por 2 Turnos', undefined, 'en'),
    "Reduces the enemy's damage dealt by 10 for 2 turns",
  );
  assert.equal(
    localizeContentText('Marca o alvo até de fato contra-atacar (∞ turnos, sai ao acionar) nas skills ofensivas usadas por ele', undefined, 'en'),
    'Marks the target until the counterattack triggers (infinite duration, removed when triggered) on offensive skills they use',
  );
  assert.equal(
    localizeContentText('Concede +20 de escudo a TODA a minha equipe por 2 Turnos quando Byakugan Activation estiver ativo no Oponente', undefined, 'en'),
    'Grants +20 shield to my entire team for 2 turns when Byakugan Activation is active on the opponent',
  );
});

test('preserves embedded English words while translating game text', () => {
  assert.equal(
    translateGameText('The comparison comes with a pattern', 'en'),
    'The comparison comes with a pattern',
  );
});

test('resolves legacy Portuguese village names', () => {
  assert.equal(getVillageById('Vila do Som')?.id, 'otogakure');
});

test('keeps generated quest goals in English', () => {
  assert.equal(
    getGoalDescription({
      id: 'distinct-skills',
      type: 'use_skill',
      targetValue: 3,
      currentValue: 0,
      distinctCharacters: true,
    }, 'en'),
    'Use skills with 3 different characters',
  );
  assert.equal(
    getGoalDescription({
      id: 'village-team',
      type: 'win_battles_with_tag',
      targetValue: 1,
      currentValue: 0,
      targetTags: ['Vila da Folha'],
    }, 'en'),
    'Win battles with a full team (3 ninjas) with tag Leaf Village',
  );
});
