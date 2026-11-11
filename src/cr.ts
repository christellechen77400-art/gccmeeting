// Usage : npm run cr -- <fichier> --categorie "<Catégorie>" [--groupe "<Groupe>"]
// Notes (.txt, .md, .pdf, .docx) → IA (API compatible Anthropic, DeepSeek deepseek-flash par défaut) → out/<nom>.json → out/<nom>.pdf + out/<nom>.png

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CATEGORIES } from './categories.ts';
import { extractTextFromFile } from './extract.ts';
import { extractAbsents, loadDirectory, loadGroups, membersNotInDirectory, resolveGroup, splitPresence } from './participants.ts';
import { applyReplacements, checkCompteRendu } from './postprocess.ts';
import { render } from './render.ts';
import { AiCompteRenduSchema, COMPTE_RENDU_TOOL, TOOL_NAME, toCompteRendu, type AiCompteRendu } from './schema.ts';

const DEFAULT_MODEL = 'deepseek-flash';
const PROMPT_PATH = new URL('./prompt.md', import.meta.url);
const TEMPERATURE = 0.2; // basse : des comptes-rendus plus réguliers d'un essai à l'autre

function parisDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}

// L'IA répond en appelant l'outil enregistrer_compte_rendu (forcé, sans réflexion).
// JSON non conforme : un seul nouvel essai, en renvoyant l'erreur au modèle.
async function askModel(text: string, categorie: string, depositDate: string): Promise<AiCompteRendu> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Clé API manquante : renseigne ANTHROPIC_API_KEY dans le fichier .env (modèle : .env.example).');
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const system = readFileSync(PROMPT_PATH, 'utf-8');
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `Catégorie : ${categorie}\nDate de dépôt du fichier : ${depositDate}\n\n<notes>\n${text}\n</notes>`,
  }];

  for (let attempt = 1; ; attempt++) {
    // `temperature` n'est plus dans l'API Anthropic ni dans le SDK, mais DeepSeek la prend en compte.
    const params: Anthropic.MessageCreateParamsNonStreaming & { temperature: number } = {
      model,
      max_tokens: 16000,
      temperature: TEMPERATURE,
      system,
      messages,
      tools: [COMPTE_RENDU_TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      thinking: { type: 'disabled' },
    };
    const response = await client.messages.create(params);
    if (response.stop_reason === 'refusal') throw new Error('Le modèle a refusé de traiter ces notes.');
    if (response.stop_reason === 'max_tokens') throw new Error('Réponse du modèle coupée (trop longue).');
    const cached = response.usage.cache_read_input_tokens ?? 0;
    console.log(`${response.model} : ${response.usage.input_tokens + cached} jetons en entrée (dont ${cached} en cache), ${response.usage.output_tokens} en sortie.`);

    const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME);
    const checked = AiCompteRenduSchema.safeParse(call?.input);
    if (checked.success) return checked.data;

    const problem = call ? z.prettifyError(checked.error) : `pas d'appel à l'outil ${TOOL_NAME}`;
    if (attempt === 2) throw new Error(`JSON du modèle non conforme après 2 essais :\n${problem}`);
    console.warn(`JSON du modèle non conforme, nouvel essai :\n${problem}`);
    messages.push(
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: call
          ? [{ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `JSON non conforme au format :\n${problem}\nRappelle l'outil avec le JSON corrigé.` }]
          : `Appelle l'outil ${TOOL_NAME} avec le compte-rendu.`,
      },
    );
  }
}

function explainApiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error(`Clé API refusée par ${process.env.ANTHROPIC_BASE_URL || 'api.anthropic.com'} : vérifie ANTHROPIC_API_KEY et ANTHROPIC_BASE_URL dans .env (${err.message}).`);
  if (err instanceof Anthropic.NotFoundError) return new Error(`Modèle introuvable : vérifie ANTHROPIC_MODEL dans .env (${process.env.ANTHROPIC_MODEL}).`);
  if (err instanceof Anthropic.RateLimitError) return new Error('Trop de demandes à l\'API Anthropic : réessaie dans une minute.');
  if (err instanceof Anthropic.APIConnectionError) return new Error(`Pas de connexion à l'API (${process.env.ANTHROPIC_BASE_URL || 'api.anthropic.com'}) : réseau ?`);
  if (err instanceof Anthropic.APIError) return new Error(`Erreur de l'API (${err.status}) : ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
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

  const extracted = extractAbsents(await extractTextFromFile(file));
  const text = extracted.text;
  console.log(`Texte extrait : ${text.length} caractères.`);

  // Présents = membres du groupe moins les absents ; sans groupe, pas de participants.
  const presence = groupe
    ? splitPresence(groups[groupe], extracted.names)
    : { participants: [], absents: [], unknown: extracted.names };
  if (groupe) console.log(`Groupe ${groupe} : ${presence.participants.length} présents, ${presence.absents.length} absents.`);
  else console.log('Pas de groupe (--groupe ou dossier du fichier) : pas de participants.');
  if (groupe && !groups[groupe].length) console.warn(`Attention : le groupe « ${groupe} » est vide dans config/groupes.json.`);
  for (const name of groupe ? membersNotInDirectory(groups[groupe], loadDirectory()) : []) {
    console.warn(`Attention : « ${name} » (groupe ${groupe}) n'est pas dans config/annuaire.json ; gardé quand même.`);
  }

  let ai: AiCompteRendu;
  try {
    ai = await askModel(text, categorie, parisDate(statSync(file).mtime));
  } catch (err) {
    throw explainApiError(err);
  }
  ai = applyReplacements(ai);
  for (const name of presence.unknown) ai.a_confirmer.push(`Absent non reconnu dans le groupe : ${name}`);
  for (const warning of checkCompteRendu(ai)) console.warn(`Contrôle : ${warning}`);

  mkdirSync('out', { recursive: true });
  const jsonPath = join('out', `${basename(file, extname(file))}.json`);
  writeFileSync(jsonPath, JSON.stringify(toCompteRendu(ai, categorie, { participants: presence.participants, absents: presence.absents }), null, 2) + '\n', 'utf-8');
  console.log(`JSON : ${jsonPath}`);

  const { pdf, png } = await render(jsonPath);
  console.log(`PDF : ${pdf}\nPNG : ${png}`);
}

main().catch((err: Error) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
