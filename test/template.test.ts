import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIES } from '../src/categories.ts';
import { formatDate, renderHtml } from '../src/template.ts';

test('les 6 catégories du modèle ont leur couleur, leur nom et leur sous-titre', () => {
  const expected: Record<string, [string, string, string]> = {
    'GCC': ['#B4552F', 'GCC', 'Coordination'],
    'Culte Franco': ['#5E7487', 'Culte Franco', 'Louange'],
    'EDD': ['#6E7B5C', 'EDD', 'École du dimanche'],
    'DA': ['#A86A7A', 'DA', 'Direction artistique'],
    'Campus GCC': ['#C48A3A', 'Campus', 'GCC'],
    'Autre': ['#8C7B6B', 'Autre', 'Sujet libre'],
  };
  assert.deepEqual(Object.keys(CATEGORIES).sort(), Object.keys(expected).sort());
  for (const [name, [color, label, subtitle]] of Object.entries(expected)) {
    const html = renderHtml({ titre: 'T', date: '2026-11-09', categorie: name });
    assert.ok(html.includes(`--cat:${color}`), name);
    assert.ok(html.includes(`<b>${label}</b><span>${subtitle}</span>`), name);
  }
});

test('dates : jour précis ou mois seul', () => {
  assert.equal(formatDate('2026-11-09'), '9 novembre 2026');
  assert.equal(formatDate('2026-11'), 'Novembre 2026');
  assert.equal(formatDate('Réunion 4/10'), 'Réunion 4/10');
});

test('le texte est échappé et **gras** est rendu', () => {
  const html = renderHtml({
    titre: 'A <b>', date: '2026-11',
    blocs: [{ type: 'questions', elements: [{ texte: '<script>x</script> **oui**' }] }],
  });
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt; <b>oui</b>'));
});

test('blocs vides non affichés, « À retenir » limité à 3 points', () => {
  const html = renderHtml({
    titre: 'T', date: '2026-11',
    a_retenir: [1, 2, 3, 4].map((i) => ({ titre: `Point ${i}` })),
    blocs: [{ type: 'nouveautes', titre: 'Rien de neuf', elements: [] }],
  });
  assert.ok(!html.includes('Rien de neuf'));
  assert.ok(html.includes('Point 3') && !html.includes('Point 4'));
});
