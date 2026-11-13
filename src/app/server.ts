// Usage : npm run app → interface sur http://localhost:3000 (usage local, sans compte).
// Serveur HTTP de Node, sans paquet en plus ; les pages sont dans src/app/public/.

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES } from '../categories.ts';
import { correctCompteRendu, type CorrectionInput, type CorrectionResult } from '../correction.ts';
import { SUPPORTED_EXTENSIONS } from '../extract.ts';
import { createCompteRendu, type PipelineInput, type PipelineResult } from '../pipeline.ts';
import { parseCompteRendu, render } from '../render.ts';
import { checkRuleFields, describeRule, type Rule } from '../rules.ts';
import { AUDIO_EXTENSIONS } from '../transcribe.ts';
import { whatsappText } from '../whatsapp.ts';
import { defaultDataDir, Store, type Meta, type Source } from './store.ts';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const LOGO = fileURLToPath(new URL('../../reference/gcc-logo.png', import.meta.url));
const STATIC: Record<string, [string, string]> = {
  '/': [join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8'],
  '/app.css': [join(PUBLIC_DIR, 'app.css'), 'text/css; charset=utf-8'],
  '/app.js': [join(PUBLIC_DIR, 'app.js'), 'text/javascript; charset=utf-8'],
  '/logo.png': [LOGO, 'image/png'],
};
// Fichiers d'un compte-rendu servis à l'interface.
const RESULT_FILES: Record<string, string> = {
  'cr.png': 'image/png',
  'cr.pdf': 'application/pdf',
  'cr.json': 'application/json; charset=utf-8',
  'cr.texte.txt': 'text/plain; charset=utf-8', // texte donné à l'IA : notes ou transcription
};
const MAX_JSON = 100_000; // corps JSON d'une requête de l'interface, en octets
const MAX_REQUEST = 2000; // caractères d'une demande de correction
const MAX_NAME = 60; // caractères d'un nom de personne ou de groupe
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const APP_HEADER = 'x-gcc-meeting'; // envoyé par l'interface pour toute modification

type Pipeline = (input: PipelineInput) => Promise<PipelineResult>;
type Corrector = (input: CorrectionInput) => Promise<CorrectionResult>;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendFile(res: ServerResponse, path: string, type: string): void {
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  createReadStream(path).pipe(res);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_JSON) throw new HttpError(413, 'Requête trop grande.');
  }
  try {
    const value = JSON.parse(body) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* message ci-dessous */ }
  throw new HttpError(400, 'Requête mal formée.');
}

// Recherche sans tenir compte des majuscules ni des accents.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function cleanName(value: unknown, what: string): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new HttpError(400, `${what} vide.`);
  if (name.length > MAX_NAME) throw new HttpError(400, `${what} trop long (${MAX_NAME} caractères au plus).`);
  return name;
}

function nameList(value: FormDataEntryValue | null): string[] {
  if (!value) return [];
  const list = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(list) || !list.every((n) => typeof n === 'string')) throw new HttpError(400, 'Liste de noms mal formée.');
  return list.map((n) => n.trim()).filter(Boolean);
}

// Résumé lisible de la règle proposée, pour l'interface.
const describe = (regle: CorrectionResult['regle']) => (regle ? { resume: describeRule(regle) } : {});

export function createApp(options: { dataDir?: string; pipeline?: Pipeline; corrector?: Corrector } = {}): Server {
  const store = new Store(options.dataDir ?? defaultDataDir());
  const pipeline = options.pipeline ?? createCompteRendu;
  const corrector = options.corrector ?? correctCompteRendu;
  const correcting = new Set<string>(); // une correction à la fois par compte-rendu
  store.markInterrupted();

  // Création lancée en tâche de fond : l'interface suit l'avancement en relisant l'état.
  async function run(meta: Meta): Promise<void> {
    const folder = store.folder(meta.id)!;
    try {
      const result = await pipeline({
        file: join(folder, meta.source.fichier),
        categorie: meta.categorie,
        groupe: meta.groupe,
        members: meta.presents,
        absents: meta.absents,
        directory: store.directory(),
        meetingDate: meta.date,
        titre: meta.titre,
        rules: store.rules(),
        outDir: folder,
        name: 'cr',
        onStep: (etape) => store.update(meta.id, { etape }),
      });
      const cr = JSON.parse(readFileSync(result.json, 'utf-8')) as { titre: string };
      store.update(meta.id, { etat: 'pret', etape: undefined, titre: cr.titre, overflow: result.overflow, avertissements: result.warnings });
    } catch (err) {
      store.update(meta.id, { etat: 'erreur', erreur: (err as Error).message });
    }
  }

  async function create(req: IncomingMessage): Promise<Meta> {
    const form = await new Request('http://localhost/', {
      method: 'POST',
      headers: req.headers as Record<string, string>,
      body: Readable.toWeb(req) as ReadableStream,
      duplex: 'half',
    } as RequestInit).formData();

    const categorie = String(form.get('categorie') ?? '');
    if (!CATEGORIES[categorie]) throw new HttpError(400, 'Choisis une catégorie.');
    const groupe = String(form.get('groupe') ?? '') || undefined;
    if (groupe && !store.groups()[groupe]) throw new HttpError(400, `Groupe inconnu : « ${groupe} ».`);
    const date = String(form.get('date') ?? '');
    if (!DATE.test(date)) throw new HttpError(400, 'Date de la réunion manquante.');

    // Une seule source : un fichier (déposé ou enregistré au micro) ou des notes collées.
    const notes = String(form.get('notes') ?? '').replace(/\r\n?/g, '\n').trim(); // un formulaire envoie des \r\n
    const file = form.get('fichier');
    let source: Meta['source'];
    let content: Buffer;
    if (file instanceof File && file.size) {
      const ext = extname(file.name).toLowerCase();
      if (![...AUDIO_EXTENSIONS, ...SUPPORTED_EXTENSIONS].includes(ext)) {
        throw new HttpError(400, `Format non pris en charge : « ${ext || 'sans extension'} ». Audio (${AUDIO_EXTENSIONS.join(', ')}), PDF, Word (.docx) ou texte.`);
      }
      const type: Source = form.get('source') === 'enregistrement' ? 'enregistrement' : 'fichier';
      source = { type, nom: file.name, fichier: `source${ext}` };
      content = Buffer.from(await file.arrayBuffer());
    } else if (notes) {
      source = { type: 'notes', nom: 'Notes collées', fichier: 'source.txt' };
      content = Buffer.from(notes + '\n', 'utf-8');
    } else {
      throw new HttpError(400, 'Dépose un fichier, colle des notes ou enregistre la réunion.');
    }

    const meta: Meta = {
      id: store.newId(),
      creeLe: new Date().toISOString(),
      categorie,
      ...(groupe && { groupe }),
      date,
      ...(String(form.get('titre') ?? '').trim() && { titre: String(form.get('titre')).trim() }),
      source,
      presents: nameList(form.get('presents')),
      absents: nameList(form.get('absents')),
      etat: 'en_cours',
      etape: AUDIO_EXTENSIONS.includes(extname(source.fichier)) ? 'transcription' : 'redaction',
    };
    store.write(meta);
    writeFileSync(join(store.folder(meta.id)!, source.fichier), content);
    void run(meta);
    return meta;
  }

  // Volet « Corriger » : l'IA modifie le JSON, puis PDF et PNG sont refaits.
  async function correct(meta: Meta, demande: string) {
    if (meta.etat !== 'pret') throw new HttpError(409, 'Le compte-rendu n\'est pas prêt.');
    if (correcting.has(meta.id)) throw new HttpError(409, 'Une correction est déjà en cours.');
    correcting.add(meta.id);
    try {
      const folder = store.folder(meta.id)!;
      const json = join(folder, 'cr.json');
      const textPath = join(folder, 'cr.texte.txt');
      const result = await corrector({
        cr: parseCompteRendu(readFileSync(json, 'utf-8')),
        demande,
        text: existsSync(textPath) ? readFileSync(textPath, 'utf-8') : undefined,
        directory: store.directory(),
        rules: store.rules(),
      }).catch((err: Error) => { throw new HttpError(502, err.message); });
      writeFileSync(json, JSON.stringify(result.cr, null, 2) + '\n', 'utf-8');
      const { overflow } = await render(json, folder);
      const updated = store.update(meta.id, {
        titre: result.cr.titre,
        presents: result.cr.participants ?? [],
        absents: result.cr.absents ?? [],
        overflow,
        avertissements: result.warnings,
        modifieLe: new Date().toISOString(),
      });
      const reponse = result.message + (overflow ? ` Attention : il dépasse maintenant une page de ${overflow} % (PDF sur 2 pages).` : '');
      const corrections = store.corrections(meta.id);
      const correction = { demande, reponse, date: updated.modifieLe!, ...(result.regle && { regle: result.regle }) };
      store.saveCorrections(meta.id, [...corrections, correction]);
      return { meta: updated, index: corrections.length, correction: { ...correction, ...describe(correction.regle) } };
    } finally {
      correcting.delete(meta.id);
    }
  }

  // « Seulement ici » ou « Retenir comme règle » ; sans règle proposée, la demande devient une consigne de rédaction.
  function choose(meta: Meta, index: number, choix: unknown) {
    if (choix !== 'ici' && choix !== 'regle') throw new HttpError(400, 'Choix inconnu.');
    const corrections = store.corrections(meta.id);
    const correction = corrections[index];
    if (!correction) throw new HttpError(404, 'Correction introuvable.');
    if (correction.choix) throw new HttpError(409, 'Choix déjà fait.');
    correction.choix = choix;
    let regle;
    if (choix === 'regle') {
      regle = store.addRule(correction.regle ?? { type: 'redaction', texte: correction.demande }, meta.titre);
      correction.regleId = regle.id;
    }
    store.saveCorrections(meta.id, corrections);
    return { correction, ...(regle && { regle, resume: describeRule(regle) }) };
  }

  // Historique : tous les comptes-rendus, ou ceux dont le texte contient tous les mots cherchés
  // (titre, catégorie, groupe, personnes, compte-rendu, notes ou transcription).
  function search(q: string): Meta[] {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const list = store.list();
    if (!words.length) return list;
    return list.filter((meta) => {
      const folder = store.folder(meta.id)!;
      const parts = [meta.titre, meta.categorie, meta.groupe, ...meta.presents, ...meta.absents, meta.source.nom];
      for (const file of ['cr.json', 'cr.texte.txt']) {
        if (existsSync(join(folder, file))) parts.push(readFileSync(join(folder, file), 'utf-8'));
      }
      const text = fold(parts.filter(Boolean).join('\n'));
      return words.every((w) => text.includes(w));
    });
  }

  // Groupes envoyés en entier par l'écran « Annuaire et groupes » : noms propres, membres de l'annuaire.
  function saveGroups(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Groupes mal formés.');
    const directory = new Set(store.directory());
    const groups: Record<string, string[]> = {};
    for (const [rawName, members] of Object.entries(value)) {
      const name = cleanName(rawName, 'Nom du groupe');
      if (groups[name]) throw new HttpError(400, `Deux groupes s'appellent « ${name} ».`);
      if (!Array.isArray(members)) throw new HttpError(400, 'Groupes mal formés.');
      const list = [...new Set(members.map((m) => cleanName(m, 'Nom')))];
      const unknown = list.filter((m) => !directory.has(m));
      if (unknown.length) throw new HttpError(400, `Pas dans l'annuaire : ${unknown.join(', ')}. Ajoute-les d'abord à l'annuaire.`);
      groups[name] = list;
    }
    store.saveGroups(groups);
    return groups;
  }

  function addToDirectory(value: unknown): string[] {
    const name = cleanName(value, 'Nom');
    const directory = store.directory();
    if (directory.some((n) => fold(n) === fold(name))) throw new HttpError(409, `« ${name} » est déjà dans l'annuaire.`);
    store.saveDirectory([...directory, name]);
    return [...directory, name];
  }

  // Écran « Règles apprises » : ajout, modification (le type ne change pas), activation, suppression.
  function fieldsOf(value: unknown): Omit<Rule, 'id' | 'actif' | 'creeLe' | 'origine'> {
    const fields = checkRuleFields(value);
    if (typeof fields === 'string') throw new HttpError(400, fields);
    return fields;
  }

  function changeRule(id: string, method: string, body: Record<string, unknown>): Rule | { supprime: string } {
    const rules = store.rules();
    const index = rules.findIndex((r) => r.id === id);
    if (index < 0) throw new HttpError(404, 'Règle introuvable.');
    if (method === 'DELETE') {
      store.saveRules(rules.filter((r) => r.id !== id));
      return { supprime: id };
    }
    const rule = rules[index];
    const { de, vers, texte, detail, terme, definition, ...meta } = rule;
    const changed: Rule = 'champs' in body ? { ...meta, ...fieldsOf({ ...(body.champs as object), type: rule.type }) } : { ...rule };
    if ('actif' in body) {
      if (typeof body.actif !== 'boolean') throw new HttpError(400, 'Requête mal formée.');
      changed.actif = body.actif;
    }
    rules[index] = changed;
    store.saveRules(rules);
    return changed;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Usage local sans compte : un autre site ouvert dans le navigateur ne doit ni lire les données
    // (nom d'hôte détourné, « DNS rebinding ») ni lancer un compte-rendu (formulaire envoyé en douce).
    const port = req.socket.localPort;
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host ?? '')) throw new HttpError(403, 'Accès refusé.');
    // Un en-tête personnalisé oblige le navigateur à demander l'accord du serveur pour un autre site, qui ne l'a pas.
    if (req.method !== 'GET' && req.headers[APP_HEADER] !== '1') throw new HttpError(403, 'Accès refusé.');

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && STATIC[path]) return sendFile(res, ...STATIC[path]);

    if (req.method === 'GET' && path === '/api/config') {
      return sendJson(res, 200, {
        categories: Object.entries(CATEGORIES).map(([nom, c]) => ({ nom, couleur: c.color })),
        groupes: store.groups(),
        annuaire: store.directory(),
      });
    }

    if (req.method === 'POST' && path === '/api/comptes-rendus') return sendJson(res, 201, await create(req));
    if (req.method === 'GET' && path === '/api/comptes-rendus') return sendJson(res, 200, search(url.searchParams.get('q') ?? ''));
    if (req.method === 'PUT' && path === '/api/groupes') return sendJson(res, 200, saveGroups((await readJson(req)).groupes));
    if (req.method === 'GET' && path === '/api/regles') return sendJson(res, 200, store.rules());
    if (req.method === 'POST' && path === '/api/regles') return sendJson(res, 201, store.addRule(fieldsOf(await readJson(req))));
    const rule = /^\/api\/regles\/(r\d+)$/.exec(path);
    if (rule && (req.method === 'PUT' || req.method === 'DELETE')) {
      return sendJson(res, 200, changeRule(rule[1], req.method, req.method === 'PUT' ? await readJson(req) : {}));
    }
    if (req.method === 'POST' && path === '/api/annuaire') return sendJson(res, 200, addToDirectory((await readJson(req)).nom));

    const m = /^\/api\/comptes-rendus\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (m) {
      const meta = store.read(m[1]);
      if (!meta) throw new HttpError(404, 'Compte-rendu introuvable.');
      const folder = store.folder(meta.id)!;
      const rest = m[2];
      if (req.method === 'GET' && !rest) return sendJson(res, 200, meta);
      if (req.method === 'GET' && rest === 'whatsapp') {
        return sendJson(res, 200, { texte: whatsappText(parseCompteRendu(readFileSync(join(folder, 'cr.json'), 'utf-8'))) });
      }
      if (req.method === 'GET' && rest === 'corrections') {
        return sendJson(res, 200, store.corrections(meta.id).map((c) => ({ ...c, ...describe(c.regle) })));
      }
      if (req.method === 'POST' && rest === 'corrections') {
        const demande = String((await readJson(req)).demande ?? '').trim();
        if (!demande) throw new HttpError(400, 'Écris ce qu\'il faut corriger.');
        if (demande.length > MAX_REQUEST) throw new HttpError(400, `Demande trop longue (${MAX_REQUEST} caractères au plus).`);
        return sendJson(res, 200, await correct(meta, demande));
      }
      const choice = /^corrections\/(\d+)\/choix$/.exec(rest ?? '');
      if (req.method === 'POST' && choice) return sendJson(res, 200, choose(meta, Number(choice[1]), (await readJson(req)).choix));
      if (req.method === 'GET' && rest && RESULT_FILES[rest] && existsSync(join(folder, rest))) {
        return sendFile(res, join(folder, rest), RESULT_FILES[rest]);
      }
      throw new HttpError(404, 'Fichier introuvable.');
    }

    throw new HttpError(404, 'Page introuvable.');
  }

  return createServer((req, res) => {
    handle(req, res).catch((err: Error) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) sendJson(res, status, { erreur: err.message });
      else res.end();
    });
  });
}

// Lancé directement (npm run app) : écoute seulement sur cet ordinateur.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`GCC Meeting : http://localhost:${port} (données dans ${defaultDataDir()})`);
  });
}
