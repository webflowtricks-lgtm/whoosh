import assert from 'node:assert/strict';
import test from 'node:test';
import { localizeContentText } from '../src/lib/i18n';

test('prefers the configured English content', () => {
  assert.equal(localizeContentText('Título em português', 'English title', 'en'), 'English title');
});

test('does not expose untranslated Portuguese content in English', () => {
  assert.equal(localizeContentText('Descrição em português', undefined, 'en'), 'English translation missing');
});

test('translates existing event content without English fields', () => {
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
});
