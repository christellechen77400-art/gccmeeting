// Règles apprises des corrections (interface, data/regles.json) :
// - nom : un nom ou un mot mal transcrit, remplacé par le code et signalé à l'IA ;
// - redaction : une consigne de rédaction donnée à l'IA ;
// - glossaire : un terme de l'église et sa définition, donnés à l'IA.

export type RuleType = 'nom' | 'redaction' | 'glossaire';

export interface Rule {
  id: string;
  type: RuleType;
  actif: boolean;
  creeLe: string; // ISO
  origine?: string; // titre du compte-rendu où la règle a été apprise
  de?: string; // nom : forme fausse
  vers?: string; // nom : bonne forme
  texte?: string; // redaction : la consigne
  detail?: string; // redaction : un exemple
  terme?: string; // glossaire
  definition?: string; // glossaire
}

export type RuleFields = Pick<Rule, 'type' | 'de' | 'vers' | 'texte' | 'detail' | 'terme' | 'definition'>;

export const RULE_TYPES: RuleType[] = ['nom', 'redaction', 'glossaire'];
const REQUIRED: Record<RuleType, (keyof RuleFields)[]> = {
  nom: ['de', 'vers'],
  redaction: ['texte'],
  glossaire: ['terme', 'definition'],
};
const OPTIONAL: Record<RuleType, (keyof RuleFields)[]> = { nom: [], redaction: ['detail'], glossaire: [] };
const MAX_LENGTH = 200;

// Champs d'une règle venant de l'interface ou de l'IA, nettoyés ; message d'erreur si incomplets.
export function checkRuleFields(input: unknown): RuleFields | string {
  const value = (input ?? {}) as Record<string, unknown>;
  const type = value.type as RuleType;
  if (!RULE_TYPES.includes(type)) return 'Type de règle inconnu.';
  const fields: RuleFields = { type };
  for (const key of [...REQUIRED[type], ...OPTIONAL[type]]) {
    const text = typeof value[key] === 'string' ? (value[key] as string).trim() : '';
    if (text.length > MAX_LENGTH) return `Texte trop long (${MAX_LENGTH} caractères au plus).`;
    if (text) fields[key] = text as never;
    else if (REQUIRED[type].includes(key)) return 'Remplis tous les champs de la règle.';
  }
  return fields;
}

// Règles de départ : les remplacements fixes de src/remplacements.json.
export function rulesFromReplacements(replacements: Record<string, string>, creeLe: string): Rule[] {
  return Object.entries(replacements).map(([de, vers], i) => ({ id: `r${i + 1}`, type: 'nom', actif: true, creeLe, de, vers }));
}

// Remplacements appliqués par le code : règles « nom » actives.
export function replacementsFrom(rules: Rule[]): Record<string, string> {
  return Object.fromEntries(rules.filter((r) => r.actif && r.type === 'nom').map((r) => [r.de!, r.vers!]));
}

// Section ajoutée à la consigne de l'IA ; vide sans règle active.
export function rulesPrompt(rules: Rule[]): string {
  const active = rules.filter((r) => r.actif);
  const of = (type: RuleType) => active.filter((r) => r.type === type);
  const parts = [
    of('nom').length && `Noms et mots souvent mal transcrits :\n${of('nom').map((r) => `- « ${r.de} » → « ${r.vers} »`).join('\n')}`,
    of('redaction').length && `Façon de rédiger :\n${of('redaction').map((r) => `- ${r.texte}${r.detail ? ` (${r.detail})` : ''}`).join('\n')}`,
    of('glossaire').length && `Glossaire :\n${of('glossaire').map((r) => `- **${r.terme}** : ${r.definition}`).join('\n')}`,
  ].filter(Boolean);
  return parts.length ? `\n\n# Règles apprises des corrections de Christelle\nElles s'ajoutent aux règles ci-dessus.\n${parts.join('\n')}` : '';
}

// Texte court d'une règle, pour l'interface : « Nom : « Davidson » → David S. ».
export function describeRule(rule: RuleFields): string {
  if (rule.type === 'nom') return `Nom : « ${rule.de} » → ${rule.vers}`;
  if (rule.type === 'glossaire') return `Glossaire : ${rule.terme} · ${rule.definition}`;
  return `Rédaction : ${rule.texte}`;
}
