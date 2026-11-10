// Format JSON d'un compte-rendu (docs/SPEC.md §4), avec quelques champs optionnels
// ajoutés pour la mise en page (marqués « ajout »).

export type BlockType =
  | 'bilan'
  | 'decisions'
  | 'objectif'
  | 'nouveautes'
  | 'cartes'
  | 'questions'
  | 'prochaines_etapes'
  | 'intertitre'; // ajout : séparateur de partie (ex. « 2027 — Objectif, instruments et nouveautés »)

export interface Element {
  titre?: string;
  texte?: string;
  tags?: string[];
  qui?: string;
  quand?: string;
  picto?: string; // ajout : nom d'un picto de src/icons.ts
}

export interface Block {
  type: BlockType;
  titre?: string;
  elements?: Element[];
  picto?: string; // ajout : picto du titre de bloc
  sous_titre?: string; // ajout : petit texte au-dessus (objectif) ou à côté (intertitre) du titre
  texte?: string; // ajout : paragraphe d'introduction (objectif)
  titre_etapes?: string; // ajout : titre des étapes numérotées (objectif)
}

export interface PointARetenir {
  titre: string;
  detail?: string;
  picto?: string; // ajout
}

export interface CompteRendu {
  titre: string;
  date: string; // AAAA-MM-JJ ou AAAA-MM
  participants?: string[];
  categorie?: string; // ajout : vient du sous-dossier Drive (GCC, Culte Franco, EDD, DA, Campus GCC, Autre)
  sous_titre?: string; // ajout : sous-titre de la catégorie (sinon celui par défaut)
  a_retenir?: PointARetenir[];
  blocs?: Block[];
  a_confirmer?: string[];
}
