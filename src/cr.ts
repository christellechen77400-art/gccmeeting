// Usage : npm run cr -- <fichier> --categorie "<Catégorie>"
// Notes (.txt, .md, .pdf, .docx) → Claude → out/<nom>.json → out/<nom>.pdf + out/<nom>.png

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CATEGORIES } from './categories.ts';
import { extractTextFromFile } from './extract.ts';
import { render } from './render.ts';
import { AiCompteRenduSchema, toCompteRendu } from './schema.ts';

const DEFAULT_MODEL = 'claude-haiku-5-5';
const PROMPT_PATH = new URL('./prompt.md', import.meta.url);

function parisDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}

async function askClaude(text: string, categorie: string, depositDate: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Clé API manquante : renseigne ANTHROPIC_API_KEY dans le fichier .env (modèle : .env.example).');
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic();
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: readFileSync(PROMPT_PATH, 'utf-8'),
    messages: [{
      role: 'user',
      content: `Catégorie : ${categorie}\nDate de dépôt du fichier : ${depositDate}\n\n<notes>\n${text}\n</notes>`,
    }],
    output_config: { format: zodOutputFormat(AiCompteRenduSchema) },
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude a refusé de traiter ces notes.');
  if (response.stop_reason === 'max_tokens') throw new Error('Réponse de Claude coupée (trop longue).');
  if (!response.parsed_output) throw new Error('Réponse de Claude illisible (JSON invalide).');
  console.log(`Claude (${response.model}) : ${response.usage.input_tokens} jetons en entrée, ${response.usage.output_tokens} en sortie.`);
  return response.parsed_output;
}

function explainApiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error('Clé API refusée : vérifie ANTHROPIC_API_KEY dans .env.');
  if (err instanceof Anthropic.NotFoundError) return new Error(`Modèle introuvable : vérifie ANTHROPIC_MODEL dans .env (${process.env.ANTHROPIC_MODEL}).`);
  if (err instanceof Anthropic.RateLimitError) return new Error('Trop de demandes à l\'API Anthropic : réessaie dans une minute.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Pas de connexion à l\'API Anthropic (réseau ?).');
  if (err instanceof Anthropic.APIError) return new Error(`Erreur de l'API Anthropic (${err.status}) : ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { categorie: { type: 'string' } },
  });
  const file = positionals[0];
  const categorie = values.categorie;
  if (!file || !categorie) {
    throw new Error('Usage : npm run cr -- <fichier> --categorie "<Catégorie>"');
  }
  if (!CATEGORIES[categorie]) {
    throw new Error(`Catégorie inconnue : « ${categorie} ». Valeurs possibles : ${Object.keys(CATEGORIES).join(', ')}.`);
  }
  if (!existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  if (existsSync('.env')) process.loadEnvFile('.env');

  const text = await extractTextFromFile(file);
  console.log(`Texte extrait : ${text.length} caractères.`);

  let ai;
  try {
    ai = await askClaude(text, categorie, parisDate(statSync(file).mtime));
  } catch (err) {
    throw explainApiError(err);
  }

  // Validation avant le rendu.
  const checked = AiCompteRenduSchema.safeParse(ai);
  if (!checked.success) throw new Error(`JSON de Claude non conforme : ${checked.error.message}`);
  if (checked.data.a_retenir.length > 3) {
    console.warn(`Attention : ${checked.data.a_retenir.length} points dans « À retenir », seuls les 3 premiers sont affichés.`);
  }

  mkdirSync('out', { recursive: true });
  const jsonPath = join('out', `${basename(file, extname(file))}.json`);
  writeFileSync(jsonPath, JSON.stringify(toCompteRendu(checked.data, categorie), null, 2) + '\n', 'utf-8');
  console.log(`JSON : ${jsonPath}`);

  const { pdf, png } = await render(jsonPath);
  console.log(`PDF : ${pdf}\nPNG : ${png}`);
}

main().catch((err: Error) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
