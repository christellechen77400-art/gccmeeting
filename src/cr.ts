// Usage : npm run cr -- <fichier> --categorie "<Catégorie>" [--groupe "<Groupe>"]
// Notes (.txt, .md, .pdf, .docx) ou audio (.m4a, .mp3, .wav, .webm, .mp4, .ogg → transcription Groq) → IA (API compatible Anthropic, DeepSeek deepseek-flash par défaut) → out/<nom>.json → out/<nom>.pdf + out/<nom>.png

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CATEGORIES } from './categories.ts';
import { extractTextFromFile } from './extract.ts';
import { extractAbsents, loadDirectory, loadGroups, membersNotInDirectory, resolveGroup, splitPresence } from './participants.ts';
import { applyReplacements, checkCompteRendu, findRepetitions, missingSubjects, removeRepetitions } from './postprocess.ts';
import { render } from './render.ts';
import { AUDIO_EXTENSIONS, transcribe } from './transcribe.ts';
import { AiCompteRenduSchema, COMPTE_RENDU_TOOL, TOOL_NAME, toCompteRendu, type AiCompteRendu } from './schema.ts';

const DEFAULT_MODEL = 'deepseek-flash';
const PROMPT_PATH = new URL('./prompt.md', import.meta.url);
const TEMPERATURE = 0.2; // basse : des comptes-rendus plus réguliers d'un essai à l'autre
// Le bandeau ne rétrécit pas : pour gagner X % de la page, le contenu doit raccourcir de plus de X %.
const SHORTEN_FACTOR = 1.5;

function parisDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}

// Conversation avec l'IA, gardée pour pouvoir lui demander de raccourcir sa réponse.
type Conversation = { client: Anthropic; model: string; system: string; messages: Anthropic.MessageParam[] };

// La liste des membres de la consigne vient de l'annuaire ; les membres du groupe départagent les homonymes.
function startConversation(text: string, categorie: string, depositDate: string, groupMembers: string[]): Conversation {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Clé API manquante : renseigne ANTHROPIC_API_KEY dans le fichier .env (modèle : .env.example).');
  }
  return {
    client: new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined }),
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    system: readFileSync(PROMPT_PATH, 'utf-8').replace('{{annuaire}}', loadDirectory().join(', ')),
    messages: [{
      role: 'user',
      content: `Catégorie : ${categorie}\nDate de dépôt du fichier : ${depositDate}\n`
        + (groupMembers.length ? `Membres du groupe de la réunion : ${groupMembers.join(', ')}\n` : '')
        + `\n<notes>\n${text}\n</notes>`,
    }],
  };
}

// L'IA répond en appelant l'outil enregistrer_compte_rendu (forcé, sans réflexion).
// JSON non conforme : un seul nouvel essai, en renvoyant l'erreur au modèle.
// La réponse retenue est ajoutée à la conversation ; `toolUseId` permet d'y répondre.
async function askModel({ client, model, system, messages }: Conversation): Promise<{ ai: AiCompteRendu; toolUseId: string }> {
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
    if (checked.success) {
      messages.push({ role: 'assistant', content: response.content });
      return { ai: checked.data, toolUseId: call!.id }; // valide, donc l'outil a bien été appelé
    }

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

  // Audio : transcription Groq, enregistrée telle quelle pour pouvoir la relire.
  mkdirSync('out', { recursive: true });
  const name = basename(file, extname(file));
  let raw: string;
  if (AUDIO_EXTENSIONS.includes(extname(file).toLowerCase())) {
    const started = Date.now();
    const transcription = await transcribe(file);
    // Erreurs de transcription courantes corrigées dès maintenant, pour reconnaître aussi les absents.
    raw = applyReplacements(transcription);
    const transcriptionPath = join('out', `${name}.transcription.txt`);
    writeFileSync(transcriptionPath, transcription + '\n', 'utf-8');
    console.log(`Transcription : ${transcriptionPath} (${Math.round((Date.now() - started) / 1000)} s).`);
  } else {
    raw = await extractTextFromFile(file);
  }
  // « Absents : … » en tête des notes, ou dit au début de l'enregistrement.
  const extracted = extractAbsents(raw);
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

  const jsonPath = join('out', `${name}.json`);
  // Corrections par le code, contrôles, puis JSON enregistré et rendu en PDF + PNG.
  const finish = async (answer: AiCompteRendu) => {
    const ai = applyReplacements(answer);
    for (const name of presence.unknown) ai.a_confirmer.push(`Absent non reconnu dans le groupe : ${name}`);
    for (const warning of checkCompteRendu(ai)) console.warn(`Contrôle : ${warning}`);
    for (const repetition of findRepetitions(ai)) console.warn(`Contrôle : répétition, ${repetition}.`);
    writeFileSync(jsonPath, JSON.stringify(toCompteRendu(ai, categorie, { participants: presence.participants, absents: presence.absents }), null, 2) + '\n', 'utf-8');
    console.log(`JSON : ${jsonPath}`);
    return render(jsonPath);
  };

  const conversation = startConversation(text, categorie, parisDate(statSync(file).mtime), groupe ? groups[groupe] : []);
  try {
    const first = await askModel(conversation);
    let result = await finish(first.ai);
    // Plus d'une page même réduit au minimum : un seul essai pour retirer les répétitions et raccourcir ;
    // sinon le PDF reste sur 2 pages.
    if (result.overflow) {
      const repetitions = findRepetitions(first.ai);
      const target = Math.ceil(result.overflow * SHORTEN_FACTOR);
      console.log(`Trop long de ${result.overflow} % : le modèle retire les répétitions (${repetitions.length}) et raccourcit d'environ ${target} %.`);
      conversation.messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: first.toolUseId,
          content: [
            `Trop long de ${result.overflow} % pour tenir sur une page A4, même avec le texte réduit au minimum lisible.`,
            '1. D\'abord, supprime les répétitions : chaque information n\'apparaît qu\'une seule fois ; seul « À retenir » peut résumer ce qui est détaillé ailleurs.'
              + (repetitions.length ? ` Répétitions repérées :\n${repetitions.map((r) => `- ${r}`).join('\n')}` : ''),
            `2. Puis raccourcis les textes d'environ ${target} %, sans supprimer aucun sujet.`,
            'Rappelle ensuite l\'outil avec le compte-rendu complet.',
          ].join('\n'),
        }],
      });
      const shorter = await askModel(conversation);
      const missing = missingSubjects(first.ai, shorter.ai);
      if (missing.length) console.warn(`Contrôle : sujets introuvables dans la version raccourcie, à vérifier : ${missing.map((m) => `« ${m} »`).join(', ')}.`);
      // Répétitions encore là après la relance : retirées par le code.
      const cleaned = removeRepetitions(shorter.ai);
      for (const r of cleaned.removed) console.log(`Répétition retirée : ${r}.`);
      for (const r of cleaned.left) console.warn(`Contrôle : répétition non retirée (bloc entier), ${r}.`);
      result = await finish(cleaned.cr);
      if (result.overflow) console.warn('Toujours trop long après raccourcissement : PDF sur 2 pages.');
    }
    console.log(`PDF : ${result.pdf}\nPNG : ${result.png}`);
  } catch (err) {
    throw explainApiError(err);
  }
}

main().catch((err: Error) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
