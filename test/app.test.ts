import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app/server.ts';
import { Store } from '../src/app/store.ts';
import type { PipelineInput } from '../src/pipeline.ts';
import { render } from '../src/render.ts';

// Chaîne factice : pas d'appel à l'IA ; elle écrit l'exemple musiciens avec les présents reçus, puis le rend.
async function fakePipeline(input: PipelineInput) {
  calls.push(input);
  input.onStep?.('redaction');
  if (readFileSync(input.file, 'utf-8').includes('ÉCHEC')) throw new Error('Clé API refusée');
  const cr = JSON.parse(readFileSync('exemples/musiciens.json', 'utf-8'));
  const json = join(input.outDir, `${input.name}.json`);
  writeFileSync(json, JSON.stringify({ ...cr, titre: input.titre ?? cr.titre, participants: input.members, absents: input.absents }));
  input.onStep?.('mise_en_page');
  return { json, ...(await render(json, input.outDir)), warnings: [] };
}
const calls: PipelineInput[] = [];
const APP = { 'X-GCC-Meeting': '1' };

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-app-'));
  const server = createApp({ dataDir: dir, pipeline: fakePipeline }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { dir, server, base };
}

async function waitReady(base: string, id: string) {
  for (let i = 0; i < 100; i++) {
    const meta = await (await fetch(`${base}/api/comptes-rendus/${id}`)).json();
    if (meta.etat !== 'en_cours') return meta;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('trop long');
}

test('données : annuaire et groupes repris de config/ au premier lancement, puis gardés', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-data-'));
  const store = new Store(dir);
  assert.deepEqual(store.groups()['Coordination Franco'], ['Jonathan Z.', 'Stéphane Z.', 'Christelle C.']);
  assert.equal(store.directory().length, JSON.parse(readFileSync('config/annuaire.json', 'utf-8')).length);
  writeFileSync(join(dir, 'groupes.json'), '{"Test":["Paul W."]}');
  assert.deepEqual(new Store(dir).groups(), { Test: ['Paul W.'] });
  assert.match(store.newId(new Date('2026-11-12T15:05:12Z')), /^20261112-160512-[0-9a-f]{4}$/);
  assert.equal(store.folder('../../etc'), undefined);
});

test('interface : page, configuration, création depuis des notes collées, PDF et PNG servis', async () => {
  const { server, base, dir } = await start();
  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('GCC <span>Meeting</span>'));
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.deepEqual(config.categories.map((c: { nom: string }) => c.nom), ['GCC', 'Culte Franco', 'EDD', 'DA', 'Campus GCC', 'Autre']);
    assert.ok(config.groupes.Musiciens.length > 0 && config.annuaire.length > 100);

    const form = new FormData();
    form.append('categorie', 'Culte Franco');
    form.append('groupe', 'Musiciens');
    form.append('date', '2026-11-09');
    form.append('titre', 'Réunion annuelle des musiciens');
    form.append('presents', JSON.stringify(['Jonathan Z.', 'Eva Y.', 'Invité X.']));
    form.append('absents', JSON.stringify(['Esther C.']));
    form.append('notes', 'Absents : Eva\n* Groupes fixes');
    const created = await fetch(`${base}/api/comptes-rendus`, { method: 'POST', body: form, headers: APP });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const meta = await waitReady(base, id);
    assert.equal(meta.etat, 'pret');
    assert.equal(meta.titre, 'Réunion annuelle des musiciens');
    assert.deepEqual(meta.source, { type: 'notes', nom: 'Notes collées', fichier: 'source.txt' });

    // La chaîne reçoit les choix de l'écran : date, titre, groupe, présents et absents, annuaire de data/.
    const input = calls.at(-1)!;
    assert.equal(input.meetingDate, '2026-11-09');
    assert.equal(input.groupe, 'Musiciens');
    assert.deepEqual(input.members, ['Jonathan Z.', 'Eva Y.', 'Invité X.']);
    assert.deepEqual(input.absents, ['Esther C.']);
    assert.ok(input.directory.includes('David S.'));
    assert.equal(readFileSync(input.file, 'utf-8'), 'Absents : Eva\n* Groupes fixes\n');
    assert.ok(existsSync(join(dir, 'comptes-rendus', id, 'meta.json')));

    const pdf = await fetch(`${base}/api/comptes-rendus/${id}/cr.pdf`);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    const png = await fetch(`${base}/api/comptes-rendus/${id}/cr.png`);
    assert.equal(png.headers.get('content-type'), 'image/png');
  } finally {
    server.close();
  }
});

test('interface : fichier déposé, erreurs de saisie, erreur de création, fichiers protégés', async () => {
  const { server, base } = await start();
  try {
    const post = (fields: Record<string, string | Blob>, name?: string) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        if (v instanceof Blob) form.append(k, v, name);
        else form.append(k, v);
      }
      return fetch(`${base}/api/comptes-rendus`, { method: 'POST', body: form, headers: APP });
    };
    const ok = { categorie: 'GCC', date: '2026-10-04' };

    const file = await post({ ...ok, fichier: new Blob(['* Thème 2027']) }, 'notes reunion.txt');
    assert.equal(file.status, 201);
    const meta = await waitReady(base, (await file.json()).id);
    assert.deepEqual(meta.source, { type: 'fichier', nom: 'notes reunion.txt', fichier: 'source.txt' });
    assert.deepEqual(calls.at(-1)!.members, []);

    assert.equal((await (await post({ date: '2026-10-04', notes: 'x' })).json()).erreur, 'Choisis une catégorie.');
    assert.match((await (await post({ ...ok })).json()).erreur, /Dépose un fichier/);
    assert.match((await (await post({ ...ok, groupe: 'Chorale', notes: 'x' })).json()).erreur, /Groupe inconnu/);
    assert.match((await (await post({ ...ok, fichier: new Blob(['x']) }, 'photo.jpg')).json()).erreur, /Format non pris en charge/);

    const failing = await post({ ...ok, notes: 'ÉCHEC' });
    const failed = await waitReady(base, (await failing.json()).id);
    assert.equal(failed.etat, 'erreur');
    assert.equal(failed.erreur, 'Clé API refusée');

    assert.equal((await fetch(`${base}/api/comptes-rendus/${meta.id}/meta.json`)).status, 404);
    assert.equal((await fetch(`${base}/api/comptes-rendus/${meta.id}/source.txt`)).status, 404);
    assert.equal((await fetch(`${base}/api/comptes-rendus/..%2F..%2Fconfig/cr.json`)).status, 404);
  } finally {
    server.close();
  }
});

test('interface : un autre site ne peut ni lire les données ni lancer un compte-rendu', async () => {
  const { server, base } = await start();
  try {
    const form = new FormData();
    form.append('categorie', 'GCC');
    form.append('date', '2026-10-04');
    form.append('notes', 'x');
    // Formulaire envoyé par un autre site : pas d'en-tête de l'interface.
    assert.equal((await fetch(`${base}/api/comptes-rendus`, { method: 'POST', body: form })).status, 403);
    // Nom d'hôte détourné (DNS rebinding) : refusé, même en lecture.
    const port = new URL(base).port;
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve) => {
      request({ host: '127.0.0.1', port, path: '/api/config', headers: { Host: `piege.example:${port}` } }, (res) => resolve(res.statusCode!)).end();
    });
    assert.equal(status, 403);
    assert.equal((await fetch(`http://localhost:${port}/api/config`)).status, 200);
  } finally {
    server.close();
  }
});
