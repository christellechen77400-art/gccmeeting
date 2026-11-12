// Usage : npm run app → interface sur http://localhost:3000 (usage local, sans compte).
// Serveur HTTP de Node, sans paquet en plus ; les pages sont dans src/app/public/.

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES } from '../categories.ts';
import { SUPPORTED_EXTENSIONS } from '../extract.ts';
import { createCompteRendu, type PipelineInput, type PipelineResult } from '../pipeline.ts';
import { AUDIO_EXTENSIONS } from '../transcribe.ts';
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
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Pipeline = (input: PipelineInput) => Promise<PipelineResult>;

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

function nameList(value: FormDataEntryValue | null): string[] {
  if (!value) return [];
  const list = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(list) || !list.every((n) => typeof n === 'string')) throw new HttpError(400, 'Liste de noms mal formée.');
  return list.map((n) => n.trim()).filter(Boolean);
}

export function createApp(options: { dataDir?: string; pipeline?: Pipeline } = {}): Server {
  const store = new Store(options.dataDir ?? defaultDataDir());
  const pipeline = options.pipeline ?? createCompteRendu;
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

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

    const m = /^\/api\/comptes-rendus\/([^/]+)(?:\/([^/]+))?$/.exec(path);
    if (req.method === 'GET' && m) {
      const meta = store.read(m[1]);
      if (!meta) throw new HttpError(404, 'Compte-rendu introuvable.');
      if (!m[2]) return sendJson(res, 200, meta);
      const file = join(store.folder(meta.id)!, m[2]);
      if (!RESULT_FILES[m[2]] || !existsSync(file)) throw new HttpError(404, 'Fichier introuvable.');
      return sendFile(res, file, RESULT_FILES[m[2]]);
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
