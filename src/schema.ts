// Schéma du JSON demandé à l'IA (docs/SPEC.md §4), utilisé pour la sortie structurée
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
  blocs: z.array(block),
  a_confirmer: z.array(z.string()),
});

export type AiCompteRendu = z.infer<typeof AiCompteRenduSchema>;

// Contrôle à la compilation : la sortie de l'IA est bien un CompteRendu affichable.
export const toCompteRendu = (ai: AiCompteRendu, categorie: string): CompteRendu => ({ ...ai, categorie });
