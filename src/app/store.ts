// Données de l'interface, dans data/ (exclu de git) : annuaire, groupes et comptes-rendus.
// Au premier lancement, l'annuaire et les groupes sont repris de config/.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Step } from '../pipeline.ts';

const CONFIG_DIR = fileURLToPath(new URL('../../config/', import.meta.url));
const ID = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$/;

export type Source = 'fichier' | 'notes' | 'enregistrement';

export interface Meta {
  id: string;
  creeLe: string; // ISO
  categorie: string;
  groupe?: string;
  date: string; // AAAA-MM-JJ, date de la réunion
  titre?: string; // titre demandé, sinon celui du compte-rendu une fois prêt
  source: { type: Source; nom: string; fichier: string };
  presents: string[];
  absents: string[];
  etat: 'en_cours' | 'pret' | 'erreur';
  etape?: Step;
  erreur?: string;
  overflow?: number;
  avertissements?: string[];
}

export function defaultDataDir(): string {
  return process.env.GCC_DATA_DIR ?? fileURLToPath(new URL('../../data/', import.meta.url));
}

export class Store {
  constructor(readonly dir: string) {
    mkdirSync(join(dir, 'comptes-rendus'), { recursive: true });
    for (const name of ['annuaire.json', 'groupes.json']) {
      if (!existsSync(join(dir, name))) copyFileSync(join(CONFIG_DIR, name), join(dir, name));
    }
  }

  directory(): string[] {
    return JSON.parse(readFileSync(join(this.dir, 'annuaire.json'), 'utf-8')) as string[];
  }

  groups(): Record<string, string[]> {
    return JSON.parse(readFileSync(join(this.dir, 'groupes.json'), 'utf-8')) as Record<string, string[]>;
  }

  // Identifiant lisible et trié par date : 20261112-160512-a3f9.
  newId(now = new Date()): string {
    const p = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(now).replace(/\D/g, '');
    return `${p.slice(0, 8)}-${p.slice(8, 14)}-${randomBytes(2).toString('hex')}`;
  }

  // Dossier d'un compte-rendu ; undefined si l'identifiant n'a pas la bonne forme (aucun chemin arbitraire).
  folder(id: string): string | undefined {
    return ID.test(id) ? join(this.dir, 'comptes-rendus', id) : undefined;
  }

  read(id: string): Meta | undefined {
    const folder = this.folder(id);
    if (!folder || !existsSync(join(folder, 'meta.json'))) return undefined;
    return JSON.parse(readFileSync(join(folder, 'meta.json'), 'utf-8')) as Meta;
  }

  write(meta: Meta): void {
    const folder = this.folder(meta.id)!;
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  }

  update(id: string, change: Partial<Meta>): Meta {
    const meta = { ...this.read(id)!, ...change };
    this.write(meta);
    return meta;
  }

  list(): Meta[] {
    return readdirSync(join(this.dir, 'comptes-rendus'))
      .map((id) => this.read(id))
      .filter((m): m is Meta => Boolean(m))
      .sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  }

  // Au démarrage : un compte-rendu resté « en cours » a été interrompu par l'arrêt du serveur.
  markInterrupted(): void {
    for (const meta of this.list()) {
      if (meta.etat === 'en_cours') this.update(meta.id, { etat: 'erreur', erreur: 'Interrompu : l\'interface a été arrêtée pendant la création.' });
    }
  }
}
