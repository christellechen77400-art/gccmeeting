import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CATEGORIES } from '../src/categories.ts';
import { render } from '../src/render.ts';
import { formatDate, renderHtml } from '../src/template.ts';

test('les 6 catégories ont la couleur de service de la charte GCC, leur nom et leur sous-titre', () => {
  const expected: Record<string, [string, string, string]> = {
    'GCC': ['#cf2a20', 'GCC', 'Coordination'],
    'Culte Franco': ['#2d5a65', 'Culte Franco', 'Louange'],
    'EDD': ['#3b6d11', 'EDD', 'École du dimanche'],
    'DA': ['#9d3c63', 'DA', 'Direction artistique'],
    'Campus GCC': ['#2471a3', 'Campus GCC', 'GCC'],
    'Autre': ['#6c6c72', 'Autre', 'Sujet libre'],
  };
  assert.deepEqual(Object.keys(CATEGORIES).sort(), Object.keys(expected).sort());
  for (const [name, [color, label, subtitle]] of Object.entries(expected)) {
    const html = renderHtml({ titre: 'T', date: '2026-11-09', categorie: name });
    assert.ok(html.includes(`--cat:${color}`), name);
    assert.ok(html.includes(`<i class="dot"></i>${label} · ${subtitle}</div>`), name);
  }
  // Sous-titre donné (le groupe de la réunion) : il remplace celui par défaut.
  assert.ok(renderHtml({ titre: 'T', date: '2026-11', categorie: 'Culte Franco', sous_titre: 'Musiciens' })
    .includes('<i class="dot"></i>Culte Franco · Musiciens</div>'));
});

test('charte GCC : signature GCC Meeting, « À retenir » teinté et numéroté, objectif en couleur pleine', () => {
  const html = renderHtml({
    titre: 'T', date: '2026-11', a_retenir: [{ titre: 'Un' }, { titre: 'Deux' }],
    blocs: [{ type: 'objectif', titre: 'But' }, { type: 'cartes', titre: 'Sujets', elements: [{ titre: 'A' }] }],
  });
  assert.ok(html.includes('<img src="data:image/png;base64,') && html.includes('GCC <span>Meeting</span>'));
  assert.ok(html.includes('<div class="panel tint">'));
  assert.ok(html.includes('<span class="num">1</span><div><b>Un</b>') && html.includes('<span class="num">2</span><div><b>Deux</b>'));
  assert.ok(html.includes('.goal{background:var(--deep)') && html.includes('.row .num{flex:none;width:6mm;height:6mm;border-radius:50%;background:var(--deep)'));
  // Grandes surfaces : rouge plus profond pour GCC, la couleur de la catégorie sinon.
  assert.ok(renderHtml({ titre: 'T', date: '2026-11', categorie: 'GCC' }).includes('--cat:#cf2a20;--deep:#a8261d;'));
  assert.ok(renderHtml({ titre: 'T', date: '2026-11', categorie: 'EDD' }).includes('--cat:#3b6d11;--deep:#3b6d11;'));
  assert.ok(html.includes('<h2 class="sec">Sujets</h2>'));
  assert.ok(html.includes('font-family:"Inter"'));
  // Un mot en gras dans le détail d'un point reste dans la phrase (pas de retour à la ligne).
  assert.ok(html.includes('.row>div>b{display:block}') && !html.includes('.row b{display:block}'));
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

test('le bloc questions affiche titre, texte et tags en cartes', () => {
  const html = renderHtml({
    titre: 'T', date: '2026-11',
    blocs: [{ type: 'questions', elements: [{ titre: 'Nouveaux musiciens ?', texte: 'Pour le groupe Bonté.', tags: ['Mina C.'] }] }],
  });
  assert.ok(html.includes('<div class="card"><svg class="ico lg"><use href="#help"/></svg>'));
  assert.ok(html.includes('<h3>Nouveaux musiciens ?</h3><p>Pour le groupe Bonté.</p>'));
  assert.ok(html.includes('<span class="tag">Mina C.</span>'));
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

test('rendu : dépassement d\'une page mesuré (0 si ça tient), PNG d\'une seule image en hauteur', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-'));
  assert.equal((await render('exemples/musiciens.json', dir)).overflow, 0);
  const long = await render('exemples/tous-les-blocs.json', dir);
  assert.ok(long.overflow > 0, `dépassement : ${long.overflow} %`);
  // Hauteur lue dans l'en-tête PNG (×2) : plus haute qu'une page A4, donc une seule image, sans coupure.
  assert.ok(readFileSync(long.png).readUInt32BE(20) > 2 * 1123);
});
