// Présents et absents : les membres du groupe (config/groupes.json), moins les absents
// annoncés en tête des notes (« Absents : Paul, Marie »). L'IA ne les devine plus.

import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const GROUPS_PATH = new URL('../config/groupes.json', import.meta.url);
const DIRECTORY_PATH = new URL('../config/annuaire.json', import.meta.url);
const HEAD_LINES = 3; // la ligne « Absents » est cherchée dans les premières lignes non vides
const ABSENTS_START = /^\s*absent(?:e)?s?\s*:\s*/i;
// Fin de la liste : un point suivi d'un autre mot que « et » (« David S. Bonjour… »), ou en fin de ligne.
// « David S., Paul » et « David S. et Paul » continuent la liste.
const SENTENCE_END = /\.(?:\s+(?!et\b)(?=[^\s,;])|\s*$)/u;

export type Groups = Record<string, string[]>;

export function loadGroups(): Groups {
  return JSON.parse(readFileSync(GROUPS_PATH, 'utf-8')) as Groups;
}

// Annuaire : toutes les personnes de l'organigramme, au format « Prénom I. ».
export function loadDirectory(): string[] {
  return JSON.parse(readFileSync(DIRECTORY_PATH, 'utf-8')) as string[];
}

// Les groupes ne devraient contenir que des noms de l'annuaire : un nom inconnu est signalé, mais gardé.
export function membersNotInDirectory(members: string[], directory: string[]): string[] {
  return members.filter((m) => !directory.includes(m));
}

// Le groupe vient de --groupe, sinon du dossier du fichier (ex. « Culte Franco/Musiciens/notes.txt »).
export function resolveGroup(groups: Groups, file: string, option?: string): string | undefined {
  if (option) {
    if (!groups[option]) {
      throw new Error(`Groupe inconnu : « ${option} ». Groupes de config/groupes.json : ${Object.keys(groups).join(', ')}.`);
    }
    return option;
  }
  const folder = basename(dirname(file));
  return groups[folder] ? folder : undefined;
}

// Retire la ligne « Absents : … » des notes et renvoie les noms tels qu'ils sont écrits.
export function extractAbsents(text: string): { text: string; names: string[] } {
  const lines = text.split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length && seen < HEAD_LINES; i++) {
    if (!lines[i].trim()) continue;
    seen++;
    const m = lines[i].match(ABSENTS_START);
    if (!m) continue;
    const rest = lines[i].slice(m[0].length);
    const end = rest.search(SENTENCE_END);
    const list = end < 0 ? rest : rest.slice(0, end);
    const names = list.split(/\s*(?:,|;|\/|\bet\b)\s*/i).map((n) => n.trim()).filter(Boolean);
    lines[i] = end < 0 ? '' : rest.slice(end + 1).trimStart();
    return { text: lines.filter((l, j) => j !== i || l.trim()).join('\n'), names };
  }
  return { text, names: [] };
}

const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.\s]+/g, ' ').trim();

// Un nom d'absent correspond à un membre par son nom complet (« David S. ») ou son seul prénom (« David »).
export function splitPresence(members: string[], absentNames: string[]) {
  const absents = new Set<string>();
  const unknown: string[] = [];
  for (const name of absentNames) {
    const n = normalize(name);
    const matches = members.filter((m) => normalize(m) === n || normalize(m).split(' ')[0] === n);
    if (matches.length === 1) absents.add(matches[0]);
    else unknown.push(name);
  }
  return {
    participants: members.filter((m) => !absents.has(m)),
    absents: members.filter((m) => absents.has(m)),
    unknown,
  };
}
