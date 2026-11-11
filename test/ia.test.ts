import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { extractTextFromFile } from '../src/extract.ts';
import { AiCompteRenduSchema, COMPTE_RENDU_TOOL } from '../src/schema.ts';
import { renderHtml } from '../src/template.ts';

test('les exemples validés respectent le schéma demandé à l\'IA', () => {
  for (const file of ['exemples/musiciens.json', 'exemples/tous-les-blocs.json']) {
    const { categorie, sous_titre, ...ai } = JSON.parse(readFileSync(file, 'utf-8'));
    const result = AiCompteRenduSchema.safeParse(ai);
    assert.ok(result.success, `${file} : ${result.success ? '' : result.error.message}`);
  }
});

test('le schéma refuse un type de bloc ou un picto inconnu', () => {
  const base = { titre: 'T', date: '2026-11', participants: [], a_retenir: [], a_confirmer: [] };
  assert.equal(AiCompteRenduSchema.safeParse({ ...base, blocs: [{ type: 'resume' }] }).success, false);
  assert.equal(AiCompteRenduSchema.safeParse({ ...base, blocs: [{ type: 'bilan', picto: 'emoji' }] }).success, false);
});

test('le schéma refuse un compte-rendu sans bloc de contenu (intertitre seul)', () => {
  const base = { titre: 'T', date: '2026-11', participants: [], a_retenir: [], a_confirmer: [] };
  assert.equal(AiCompteRenduSchema.safeParse({ ...base, blocs: [{ type: 'intertitre', titre: '2027' }] }).success, false);
  assert.equal(AiCompteRenduSchema.safeParse({ ...base, blocs: [{ type: 'bilan', elements: [{ texte: 'x' }] }] }).success, true);
});

test('l\'outil enregistrer_compte_rendu : pas de champ « type » (erreur 422 chez DeepSeek)', () => {
  assert.deepEqual(Object.keys(COMPTE_RENDU_TOOL), ['name', 'description', 'input_schema']);
  assert.equal(COMPTE_RENDU_TOOL.name, 'enregistrer_compte_rendu');
  assert.equal(COMPTE_RENDU_TOOL.input_schema.type, 'object');
  assert.deepEqual(COMPTE_RENDU_TOOL.input_schema.required, ['titre', 'date', 'participants', 'a_retenir', 'blocs', 'a_confirmer']);
});

test('extraction du texte : .txt et .pdf', async () => {
  const txt = await extractTextFromFile('exemples/notes/reunion-gcc.txt');
  assert.ok(txt.startsWith('[GCC] Réunion 4/10'));
  const pdf = await extractTextFromFile('test/fixtures/musiciens.pdf');
  assert.ok(pdf.includes('Réunion des musiciens'));
});

test('extraction du texte : format non pris en charge', async () => {
  await assert.rejects(extractTextFromFile('package.json'), /Format non pris en charge/);
});

test('le gras dans une étape garde le style du texte, pas celui du numéro', () => {
  const html = renderHtml({
    titre: 'T', date: '2026-11',
    blocs: [{ type: 'objectif', titre: 'O', elements: [{ texte: '**Prière** : ensemble' }] }],
  });
  assert.ok(html.includes('<div><span class="n">1</span><b>Prière</b> : ensemble</div>'));
});
