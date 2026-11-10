// Les 6 catégories de bandeau (docs/TEMPLATE.md).

export interface Category {
  label: string; // nom affiché dans la pastille
  color: string;
  picto: string;
  defaultSubtitle: string;
}

export const CATEGORIES: Record<string, Category> = {
  'GCC': { label: 'GCC', color: '#B4552F', picto: 'sprout', defaultSubtitle: 'Coordination' },
  'Culte Franco': { label: 'Culte Franco', color: '#5E7487', picto: 'music', defaultSubtitle: 'Louange' },
  'EDD': { label: 'EDD', color: '#6E7B5C', picto: 'kids', defaultSubtitle: 'École du dimanche' },
  'DA': { label: 'DA', color: '#A86A7A', picto: 'brief', defaultSubtitle: 'Direction artistique' },
  'Campus GCC': { label: 'Campus', color: '#C48A3A', picto: 'flame', defaultSubtitle: 'GCC' },
  'Autre': { label: 'Autre', color: '#8C7B6B', picto: 'chat', defaultSubtitle: 'Sujet libre' },
};

export const DEFAULT_CATEGORY = 'Autre';
