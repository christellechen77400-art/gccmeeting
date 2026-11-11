// Après la réponse de l'IA : remplacements fixes (src/remplacements.json) et contrôles signalés dans la console.

import { readFileSync } from 'node:fs';
import type { AiCompteRendu } from './schema.ts';

const REPLACEMENTS_PATH = new URL('./remplacements.json', import.meta.url);
const MAX_ELEMENTS = 4;
const MAX_WORDS = 25;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Un mois entre deux non-lettres, non suivi d'une année.
const MONTH_WITHOUT_YEAR = new RegExp(`(?<!\\p{L})(${MONTHS.join('|')})(?!\\p{L})(?!\\s+\\d{4})`, 'giu');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Remplace chaque mot entier (« Gao », pas « Gaoyang ») dans toutes les chaînes du compte-rendu.
export function applyReplacements<T>(value: T, replacements: Record<string, string> = loadReplacements()): T {
  const rules = Object.entries(replacements).map(([from, to]) =>
    [new RegExp(`(?<!\\p{L})${escapeRegExp(from)}(?!\\p{L})`, 'gu'), to] as const);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return rules.reduce((s, [re, to]) => s.replace(re, to), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

function loadReplacements(): Record<string, string> {
  return JSON.parse(readFileSync(REPLACEMENTS_PATH, 'utf-8')) as Record<string, string>;
}

// Textes affichés du compte-rendu (hors date), pour les contrôles.
function texts(cr: AiCompteRendu): string[] {
  return [
    cr.titre,
    ...cr.a_retenir.flatMap((p) => [p.titre, p.detail]),
    ...cr.blocs.flatMap((b) => [b.titre, b.sous_titre, b.texte, b.titre_etapes,
      ...(b.elements ?? []).flatMap((e) => [e.titre, e.texte, e.quand, ...(e.tags ?? [])])]),
    ...cr.a_confirmer,
  ].filter((t): t is string => Boolean(t));
}

// Année probable d'un mois cité, d'après la date de réunion (AAAA-MM ou AAAA-MM-JJ) :
// un mois déjà passé dans l'année de la réunion désigne l'année suivante.
function probableYear(month: string, date: string): number | undefined {
  const m = date.match(/^(\d{4})-(\d{2})/);
  if (!m) return undefined;
  const index = MONTHS.indexOf(month.toLowerCase()) + 1;
  return index >= Number(m[2]) ? Number(m[1]) : Number(m[1]) + 1;
}

export function checkCompteRendu(cr: AiCompteRendu): string[] {
  const warnings: string[] = [];
  if (cr.a_retenir.length > 3) {
    warnings.push(`${cr.a_retenir.length} points dans « À retenir » : seuls les 3 premiers sont affichés.`);
  }
  for (const b of cr.blocs) {
    if ((b.elements?.length ?? 0) > MAX_ELEMENTS) {
      warnings.push(`Bloc « ${b.titre ?? b.type} » : ${b.elements!.length} éléments (${MAX_ELEMENTS} au plus).`);
    }
  }
  for (const t of texts(cr)) {
    const words = t.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS) warnings.push(`Texte de ${words} mots (${MAX_WORDS} au plus) : « ${t.slice(0, 60)}… »`);
    for (const [, month] of t.matchAll(MONTH_WITHOUT_YEAR)) {
      const year = probableYear(month, cr.date);
      warnings.push(`Mois sans année : « ${month} »${year ? ` (probablement ${year})` : ''} dans « ${t.slice(0, 60)} »`);
    }
  }
  return warnings;
}
