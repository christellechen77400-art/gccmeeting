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

// Répétitions entre blocs (hors « À retenir », qui peut résumer) : un sujet repéré par les mots
// de son titre. Les mots sont comparés sans accents, sur leurs 5 premières lettres (« groupes » = « groupe »,
// « batterie » = « batteurs ») ; les mots courts et les mots outils sont ignorés.
const STOPWORDS = new Set(['pour', 'avec', 'dans', 'cette', 'sont', 'tous', 'toute', 'toutes', 'chaque', 'leur', 'leurs',
  'nous', 'vous', 'elles', 'entre', 'puis', 'plus', 'etre', 'fait', 'faire', 'aussi', 'encore', 'comme', 'avant', 'apres',
  'depuis', 'pendant', 'sans', 'sous', 'vers', 'chez', 'mais', 'donc', 'ainsi', 'deja', 'faut']);
const MIN_SUBJECT_WORDS = 2; // un seul mot (« Guitaristes ») est trop vague pour parler de répétition

function stems(text: string | undefined): Set<string> {
  const words = (text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/\p{L}+/gu) ?? [];
  return new Set(words
    .filter((w) => /\p{Script=Han}/u.test(w) || (w.length >= 4 && !STOPWORDS.has(w)))
    .map((w) => w.slice(0, 5)));
}

// `element` absent : le sujet est le titre du bloc (ou l'objectif lui-même).
type Subject = {
  label: string; block: number; element?: number; blockLabel: string; question: boolean;
  titled: boolean; title: Set<string>; all: Set<string>;
};

// Un sujet par titre de bloc et par élément ; sans titre (bilan, étapes), c'est le texte qui compte.
// Le texte d'explication d'un objectif peut citer d'autres sujets (« avec les groupes fixes… ») : seul son titre compte.
function subjects(cr: AiCompteRendu): Subject[] {
  return cr.blocs.flatMap((b, i) => {
    if (b.type === 'intertitre') return [];
    const blockLabel = b.type === 'objectif' ? (b.sous_titre ?? 'Objectif') : (b.titre ?? b.type);
    const own = b.type === 'objectif'
      ? [{ element: undefined as number | undefined, label: b.titre ?? '', title: b.titre, titled: Boolean(b.titre), all: [b.titre, b.sous_titre] }]
      : [{ element: undefined as number | undefined, label: blockLabel, title: b.titre, titled: Boolean(b.titre), all: [b.titre] }];
    const items = (b.elements ?? []).map((e, element) => ({
      element,
      label: e.titre ?? e.texte ?? '',
      title: e.titre ?? e.texte,
      titled: Boolean(e.titre),
      all: [e.titre, e.texte, ...(e.tags ?? [])],
    }));
    return [...own, ...items].map((s) => ({
      label: s.label, block: i, element: s.element, blockLabel,
      question: b.type === 'questions' || s.label.trim().endsWith('?'),
      titled: s.titled, title: stems(s.title), all: stems(s.all.join(' ')),
    }));
  });
}

const contains = (big: Set<string>, small: Set<string>) => [...small].every((w) => big.has(w));

// Paires [sujet répété, sujet qui le reprend], une seule fois par paire, dans un sens ou dans l'autre.
function repetitionPairs(cr: AiCompteRendu): [Subject, Subject][] {
  const list = subjects(cr);
  const found: [Subject, Subject][] = [];
  const pairs = new Set<string>();
  for (const [i, a] of list.entries()) {
    if (a.title.size < MIN_SUBJECT_WORDS) continue;
    for (const [j, b] of list.entries()) {
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (b.block === a.block || !contains(b.all, a.title) || pairs.has(key)) continue;
      pairs.add(key);
      found.push([a, b]);
    }
  }
  return found;
}

const describe = ([a, b]: [Subject, Subject]) => `« ${a.label} » (${a.blockLabel}) revient dans « ${b.label} » (${b.blockLabel})`;

export function findRepetitions(cr: AiCompteRendu): string[] {
  return repetitionPairs(cr).map(describe);
}

// Retire les répétitions restantes : on garde la version « question » si l'une des deux en est une,
// sinon celle qui apparaît en premier. Seul un élément (carte, ligne) peut être retiré, pas un bloc entier.
export function removeRepetitions(cr: AiCompteRendu): { cr: AiCompteRendu; removed: string[]; left: string[] } {
  const order = (s: Subject) => s.block * 1000 + (s.element ?? -1);
  const drops = new Map<string, Subject>();
  const left: string[] = [];
  for (const pair of repetitionPairs(cr)) {
    const [a, b] = pair;
    const keepA = a.question !== b.question ? a.question : order(a) < order(b);
    const drop = keepA ? b : a;
    if (drop.element === undefined) left.push(describe(pair));
    else drops.set(`${drop.block}-${drop.element}`, drop);
  }
  const blocs = cr.blocs.map((b, i) => (b.elements
    ? { ...b, elements: b.elements.filter((_, j) => !drops.has(`${i}-${j}`)) }
    : b));
  return { cr: { ...cr, blocs }, removed: [...drops.values()].map((s) => `« ${s.label} » (${s.blockLabel})`), left };
}

// Sujets (titres) de la première version qu'on ne retrouve plus dans la version raccourcie (À retenir compris).
// Les phrases sans titre (bilan, étapes) sont ignorées : raccourcies, elles changent presque toujours de mots.
export function missingSubjects(before: AiCompteRendu, after: AiCompteRendu): string[] {
  const words = new Set([...subjects(after).flatMap((s) => [...s.all]),
    ...after.a_retenir.flatMap((p) => [...stems(`${p.titre} ${p.detail ?? ''}`)])]);
  return subjects(before).filter((s) => s.titled && s.title.size && !contains(words, s.title)).map((s) => s.label);
}
