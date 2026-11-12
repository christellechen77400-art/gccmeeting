// Texte court à coller dans WhatsApp : titre, « À retenir », prochaines étapes, présents.
// WhatsApp met en gras entre *…* : le gras **…** du compte-rendu est converti.

import { formatDate } from './template.ts';
import type { CompteRendu } from './types.ts';

const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '*$1*');

export function whatsappText(cr: CompteRendu): string {
  const lines = [`*${cr.titre}*`, [cr.categorie, cr.sous_titre, formatDate(cr.date)].filter(Boolean).join(' · ')];
  const keep = (cr.a_retenir ?? []).slice(0, 3);
  if (keep.length) {
    lines.push('', '*À retenir*', ...keep.map((p, i) => `${i + 1}. ${bold(p.titre)}${p.detail ? ` : ${bold(p.detail)}` : ''}`));
  }
  const steps = (cr.blocs ?? []).filter((b) => b.type === 'prochaines_etapes').flatMap((b) => b.elements ?? []);
  if (steps.length) {
    lines.push('', '*Prochaines étapes*', ...steps.map((e) =>
      `• ${[e.qui, bold(e.texte ?? e.titre ?? '')].filter(Boolean).join(' : ')}${e.quand ? ` (${e.quand})` : ''}`));
  }
  const present = cr.participants ?? [];
  const absent = cr.absents ?? [];
  if (present.length || absent.length) {
    lines.push('', `Présents (${present.length}) : ${present.join(', ') || 'aucun'}`);
    if (absent.length) lines.push(`Absents : ${absent.join(', ')}`);
  }
  lines.push('', 'Compte-rendu complet en PDF.');
  return lines.join('\n');
}
