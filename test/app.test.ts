import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app/server.ts';
import { Store } from '../src/app/store.ts';
import type { CorrectionInput } from '../src/correction.ts';
import type { PipelineInput } from '../src/pipeline.ts';
import { render } from '../src/render.ts';

// Chaîne factice : pas d'appel à l'IA ; elle écrit l'exemple musiciens avec les présents reçus, puis le rend.
async function fakePipeline(input: PipelineInput) {
  calls.push(input);
  input.onStep?.('redaction');
  if (readFileSync(input.file, 'utf-8').includes('ÉCHEC')) throw new Error('Clé API refusée');
  const cr = JSON.parse(readFileSync('exemples/musiciens.json', 'utf-8'));
  const json = join(input.outDir, `${input.name}.json`);
  writeFileSync(json, JSON.stringify({
    ...cr, titre: input.titre ?? cr.titre, date: input.meetingDate, categorie: input.categorie, sous_titre: input.groupe,
    participants: input.members, absents: input.absents,
  }));
  const text = join(input.outDir, `${input.name}.texte.txt`);
  writeFileSync(text, readFileSync(input.file, 'utf-8'));
  input.onStep?.('mise_en_page');
  return { json, text, ...(await render(json, input.outDir)), warnings: [] };
}
const calls: PipelineInput[] = [];
const APP = { 'X-GCC-Meeting': '1' };

// Correction factice : « Davidson » devient David S. dans le titre, avec une règle « nom » proposée ;
// une demande « fait » ne propose pas de règle ; « PANNE » échoue.
async function fakeCorrector(input: CorrectionInput) {
  corrections.push(input);
  if (input.demande === 'PANNE') throw new Error('Pas de connexion à l\'API');
  const named = input.demande.includes('Davidson');
  return {
    cr: { ...input.cr, titre: named ? 'Réunion avec David S.' : 'Réunion corrigée', absents: ['Esther C.', 'Eva Y.'] },
    message: 'C\'est corrigé dans le titre.',
    ...(named && { regle: { type: 'nom' as const, de: 'Davidson', vers: 'David S.' } }),
    warnings: ['Contrôle : essai'],
  };
}
const corrections: CorrectionInput[] = [];

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-app-'));
  const server = createApp({ dataDir: dir, pipeline: fakePipeline, corrector: fakeCorrector }).listen(0, '127.0.0.1');
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

async function createFromNotes(base: string, notes = 'Davidson présente le planning', groupe = 'Musiciens') {
  const form = new FormData();
  form.append('categorie', 'Culte Franco');
  form.append('groupe', groupe);
  form.append('date', '2026-11-09');
  form.append('presents', JSON.stringify(['Jonathan Z.', 'Eva Y.']));
  form.append('absents', JSON.stringify(['Esther C.']));
  form.append('notes', notes);
  const res = await fetch(`${base}/api/comptes-rendus`, { method: 'POST', body: form, headers: APP });
  assert.equal(res.status, 201);
  return waitReady(base, (await res.json()).id);
}

const postJson = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { ...APP, 'Content-Type': 'application/json' } });

test('écran 2 : correction, règle retenue ou non, transcription, texte WhatsApp', async () => {
  const { server, base, dir } = await start();
  try {
    // Règles de départ : src/remplacements.json, toutes actives, données à la chaîne.
    const meta = await createFromNotes(base);
    const start = JSON.parse(readFileSync('src/remplacements.json', 'utf-8'));
    assert.deepEqual(Object.fromEntries(calls.at(-1)!.rules!.map((r) => [r.de, r.vers])), start);
    const url = `${base}/api/comptes-rendus/${meta.id}`;
    assert.equal(await (await fetch(`${url}/cr.texte.txt`)).text(), 'Davidson présente le planning\n');

    // Correction avec règle proposée : JSON modifié, PDF/PNG refaits, état mis à jour.
    const pngBefore = readFileSync(join(dir, 'comptes-rendus', meta.id, 'cr.png'));
    const res = await postJson(`${url}/corrections`, { demande: '« Davidson », c\'est David S.' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.index, 0);
    assert.equal(body.correction.reponse, 'C\'est corrigé dans le titre.');
    assert.equal(body.correction.resume, 'Nom : « Davidson » → David S.');
    assert.equal(body.meta.titre, 'Réunion avec David S.');
    assert.deepEqual(body.meta.absents, ['Esther C.', 'Eva Y.']);
    assert.deepEqual(body.meta.avertissements, ['Contrôle : essai']);
    assert.ok(body.meta.modifieLe);
    const input = corrections.at(-1)!;
    assert.equal(input.text, 'Davidson présente le planning\n');
    assert.equal(input.cr.categorie, 'Culte Franco');
    assert.equal(JSON.parse(readFileSync(join(dir, 'comptes-rendus', meta.id, 'cr.json'), 'utf-8')).titre, 'Réunion avec David S.');
    assert.notDeepEqual(readFileSync(join(dir, 'comptes-rendus', meta.id, 'cr.png')), pngBefore);

    // « Retenir comme règle » : règle « nom » ajoutée, active, avec le titre d'origine ; un seul choix possible.
    const chosen = await (await postJson(`${url}/corrections/0/choix`, { choix: 'regle' })).json();
    assert.equal(chosen.resume, 'Nom : « Davidson » → David S.');
    const rules = JSON.parse(readFileSync(join(dir, 'regles.json'), 'utf-8'));
    assert.deepEqual(rules.at(-1), { ...chosen.regle, type: 'nom', de: 'Davidson', vers: 'David S.', actif: true, origine: 'Réunion avec David S.' });
    assert.equal((await postJson(`${url}/corrections/0/choix`, { choix: 'ici' })).status, 409);

    // Sans règle proposée : « Seulement ici » n'ajoute rien ; « Retenir » ferait une consigne de rédaction.
    await postJson(`${url}/corrections`, { demande: 'Le fait est faux' });
    assert.equal((await (await postJson(`${url}/corrections/1/choix`, { choix: 'ici' })).json()).correction.choix, 'ici');
    await postJson(`${url}/corrections`, { demande: 'Toujours écrire l\'année' });
    const style = await (await postJson(`${url}/corrections/2/choix`, { choix: 'regle' })).json();
    assert.equal(style.resume, 'Rédaction : Toujours écrire l\'année');
    assert.equal(JSON.parse(readFileSync(join(dir, 'regles.json'), 'utf-8')).length, rules.length + 1);
    const history = await (await fetch(`${url}/corrections`)).json();
    assert.deepEqual(history.map((c: { choix: string }) => c.choix), ['regle', 'ici', 'regle']);

    // Erreurs : demande vide, IA en panne (rien n'est modifié), choix inconnu, sans en-tête.
    assert.equal((await (await postJson(`${url}/corrections`, { demande: ' ' })).json()).erreur, 'Écris ce qu\'il faut corriger.');
    const broken = await postJson(`${url}/corrections`, { demande: 'PANNE' });
    assert.equal(broken.status, 502);
    assert.match((await broken.json()).erreur, /connexion/);
    assert.equal((await (await fetch(`${url}/corrections`)).json()).length, 3);
    assert.equal((await postJson(`${url}/corrections/9/choix`, { choix: 'regle' })).status, 404);
    assert.equal((await postJson(`${url}/corrections/1/choix`, { choix: 'tout' })).status, 400);
    assert.equal((await fetch(`${url}/corrections`, { method: 'POST', body: '{"demande":"x"}' })).status, 403);

    // Texte WhatsApp du compte-rendu corrigé.
    const { texte } = await (await fetch(`${url}/whatsapp`)).json();
    assert.ok(texte.startsWith('*Réunion corrigée*\nCulte Franco · Musiciens · 9 novembre 2026\n'));
    assert.match(texte, /\*À retenir\*\n1\. /);
  } finally {
    server.close();
  }
});

const sendJson = (url: string, method: string, body: unknown) =>
  fetch(url, { method, body: JSON.stringify(body), headers: { ...APP, 'Content-Type': 'application/json' } });

test('écran 3 : historique, recherche plein texte sans accents, tous les mots', async () => {
  const { server, base } = await start();
  try {
    const a = await createFromNotes(base, 'Planning des ateliers Zorglub');
    const b = await createFromNotes(base, 'Thème Xylophone : prière et Zorglub');
    const list = await (await fetch(`${base}/api/comptes-rendus`)).json();
    assert.deepEqual(list.map((m: { id: string }) => m.id), [b.id, a.id]); // plus récent en premier
    const ids = async (q: string) => (await (await fetch(`${base}/api/comptes-rendus?q=${encodeURIComponent(q)}`)).json()).map((m: { id: string }) => m.id);
    assert.deepEqual(await ids('xylophone THEME'), [b.id]); // notes, sans accents ni majuscules
    assert.deepEqual(await ids('zorglub planning'), [a.id]);
    assert.deepEqual(await ids('zorglub'), [b.id, a.id]);
    assert.deepEqual(await ids('Esther'), [b.id, a.id]); // absente
    assert.deepEqual(await ids('batterie'), [b.id, a.id]); // texte du compte-rendu (exemple musiciens)
    assert.deepEqual(await ids('zorglub introuvable'), []);
  } finally {
    server.close();
  }
});

test('écran 4 : groupes créés, renommés, supprimés ; annuaire complété ; contrôles', async () => {
  const { server, base, dir } = await start();
  try {
    const groups = await (await fetch(`${base}/api/config`)).json().then((c) => c.groupes);
    const put = (g: unknown) => sendJson(`${base}/api/groupes`, 'PUT', { groupes: g });

    // Renommer (ordre gardé), retirer un membre, créer, supprimer : le tout en un envoi.
    const { Musiciens, 'Comité Orga': _deleted, ...rest } = groups;
    const next = { ...rest, Louange: Musiciens.slice(1), Régie: ['Paul W.', ' Paul W. ', 'Alice Q.'] };
    const saved = await (await put(next)).json();
    assert.deepEqual(Object.keys(saved), ['Coordination Franco', 'Comité Franco', 'Louange', 'Régie']);
    assert.deepEqual(saved.Régie, ['Paul W.', 'Alice Q.']); // espaces retirés, doublon enlevé
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'groupes.json'), 'utf-8')), saved);

    // Contrôles : nom vide, personne hors annuaire, format.
    assert.equal((await (await put({ ' ': [] })).json()).erreur, 'Nom du groupe vide.');
    assert.match((await (await put({ Test: ['Inconnu Z.'] })).json()).erreur, /Pas dans l'annuaire : Inconnu Z\./);
    assert.equal((await put(['x'])).status, 400);
    assert.equal((await put({ Test: 'x' })).status, 400);

    // Annuaire : ajout, doublon refusé (sans tenir compte des accents), puis utilisable dans un groupe.
    const directory = await (await sendJson(`${base}/api/annuaire`, 'POST', { nom: '  Inconnu   Z. ' })).json();
    assert.equal(directory.at(-1), 'Inconnu Z.');
    assert.equal((await sendJson(`${base}/api/annuaire`, 'POST', { nom: 'inconnu z.' })).status, 409);
    assert.equal((await sendJson(`${base}/api/annuaire`, 'POST', { nom: '' })).status, 400);
    assert.equal((await put({ Test: ['Inconnu Z.'] })).status, 200);
    assert.equal(JSON.parse(readFileSync(join(dir, 'annuaire.json'), 'utf-8')).at(-1), 'Inconnu Z.');

    // Un nouveau compte-rendu utilise l'annuaire de data/.
    await createFromNotes(base, 'Notes', '');
    assert.ok(calls.at(-1)!.directory.includes('Inconnu Z.'));
    // Sans l'en-tête de l'interface : refusé.
    assert.equal((await fetch(`${base}/api/groupes`, { method: 'PUT', body: '{"groupes":{}}' })).status, 403);
  } finally {
    server.close();
  }
});
