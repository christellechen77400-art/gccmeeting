// Correction d'un compte-rendu déjà rédigé (volet « Corriger » de l'interface) : l'IA reçoit le JSON,
// le texte de la réunion et la demande, renvoie le JSON corrigé, une phrase de réponse et, si la
// correction peut resservir, une règle proposée (nom mal transcrit, consigne de rédaction, glossaire).

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { askTool, explainApiError, startConversation } from './pipeline.ts';
import { applyReplacements, checkCompteRendu, findRepetitions } from './postprocess.ts';
import { checkRuleFields, replacementsFrom, type Rule, type RuleFields } from './rules.ts';
import { AiCompteRenduSchema } from './schema.ts';
import type { CompteRendu } from './types.ts';

const INSTRUCTIONS_PATH = new URL('./correction.md', import.meta.url);
const TOOL_NAME = 'corriger_compte_rendu';

const CorrectionSchema = z.object({
  message: z.string(),
  compte_rendu: AiCompteRenduSchema,
  participants: z.array(z.string()).optional(),
  absents: z.array(z.string()).optional(),
  regle: z.object({
    type: z.enum(['nom', 'redaction', 'glossaire']),
    de: z.string().optional(),
    vers: z.string().optional(),
    texte: z.string().optional(),
    detail: z.string().optional(),
    terme: z.string().optional(),
    definition: z.string().optional(),
  }).optional(),
});

const { $schema, ...inputSchema } = z.toJSONSchema(CorrectionSchema);
const CORRECTION_TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre le compte-rendu corrigé, la réponse à la demande et la règle proposée.',
  input_schema: inputSchema as { type: 'object'; [key: string]: unknown },
};

export interface CorrectionInput {
  cr: CompteRendu; // compte-rendu actuel (cr.json)
  demande: string;
  text?: string; // texte de la réunion (notes ou transcription)
  directory: string[];
  rules: Rule[];
}

export interface CorrectionResult {
  cr: CompteRendu;
  message: string;
  regle?: RuleFields; // absente si la correction ne vaut que pour cette réunion
  warnings: string[];
}

export async function correctCompteRendu(input: CorrectionInput): Promise<CorrectionResult> {
  const { participants, absents, categorie, sous_titre, ...current } = input.cr;
  try {
    const conversation = startConversation(input.directory, input.rules, '\n\n' + readFileSync(INSTRUCTIONS_PATH, 'utf-8'));
    conversation.messages.push({
      role: 'user',
      content: `Présents : ${(participants ?? []).join(', ') || 'non indiqués'}\nAbsents : ${(absents ?? []).join(', ') || 'aucun'}\n\n`
        + `<compte_rendu>\n${JSON.stringify(current, null, 2)}\n</compte_rendu>\n\n`
        + (input.text ? `<notes>\n${input.text}\n</notes>\n\n` : '')
        + `<demande>\n${input.demande}\n</demande>`,
    });
    const log = { info: (msg: string) => console.log(msg), warn: (msg: string) => console.warn(msg) };
    const { value } = await askTool(conversation, log, CORRECTION_TOOL, CorrectionSchema);

    const ai = applyReplacements(value.compte_rendu, replacementsFrom(input.rules));
    const warnings = [...checkCompteRendu(ai).map((w) => `Contrôle : ${w}`), ...findRepetitions(ai).map((r) => `Contrôle : répétition, ${r}.`)];
    const regle = value.regle && checkRuleFields(value.regle);
    return {
      cr: {
        ...ai,
        participants: value.participants ?? participants,
        absents: value.absents ?? absents,
        ...(categorie && { categorie }),
        ...(sous_titre && { sous_titre }),
      },
      message: value.message,
      ...(typeof regle === 'object' && { regle }), // règle incomplète : ignorée
      warnings,
    };
  } catch (err) {
    throw explainApiError(err);
  }
}
