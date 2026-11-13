// Données de l'interface, dans data/ (exclu de git) : annuaire, groupes, règles apprises et comptes-rendus.
// Au premier lancement, l'annuaire et les groupes sont repris de config/, les règles de src/remplacements.json.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Step } from '../pipeline.ts';
import { rulesFromReplacements, type Rule, type RuleFields } from '../rules.ts';

const CONFIG_DIR = fileURLToPath(new URL('../../config/', import.meta.url));
const REPLACEMENTS = fileURLToPath(new URL('../remplacements.json', import.meta.url));
// Champ qui identifie une règle : le mot mal transcrit, la consigne, le terme.
const RULE_KEY = { nom: 'de', redaction: 'texte', glossaire: 'terme' } as const;
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
  modifieLe?: string; // ISO, dernière correction
}

// Une demande du volet « Corriger » et sa réponse ; `choix` une fois la règle retenue ou non.
export interface Correction {
  demande: string;
  reponse: string;
  date: string; // ISO
  regle?: RuleFields; // règle proposée par l'IA
  choix?: 'ici' | 'regle';
  regleId?: string; // règle créée
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
    if (!existsSync(join(dir, 'regles.json'))) {
      const replacements = JSON.parse(readFileSync(REPLACEMENTS, 'utf-8')) as Record<string, string>;
      this.saveRules(rulesFromReplacements(replacements, new Date().toISOString()));
    }
  }

  private readJson<T>(name: string): T {
    return JSON.parse(readFileSync(join(this.dir, name), 'utf-8')) as T;
  }

  private writeJson(name: string, value: unknown): void {
    writeFileSync(join(this.dir, name), JSON.stringify(value, null, 2) + '\n', 'utf-8');
  }

  directory(): string[] {
    return this.readJson('annuaire.json');
  }

  groups(): Record<string, string[]> {
    return this.readJson('groupes.json');
  }

  saveDirectory(names: string[]): void {
    this.writeJson('annuaire.json', names);
  }

  saveGroups(groups: Record<string, string[]>): void {
    this.writeJson('groupes.json', groups);
  }

  rules(): Rule[] {
    return this.readJson('regles.json');
  }

  saveRules(rules: Rule[]): void {
    this.writeJson('regles.json', rules);
  }

  // Ajoute une règle et la renvoie (identifiant r1, r2… jamais réutilisé).
  // Une règle sur le même mot (ou la même consigne) existe déjà : elle est mise à jour et réactivée.
  addRule(fields: RuleFields, origine?: string): Rule {
    const rules = this.rules();
    const key = RULE_KEY[fields.type];
    const index = rules.findIndex((r) => r.type === fields.type && r[key]?.toLowerCase() === fields[key]?.toLowerCase());
    if (index >= 0) {
      // Le mot de la règle existante est gardé tel quel : le remplacement tient compte des majuscules.
      const { id, creeLe, origine: before } = rules[index];
      rules[index] = { id, ...fields, [key]: rules[index][key], actif: true, creeLe, ...((origine ?? before) && { origine: origine ?? before }) };
      this.saveRules(rules);
      return rules[index];
    }
    const next = Math.max(0, ...rules.map((r) => Number(r.id.slice(1)) || 0)) + 1;
    const rule: Rule = { id: `r${next}`, ...fields, actif: true, creeLe: new Date().toISOString(), ...(origine && { origine }) };
    this.saveRules([...rules, rule]);
    return rule;
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

  corrections(id: string): Correction[] {
    const path = join(this.folder(id)!, 'corrections.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as Correction[] : [];
  }

  saveCorrections(id: string, corrections: Correction[]): void {
    writeFileSync(join(this.folder(id)!, 'corrections.json'), JSON.stringify(corrections, null, 2) + '\n', 'utf-8');
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
