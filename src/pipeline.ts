// Chaîne complète, commune à `npm run cr` et à l'interface (`npm run app`) :
// notes (.txt, .md, .pdf, .docx) ou audio (→ transcription Groq) → IA (API compatible Anthropic,
// DeepSeek deepseek-flash par défaut) → <dossier>/<nom>.json → <dossier>/<nom>.pdf + <nom>.png

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { extractTextFromFile } from './extract.ts';
import { extractAbsents, splitPresence } from './participants.ts';
import { applyReplacements, checkCompteRendu, findRepetitions, missingSubjects, removeRepetitions } from './postprocess.ts';
import { render } from './render.ts';
import { AUDIO_EXTENSIONS, transcribe } from './transcribe.ts';
import { AiCompteRenduSchema, COMPTE_RENDU_TOOL, TOOL_NAME, toCompteRendu, type AiCompteRendu } from './schema.ts';

const DEFAULT_MODEL = 'deepseek-flash';
const PROMPT_PATH = new URL('./prompt.md', import.meta.url);
const TEMPERATURE = 0.2; // basse : des comptes-rendus plus réguliers d'un essai à l'autre
// Le bandeau ne rétrécit pas : pour gagner X % de la page, le contenu doit raccourcir de plus de X %.
const SHORTEN_FACTOR = 1.5;

export type Step = 'transcription' | 'redaction' | 'mise_en_page';

export interface PipelineInput {
  file: string; // notes ou enregistrement
  categorie: string;
  groupe?: string; // affiché à côté de la catégorie
  members: string[]; // présents par défaut : le groupe, ou la liste corrigée dans l'interface
  absents?: string[]; // absents déjà indiqués (interface)
  directory: string[]; // annuaire : liste des membres donnée à l'IA
  depositDate?: string; // AAAA-MM-JJ : l'IA en déduit l'année si elle manque
  meetingDate?: string; // AAAA-MM-JJ choisie dans l'interface : elle remplace la date trouvée par l'IA
  titre?: string; // titre choisi dans l'interface : il remplace celui de l'IA
  outDir: string;
  name: string; // fichiers <name>.json, .pdf, .png (et .transcription.txt pour un audio)
  onStep?: (step: Step) => void;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export interface PipelineResult {
  json: string;
  pdf: string;
  png: string;
  overflow: number;
  transcription?: string; // chemin de la transcription brute (audio)
  warnings: string[];
}

// Conversation avec l'IA, gardée pour pouvoir lui demander de raccourcir sa réponse.
type Conversation = { client: Anthropic; model: string; system: string; messages: Anthropic.MessageParam[] };

// La liste des membres de la consigne vient de l'annuaire ; les membres du groupe départagent les homonymes.
function startConversation(text: string, input: PipelineInput): Conversation {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Clé API manquante : renseigne ANTHROPIC_API_KEY dans le fichier .env (modèle : .env.example).');
  }
  const people = [...input.members, ...(input.absents ?? [])];
  return {
    client: new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined }),
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    system: readFileSync(PROMPT_PATH, 'utf-8').replace('{{annuaire}}', input.directory.join(', ')),
    messages: [{
      role: 'user',
      content: `Catégorie : ${input.categorie}\n`
        + (input.meetingDate ? `Date de la réunion : ${input.meetingDate}\n` : `Date de dépôt du fichier : ${input.depositDate}\n`)
        + (people.length ? `Membres du groupe de la réunion : ${people.join(', ')}\n` : '')
        + `\n<notes>\n${text}\n</notes>`,
    }],
  };
}

// L'IA répond en appelant l'outil enregistrer_compte_rendu (forcé, sans réflexion).
// JSON non conforme : un seul nouvel essai, en renvoyant l'erreur au modèle.
// La réponse retenue est ajoutée à la conversation ; `toolUseId` permet d'y répondre.
async function askModel({ client, model, system, messages }: Conversation, log: NonNullable<PipelineInput['log']>): Promise<{ ai: AiCompteRendu; toolUseId: string }> {
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
    log.info(`${response.model} : ${response.usage.input_tokens + cached} jetons en entrée (dont ${cached} en cache), ${response.usage.output_tokens} en sortie.`);

    const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME);
    const checked = AiCompteRenduSchema.safeParse(call?.input);
    if (checked.success) {
      messages.push({ role: 'assistant', content: response.content });
      return { ai: checked.data, toolUseId: call!.id }; // valide, donc l'outil a bien été appelé
    }

    const problem = call ? z.prettifyError(checked.error) : `pas d'appel à l'outil ${TOOL_NAME}`;
    if (attempt === 2) throw new Error(`JSON du modèle non conforme après 2 essais :\n${problem}`);
    log.warn(`JSON du modèle non conforme, nouvel essai :\n${problem}`);
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

export async function createCompteRendu(input: PipelineInput): Promise<PipelineResult> {
  const warnings: string[] = [];
  const log = {
    info: input.log?.info ?? ((msg: string) => console.log(msg)),
    warn: (msg: string) => { warnings.push(msg); (input.log?.warn ?? console.warn)(msg); },
  };
  mkdirSync(input.outDir, { recursive: true });

  // Audio : transcription Groq, enregistrée telle quelle pour pouvoir la relire.
  let raw: string;
  let transcriptionPath: string | undefined;
  if (AUDIO_EXTENSIONS.includes(extname(input.file).toLowerCase())) {
    input.onStep?.('transcription');
    const started = Date.now();
    const transcription = await transcribe(input.file);
    // Erreurs de transcription courantes corrigées dès maintenant, pour reconnaître aussi les absents.
    raw = applyReplacements(transcription);
    transcriptionPath = join(input.outDir, `${input.name}.transcription.txt`);
    writeFileSync(transcriptionPath, transcription + '\n', 'utf-8');
    log.info(`Transcription : ${transcriptionPath} (${Math.round((Date.now() - started) / 1000)} s).`);
  } else {
    raw = await extractTextFromFile(input.file);
  }
  // « Absents : … » en tête des notes, ou dit au début de l'enregistrement.
  const extracted = extractAbsents(raw);
  const text = extracted.text;
  log.info(`Texte extrait : ${text.length} caractères.`);

  // Présents = membres moins les absents ; sans membres, pas de participants.
  const split = splitPresence(input.members, extracted.names);
  const presence = {
    participants: split.participants,
    absents: [...(input.absents ?? []), ...split.absents],
    unknown: split.unknown,
  };
  if (input.members.length) log.info(`${presence.participants.length} présents, ${presence.absents.length} absents.`);

  const jsonPath = join(input.outDir, `${input.name}.json`);
  // Corrections par le code, contrôles, puis JSON enregistré et rendu en PDF + PNG.
  const finish = async (answer: AiCompteRendu) => {
    const ai = applyReplacements(answer);
    for (const name of presence.unknown) ai.a_confirmer.push(`Absent non reconnu dans le groupe : ${name}`);
    for (const warning of checkCompteRendu(ai)) log.warn(`Contrôle : ${warning}`);
    for (const repetition of findRepetitions(ai)) log.warn(`Contrôle : répétition, ${repetition}.`);
    writeFileSync(jsonPath, JSON.stringify({
      ...toCompteRendu(ai, input.categorie, { participants: presence.participants, absents: presence.absents }),
      ...(input.titre && { titre: input.titre }),
      ...(input.meetingDate && { date: input.meetingDate }),
      ...(input.groupe && { sous_titre: input.groupe }), // charte GCC : « ● Catégorie · Groupe » au-dessus du titre
    }, null, 2) + '\n', 'utf-8');
    log.info(`JSON : ${jsonPath}`);
    input.onStep?.('mise_en_page');
    return render(jsonPath, input.outDir);
  };

  input.onStep?.('redaction');
  const conversation = startConversation(text, input);
  try {
    const first = await askModel(conversation, log);
    let result = await finish(first.ai);
    // Plus d'une page même réduit au minimum : un seul essai pour retirer les répétitions et raccourcir ;
    // sinon le PDF reste sur 2 pages.
    if (result.overflow) {
      const repetitions = findRepetitions(first.ai);
      const target = Math.ceil(result.overflow * SHORTEN_FACTOR);
      log.info(`Trop long de ${result.overflow} % : le modèle retire les répétitions (${repetitions.length}) et raccourcit d'environ ${target} %.`);
      input.onStep?.('redaction');
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
      const shorter = await askModel(conversation, log);
      warnings.length = 0; // les contrôles de la première version ne valent plus
      const missing = missingSubjects(first.ai, shorter.ai);
      if (missing.length) log.warn(`Contrôle : sujets introuvables dans la version raccourcie, à vérifier : ${missing.map((m) => `« ${m} »`).join(', ')}.`);
      // Répétitions encore là après la relance : retirées par le code.
      const cleaned = removeRepetitions(shorter.ai);
      for (const r of cleaned.removed) log.info(`Répétition retirée : ${r}.`);
      for (const r of cleaned.left) log.warn(`Contrôle : répétition non retirée (bloc entier), ${r}.`);
      result = await finish(cleaned.cr);
      if (result.overflow) log.warn('Toujours trop long après raccourcissement : PDF sur 2 pages.');
    }
    return { json: jsonPath, ...result, transcription: transcriptionPath, warnings };
  } catch (err) {
    throw explainApiError(err);
  }
}
