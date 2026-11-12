// Les 6 catégories, avec les couleurs de service de la charte GCC (docs/TEMPLATE.md).

export interface Category {
  label: string; // nom affiché devant le groupe (« ● Culte Franco · Musiciens »)
  color: string;
  defaultSubtitle: string;
}

export const CATEGORIES: Record<string, Category> = {
  'GCC': { label: 'GCC', color: '#cf2a20', defaultSubtitle: 'Coordination' },
  'Culte Franco': { label: 'Culte Franco', color: '#2d5a65', defaultSubtitle: 'Louange' },
  'EDD': { label: 'EDD', color: '#3b6d11', defaultSubtitle: 'École du dimanche' },
  'DA': { label: 'DA', color: '#9d3c63', defaultSubtitle: 'Direction artistique' },
  'Campus GCC': { label: 'Campus GCC', color: '#2471a3', defaultSubtitle: 'GCC' },
  'Autre': { label: 'Autre', color: '#6c6c72', defaultSubtitle: 'Sujet libre' },
};

export const DEFAULT_CATEGORY = 'Autre';
