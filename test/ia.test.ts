import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { extractTextFromFile } from '../src/extract.ts';
import { AiCompteRenduSchema } from '../src/schema.ts';
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
