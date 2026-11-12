import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRuleFields, describeRule, replacementsFrom, rulesFromReplacements, rulesPrompt, type Rule } from '../src/rules.ts';
import { whatsappText } from '../src/whatsapp.ts';

const rules: Rule[] = [
  ...rulesFromReplacements({ Davidson: 'David S.', Gao: '高班' }, '2026-11-12T10:00:00Z'),
  { id: 'r3', type: 'redaction', actif: true, creeLe: '', texte: 'Toujours écrire l\'année avec un mois', detail: '« mars 2027 »' },
  { id: 'r4', type: 'glossaire', actif: true, creeLe: '', terme: 'MD', definition: 'directeur musical' },
  { id: 'r5', type: 'nom', actif: false, creeLe: '', de: 'car Rémi', vers: 'Karémy' },
];

test('règles : remplacements actifs, consigne donnée à l\'IA, champs contrôlés', () => {
  assert.deepEqual(replacementsFrom(rules), { Davidson: 'David S.', Gao: '高班' });
  const prompt = rulesPrompt(rules);
  assert.match(prompt, /# Règles apprises/);
  assert.match(prompt, /- « Davidson » → « David S. »/);
  assert.match(prompt, /- Toujours écrire l'année avec un mois \(« mars 2027 »\)/);
  assert.match(prompt, /- \*\*MD\*\* : directeur musical/);
  assert.doesNotMatch(prompt, /car Rémi/); // règle désactivée
  assert.equal(rulesPrompt(rules.map((r) => ({ ...r, actif: false }))), '');

  assert.deepEqual(checkRuleFields({ type: 'nom', de: ' Davidson ', vers: 'David S.', texte: 'ignoré' }), { type: 'nom', de: 'Davidson', vers: 'David S.' });
  assert.equal(checkRuleFields({ type: 'nom', de: 'x' }), 'Remplis tous les champs de la règle.');
  assert.equal(checkRuleFields({ type: 'autre' }), 'Type de règle inconnu.');
  assert.match(String(checkRuleFields({ type: 'redaction', texte: 'x'.repeat(201) })), /trop long/);
  assert.equal(describeRule({ type: 'glossaire', terme: 'MD', definition: 'directeur musical' }), 'Glossaire : MD · directeur musical');
});

test('texte WhatsApp : titre, À retenir, étapes, présents, gras converti', () => {
  const texte = whatsappText({
    titre: 'Réunion des musiciens', date: '2026-11-09', categorie: 'Culte Franco', sous_titre: 'Musiciens',
    participants: ['Jonathan Z.', 'Eva Y.'], absents: ['Esther C.'],
    a_retenir: [{ titre: 'Groupes fixes', detail: 'Dès **janvier 2027**' }],
    blocs: [{ type: 'prochaines_etapes', titre: 'Étapes', elements: [{ qui: 'Jonathan Z.', texte: 'Planning', quand: 'décembre 2026' }] }],
  });
  assert.equal(texte, [
    '*Réunion des musiciens*', 'Culte Franco · Musiciens · 9 novembre 2026', '',
    '*À retenir*', '1. Groupes fixes : Dès *janvier 2027*', '',
    '*Prochaines étapes*', '• Jonathan Z. : Planning (décembre 2026)', '',
    'Présents (2) : Jonathan Z., Eva Y.', 'Absents : Esther C.', '', 'Compte-rendu complet en PDF.',
  ].join('\n'));
});
