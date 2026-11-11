// Schéma du JSON demandé à l'IA (docs/SPEC.md §4), utilisé pour l'outil enregistrer_compte_rendu
// et pour valider la réponse avant le rendu.
// `categorie` et `sous_titre` (racine) ne sont pas demandés à l'IA : ils viennent du dossier Drive.

import { z } from 'zod';
import { ICONS } from './icons.ts';
import type { CompteRendu } from './types.ts';

const picto = z.enum(Object.keys(ICONS) as [string, ...string[]]);

const element = z.object({
  titre: z.string().optional(),
  texte: z.string().optional(),
  tags: z.array(z.string()).optional(),
  qui: z.string().optional(),
  quand: z.string().optional(),
  picto: picto.optional(),
});

const block = z.object({
  type: z.enum(['bilan', 'decisions', 'objectif', 'nouveautes', 'cartes', 'questions', 'prochaines_etapes', 'intertitre']),
  titre: z.string().optional(),
  picto: picto.optional(),
  sous_titre: z.string().optional(),
  texte: z.string().optional(),
  titre_etapes: z.string().optional(),
  elements: z.array(element).optional(),
});

export const AiCompteRenduSchema = z.object({
  titre: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
  a_retenir: z.array(z.object({
    titre: z.string(),
    detail: z.string().optional(),
    picto: picto.optional(),
  })),
  // Le modèle s'arrête parfois après un intertitre, ou met le contenu d'un bloc de cartes dans `texte`,
  // que le modèle de page n'affiche pas : ces réponses sont refusées (un nouvel essai avec l'erreur).
  blocs: z.array(block.refine(
    (b) => b.type === 'intertitre' || b.type === 'objectif' || (b.elements?.length ?? 0) > 0,
    'Ce bloc n\'a aucun élément : son contenu doit être dans `elements` (une carte ou une ligne par élément), le `texte` d\'un bloc de cartes n\'est pas affiché.',
  )).refine(
    (blocs) => blocs.some((b) => b.type !== 'intertitre'),
    'Aucun bloc de contenu : reprends tous les sujets des notes dans les blocs.',
  ),
  a_confirmer: z.array(z.string()),
});

export type AiCompteRendu = z.infer<typeof AiCompteRenduSchema>;

export const TOOL_NAME = 'enregistrer_compte_rendu';

// Pas de champ « type » dans l'outil : DeepSeek renvoie une erreur 422.
const { $schema, ...inputSchema } = z.toJSONSchema(AiCompteRenduSchema);
export const COMPTE_RENDU_TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre le compte-rendu de la réunion au format imposé (docs/SPEC.md §4).',
  input_schema: inputSchema as { type: 'object'; [key: string]: unknown },
};

// Contrôle à la compilation : la sortie de l'IA est bien un CompteRendu affichable.
export const toCompteRendu = (ai: AiCompteRendu, categorie: string): CompteRendu => ({ ...ai, categorie });
