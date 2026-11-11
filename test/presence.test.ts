import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAbsents, loadDirectory, loadGroups, membersNotInDirectory, resolveGroup, splitPresence } from '../src/participants.ts';
import { applyReplacements, checkCompteRendu } from '../src/postprocess.ts';
import { renderHtml } from '../src/template.ts';

const MEMBERS = ['Jonathan Z.', 'Stéphane Z.', 'Christelle C.', 'David S.'];

test('ligne « Absents : … » en tête des notes : retirée du texte, noms extraits', () => {
  const r = extractAbsents('[GCC] Réunion 4/10\nAbsents : Stéphane, David S.\n\n* Thème 2027');
  assert.deepEqual(r.names, ['Stéphane', 'David S']);
  assert.equal(r.text, '[GCC] Réunion 4/10\n\n* Thème 2027');
});

test('phrase « absents : … » au début d\'une transcription : la suite du texte est gardée', () => {
  const r = extractAbsents('absents : Paul et David S. Bonjour à tous, on commence.');
  assert.deepEqual(r.names, ['Paul', 'David S']);
  assert.equal(r.text, 'Bonjour à tous, on commence.');
});

test('pas de ligne « Absents » en tête : texte inchangé', () => {
  const text = 'Titre\nUn\nDeux\nTrois\nAbsents : Paul';
  assert.deepEqual(extractAbsents(text), { text, names: [] });
});

test('présents = membres du groupe moins les absents (prénom seul ou nom complet, sans accents)', () => {
  const r = splitPresence(MEMBERS, ['stephane', 'David S', 'Inconnu']);
  assert.deepEqual(r.participants, ['Jonathan Z.', 'Christelle C.']);
  assert.deepEqual(r.absents, ['Stéphane Z.', 'David S.']);
  assert.deepEqual(r.unknown, ['Inconnu']);
});

test('groupe : option --groupe, sinon dossier du fichier, sinon aucun', () => {
  const groups = loadGroups();
  assert.ok(groups['Musiciens'].length > 0);
  assert.deepEqual(groups['Coordination Franco'], ['Jonathan Z.', 'Stéphane Z.', 'Christelle C.']);
  assert.equal(resolveGroup(groups, 'notes.txt', 'Musiciens'), 'Musiciens');
  assert.equal(resolveGroup(groups, 'Drive/Culte Franco/Musiciens/notes.txt'), 'Musiciens');
  assert.equal(resolveGroup(groups, 'exemples/notes/reunion-gcc.txt'), undefined);
  assert.throws(() => resolveGroup(groups, 'notes.txt', 'Chorale'), /Groupe inconnu/);
});

test('annuaire : tous les membres des groupes y sont ; un nom inconnu est repéré', () => {
  const directory = loadDirectory();
  for (const [name, members] of Object.entries(loadGroups())) {
    assert.deepEqual(membersNotInDirectory(members, directory), [], name);
  }
  assert.deepEqual(membersNotInDirectory(['Jonathan Z.', 'Inconnu X.'], directory), ['Inconnu X.']);
});

test('remplacements fixes : mots entiers, dans toutes les chaînes', () => {
  const r = applyReplacements({ a: 'EDD Gao', b: ['Davidson arrive', 'Gaoyang'] }, { Gao: '高班', Davidson: 'David S.' });
  assert.deepEqual(r, { a: 'EDD 高班', b: ['David S. arrive', 'Gaoyang'] });
});

test('contrôles : mois sans année (année probable), éléments et longueur', () => {
  const warnings = checkCompteRendu({
    titre: 'T', date: '2026-11', a_retenir: [], a_confirmer: [],
    blocs: [
      { type: 'nouveautes', elements: [{ texte: 'Arrive en mars.' }, { texte: 'Fin décembre 2026.' }, { texte: 'c' }, { texte: 'd' }, { texte: 'e' }] },
      { type: 'bilan', elements: [{ texte: Array(26).fill('mot').join(' ') }] },
    ],
  });
  assert.ok(warnings.some((w) => w.includes('« mars » (probablement 2027)')));
  assert.ok(!warnings.some((w) => w.includes('« décembre »')));
  assert.ok(warnings.some((w) => w.includes('5 éléments')));
  assert.ok(warnings.some((w) => w.includes('Texte de 26 mots')));
});

test('bandeau : présents en gras, absents à part, rien sans groupe', () => {
  const html = renderHtml({ titre: 'T', date: '2026-11', participants: ['Jonathan Z.', 'Christelle C.'], absents: ['Stéphane Z.'] });
  assert.ok(html.includes('<div class="who">Présents : <b>Jonathan Z. · Christelle C.</b></div>'));
  assert.ok(html.includes('<div class="who">Absents : Stéphane Z.</div>'));
  assert.ok(!renderHtml({ titre: 'T', date: '2026-11' }).includes('class="who"'));
});
