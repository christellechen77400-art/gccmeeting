import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAbsents, loadDirectory, loadGroups, membersNotInDirectory, resolveGroup, splitPresence } from '../src/participants.ts';
import { readFileSync } from 'node:fs';
import { applyReplacements, checkCompteRendu, findRepetitions, missingSubjects, removeRepetitions } from '../src/postprocess.ts';
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

test('transcription : « Absent. Paul et Karémy. » au début est reconnu', () => {
  const r = extractAbsents('Absent. Paul et Karémy. Bonjour à tous. Réunion de coordination.');
  assert.deepEqual(r.names, ['Paul', 'Karémy']);
  assert.equal(r.text, 'Bonjour à tous. Réunion de coordination.');
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

const base = { titre: 'T', date: '2026-11', a_retenir: [{ titre: 'Groupes fixes' }], a_confirmer: [] };

test('répétitions entre blocs : repérées (hors « À retenir »), un mot seul ignoré', () => {
  const cr = {
    ...base,
    blocs: [
      { type: 'nouveautes' as const, titre: 'Nouveautés', elements: [{ titre: 'Groupes de louange fixes' }, { titre: 'Nouveau guitariste', texte: 'David S. en mars 2027.' }] },
      { type: 'decisions' as const, titre: 'Décisions', elements: [{ titre: 'Groupes fixes', texte: 'Tous d\'accord.' }] },
      { type: 'cartes' as const, titre: 'Objectifs par instrument', elements: [{ titre: 'Guitaristes', texte: 'Progresser.' }] },
    ],
  };
  assert.deepEqual(findRepetitions(cr), ['« Groupes fixes » (Décisions) revient dans « Groupes de louange fixes » (Nouveautés)']);
});

test('répétitions : aucune dans l\'exemple musiciens validé', () => {
  const { categorie, sous_titre, participants, absents, ...cr } = JSON.parse(readFileSync('exemples/musiciens.json', 'utf-8'));
  assert.deepEqual(findRepetitions(cr), []);
});

test('raccourcissement : un sujet disparu est repéré, une répétition retirée ne l\'est pas', () => {
  const before = { ...base, blocs: [
    { type: 'nouveautes' as const, elements: [{ titre: 'Groupes de louange fixes' }, { titre: 'Campus inter-église' }] },
    { type: 'decisions' as const, elements: [{ titre: 'Groupes fixes' }] },
  ] };
  const after = { ...base, blocs: [{ type: 'nouveautes' as const, elements: [{ titre: 'Groupes de louange fixes' }] }] };
  assert.deepEqual(missingSubjects(before, after), ['Campus inter-église']);
});

test('objectif : éléments avec titre en piliers (picto, titre, texte), sinon étapes numérotées', () => {
  const pillars = renderHtml({ titre: 'T', date: '2026-11', blocs: [{ type: 'objectif', titre: 'Thème', elements: [
    { titre: 'Prière', texte: 'Portée par **Jonathan**.', picto: 'hands' }, { titre: 'Louange', picto: 'music' }] }] });
  assert.ok(pillars.includes('<div class="pillar"><svg class="ico lg w"><use href="#hands"/></svg><div><b>Prière</b><span>Portée par <b>Jonathan</b>.</span></div></div>'));
  assert.ok(!pillars.includes('class="steps"'));
  const steps = renderHtml({ titre: 'T', date: '2026-11', blocs: [{ type: 'objectif', titre: 'O', elements: [{ texte: 'Un' }] }] });
  assert.ok(steps.includes('class="steps"') && !steps.includes('class="pillar"'));
});

test('répétitions restantes retirées par le code : la question est gardée, sinon la première', () => {
  const cr = { ...base, blocs: [
    { type: 'cartes' as const, titre: 'EDD et Bonté', elements: [{ titre: 'Groupe Bonté', texte: 'Nouveaux musiciens à mettre à l\'EDD ?' }, { titre: 'EDD 高班' }] },
    { type: 'nouveautes' as const, titre: 'Nouveautés', elements: [{ titre: 'Groupes de louange fixes' }] },
    { type: 'decisions' as const, titre: 'Décisions', elements: [{ titre: 'Groupes fixes' }] },
    { type: 'questions' as const, titre: 'Questions', elements: [{ titre: 'Nouveaux musiciens à l\'EDD ?', texte: 'Pour le groupe Bonté.' }] },
  ] };
  const r = removeRepetitions(cr);
  assert.deepEqual(r.removed, ['« Groupe Bonté » (EDD et Bonté)', '« Groupes fixes » (Décisions)']);
  assert.deepEqual(r.cr.blocs.map((b) => b.elements?.map((e) => e.titre)), [['EDD 高班'], ['Groupes de louange fixes'], [], ['Nouveaux musiciens à l\'EDD ?']]);
  assert.deepEqual(findRepetitions(r.cr), []);
});

test('consigne : la liste des membres vient de l\'annuaire', () => {
  const prompt = readFileSync('src/prompt.md', 'utf-8');
  assert.ok(prompt.includes('{{annuaire}}'));
  assert.ok(!prompt.includes('Cyliane D.'));
});
