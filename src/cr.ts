// Usage : npm run cr -- <fichier> --categorie "<Catégorie>" [--groupe "<Groupe>"]
// Notes (.txt, .md, .pdf, .docx) ou audio (.m4a, .mp3, .wav, .webm, .mp4, .ogg → transcription Groq) → IA → out/<nom>.json → out/<nom>.pdf + out/<nom>.png
// La chaîne elle-même est dans src/pipeline.ts (commune avec l'interface).

import { existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { CATEGORIES } from './categories.ts';
import { loadDirectory, loadGroups, membersNotInDirectory, resolveGroup } from './participants.ts';
import { createCompteRendu } from './pipeline.ts';

function parisDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { categorie: { type: 'string' }, groupe: { type: 'string' } },
  });
  const file = positionals[0];
  const categorie = values.categorie;
  if (!file || !categorie) {
    throw new Error('Usage : npm run cr -- <fichier> --categorie "<Catégorie>" [--groupe "<Groupe>"]');
  }
  if (!CATEGORIES[categorie]) {
    throw new Error(`Catégorie inconnue : « ${categorie} ». Valeurs possibles : ${Object.keys(CATEGORIES).join(', ')}.`);
  }
  if (!existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  const groups = loadGroups();
  const groupe = resolveGroup(groups, file, values.groupe);
  if (existsSync('.env')) process.loadEnvFile('.env');

  const directory = loadDirectory();
  if (groupe) console.log(`Groupe ${groupe} : ${groups[groupe].length} membres.`);
  else console.log('Pas de groupe (--groupe ou dossier du fichier) : pas de participants.');
  if (groupe && !groups[groupe].length) console.warn(`Attention : le groupe « ${groupe} » est vide dans config/groupes.json.`);
  for (const name of groupe ? membersNotInDirectory(groups[groupe], directory) : []) {
    console.warn(`Attention : « ${name} » (groupe ${groupe}) n'est pas dans config/annuaire.json ; gardé quand même.`);
  }

  const result = await createCompteRendu({
    file,
    categorie,
    groupe,
    members: groupe ? groups[groupe] : [],
    directory,
    depositDate: parisDate(statSync(file).mtime),
    outDir: 'out',
    name: basename(file, extname(file)),
  });
  console.log(`PDF : ${result.pdf}\nPNG : ${result.png}`);
}

main().catch((err: Error) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
