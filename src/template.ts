// Modèle HTML/CSS du compte-rendu (docs/TEMPLATE.md, reference/exemple-cr-musiciens.html).

import { readFileSync } from 'node:fs';
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from './categories.ts';
import { ICONS, iconSymbols } from './icons.ts';
import type { Block, CompteRendu, Element } from './types.ts';

const FONTS_DIR = new URL('../fonts/', import.meta.url);

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

// Titre et picto par défaut de chaque type de bloc.
const BLOCK_DEFAULTS: Record<string, { titre: string; picto: string; cardPicto: string }> = {
  bilan: { titre: 'Bilan', picto: 'history', cardPicto: 'history' },
  decisions: { titre: 'Décisions', picto: 'check', cardPicto: 'check' },
  objectif: { titre: 'Objectif', picto: 'target', cardPicto: 'target' },
  nouveautes: { titre: 'Nouveautés', picto: 'sparkle', cardPicto: 'sparkle' },
  cartes: { titre: 'Résumé', picto: 'settings', cardPicto: 'target' },
  questions: { titre: 'Questions ouvertes', picto: 'help', cardPicto: 'help' },
  prochaines_etapes: { titre: 'Prochaines étapes', picto: 'arrow', cardPicto: 'arrow' },
  intertitre: { titre: '', picto: '', cardPicto: '' },
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Texte échappé, avec **gras** autorisé.
function rich(s: string | undefined): string {
  return escapeHtml(s ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

function plain(s: string | undefined): string {
  return escapeHtml((s ?? '').replace(/\*\*/g, ''));
}

export function formatDate(date: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!m) return date;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return date;
  if (!m[3]) return `${month[0].toUpperCase()}${month.slice(1)} ${m[1]}`;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

export function resolveCategory(name: string | undefined): Category {
  return CATEGORIES[name ?? DEFAULT_CATEGORY] ?? CATEGORIES[DEFAULT_CATEGORY];
}

function icon(name: string | undefined, fallback: string, cls = ''): string {
  const id = name && ICONS[name] ? name : fallback;
  return `<svg class="ico${cls ? ' ' + cls : ''}"><use href="#${id}"/></svg>`;
}

function fontFace(family: string, file: string, weight: number): string {
  const data = readFileSync(new URL(file, FONTS_DIR)).toString('base64');
  return `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/ttf;base64,${data}) format("truetype")}`;
}

function hasContent(b: Block): boolean {
  if (b.type === 'intertitre') return Boolean(b.titre || b.sous_titre);
  if (b.type === 'objectif') return Boolean(b.titre || b.texte || b.elements?.length);
  return Boolean(b.elements?.length);
}

function elementText(e: Element): string {
  return e.texte ?? e.titre ?? '';
}

function meta(e: Element): string {
  const parts = [e.qui, e.quand].filter(Boolean).map((p) => `<b>${plain(p)}</b>`);
  return parts.length ? `<p class="meta">${parts.join(' · ')}</p>` : '';
}

function card(e: Element, fallbackPicto: string, iconCls: string): string {
  const tags = e.tags?.length ? `<span class="tag">${e.tags.map(plain).join(' · ')}</span>` : '';
  return `<div class="card">${icon(e.picto, fallbackPicto, 'lg' + iconCls)}<div>`
    + (e.titre ? `<h3>${plain(e.titre)}</h3>` : '')
    + (e.texte ? `<p>${rich(e.texte)}</p>` : '')
    + meta(e) + tags + '</div></div>';
}

function heading(b: Block, big: boolean): string {
  const d = BLOCK_DEFAULTS[b.type];
  return `<h2${big ? '' : ' class="sm"'}>${icon(b.picto, d.picto, big ? 'lg' : '')}${plain(b.titre ?? d.titre)}</h2>`;
}

function dots(items: string[]): string {
  return `<ul class="dots">${items.map((t) => `<li>${rich(t)}</li>`).join('')}</ul>`;
}

function gridCols(n: number): number {
  if (n === 1) return 1;
  return n % 3 === 0 ? 3 : 2;
}

function renderBlock(b: Block, big = false): string {
  const d = BLOCK_DEFAULTS[b.type];
  const els = b.elements ?? [];
  switch (b.type) {
    case 'intertitre':
      return `<div class="inter"><div class="big">${plain(b.titre)}`
        + (b.sous_titre ? ` <span>${plain(b.sous_titre)}</span>` : '') + '</div></div>';
    case 'bilan':
      return `<section>${heading(b, big)}${dots(els.map(elementText))}</section>`;
    case 'objectif': {
      const steps = els.length
        ? `<div><div class="eyebrow" style="margin-bottom:2mm">${plain(b.titre_etapes ?? 'Étapes')}</div>`
          + `<div class="steps" style="grid-template-columns:repeat(${Math.min(els.length, 4)},1fr)">`
          + els.map((e, i) => `<div><b>${i + 1}</b>${rich(elementText(e))}</div>`).join('')
          + '</div></div>'
        : '';
      return `<section><div class="goal${steps ? ' split' : ''}"><div class="txt">`
        + `<div class="eyebrow">${plain(b.sous_titre ?? d.titre)}</div>`
        + (b.titre ? `<h3>${plain(b.titre)}</h3>` : '')
        + (b.texte ? `<p>${rich(b.texte)}</p>` : '')
        + `</div>${steps}</div></section>`;
    }
    case 'prochaines_etapes':
      return `<section>${heading(b, big)}<div class="next">`
        + els.map((e) => `<div class="row"><b>${e.qui ? plain(e.qui) : '<i>à confirmer</i>'}</b>`
          + `<span>${rich(elementText(e))}</span>`
          + `<span class="when">${e.quand ? plain(e.quand) : '<i>à confirmer</i>'}</span></div>`).join('')
        + '</div></section>';
    case 'cartes':
    case 'decisions':
    case 'questions':
    case 'nouveautes': {
      const cols = b.type === 'nouveautes' ? Math.min(els.length, 2) : gridCols(els.length);
      const iconCls = b.type === 'nouveautes' ? ' sage' : '';
      return `<section>${heading(b, big)}<div class="grid" style="grid-template-columns:repeat(${cols},1fr)">`
        + els.map((e) => card(e, d.cardPicto, iconCls)).join('') + '</div></section>';
    }
  }
}

export function renderHtml(cr: CompteRendu): string {
  const cat = resolveCategory(cr.categorie);
  const subtitle = cr.sous_titre ?? cat.defaultSubtitle;
  const date = formatDate(cr.date);
  const participants = (cr.participants ?? []).filter(Boolean);
  const blocks = (cr.blocs ?? []).filter(hasContent);
  const keep = (cr.a_retenir ?? []).slice(0, 3);

  // Le premier bilan se place à côté de « À retenir », comme dans la référence.
  const bilanIdx = blocks.findIndex((b) => b.type === 'bilan');
  const topBilan = bilanIdx >= 0 ? blocks.splice(bilanIdx, 1)[0] : undefined;

  const keepHtml = keep.length
    ? `<div class="keep"><div class="eyebrow">${icon('pin', 'pin', 'xs')}À retenir</div><ul>`
      + keep.map((k) => `<li>${icon(k.picto, 'target')}<div><b>${plain(k.titre)}</b>`
        + (k.detail ? `<span>${rich(k.detail)}</span>` : '') + '</div></li>').join('')
      + '</ul></div>'
    : '';
  const topParts = [keepHtml, topBilan ? renderBlock(topBilan, true) : ''].filter(Boolean);
  const top = topParts.length
    ? `<div class="top" style="grid-template-columns:repeat(${topParts.length},1fr)">${topParts.join('')}</div>`
    : '';

  const confirm = cr.a_confirmer?.length
    ? `<section><div class="confirm"><div class="eyebrow">${icon('alert', 'alert', 'xs')}À confirmer</div>`
      + dots(cr.a_confirmer) + '</div></section>'
    : '';

  const footLeft = ['GCC', cat.label === 'GCC' ? subtitle : cat.label, cr.titre].map(plain).join(' · ');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${plain(cr.titre)}</title>
<style>
${fontFace('Caladea', 'Caladea-Regular.ttf', 400)}
${fontFace('Caladea', 'Caladea-Bold.ttf', 700)}
${fontFace('Carlito', 'Carlito-Regular.ttf', 400)}
${fontFace('Carlito', 'Carlito-Bold.ttf', 700)}
:root{--bg:#F4EEE6;--card:#EAE0D2;--dark:#2E2118;--rust:#B4552F;--sage:#6E7B5C;--muted:#6B5D50;--line:#DCCFBD;--cat:${cat.color}}
@page{size:210mm 297mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Carlito,Calibri,sans-serif;color:var(--dark);font-size:10.5pt;line-height:1.38}
.page{width:210mm;min-height:297mm;background:var(--bg);position:relative;overflow:hidden;padding:0 0 16mm}
.foot{position:absolute;left:10mm;right:10mm;bottom:5.5mm;display:flex;justify-content:space-between;font-size:6.8pt;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.eyebrow{font-size:7pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--rust)}
h1{font-family:Caladea,Cambria,serif;font-weight:700;font-size:23pt;line-height:1.05;color:#fff;margin-top:2.5mm}
h2{font-family:Caladea,Cambria,serif;font-weight:700;font-size:14.5pt;line-height:1.15;display:flex;align-items:center;gap:2.6mm;margin-bottom:3mm}
h2.sm{font-size:12.5pt;margin-bottom:2.6mm}
h3{font-family:Caladea,Cambria,serif;font-weight:700;font-size:11pt;line-height:1.2}
section{margin-top:5mm}
.ico{width:5.2mm;height:5.2mm;flex:none;stroke:var(--rust);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ico.lg{width:7mm;height:7mm}
.ico.xs{width:4mm;height:4mm}
.ico.sage{stroke:var(--sage)}
/* bandeau */
.cover{background:var(--dark);padding:8mm 10mm 7mm;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:6mm}
.cover .eyebrow{color:var(--cat);filter:brightness(1.35)}
.cover .date{color:#D9CBB8;font-size:9.5pt;margin-top:2mm}
.cover .date b{color:#fff}
.rings{position:absolute;right:30mm;top:-30mm;width:70mm;height:70mm;border-radius:50%;border:0.3mm solid rgba(255,255,255,.07);box-shadow:0 0 0 6mm rgba(255,255,255,0),0 0 0 6.3mm rgba(255,255,255,.06),0 0 0 12mm rgba(255,255,255,0),0 0 0 12.3mm rgba(255,255,255,.05)}
.badge{position:relative;flex:none;display:flex;align-items:center;gap:2.6mm;border-radius:10mm;padding:2mm 4.4mm 2mm 2.4mm;color:#fff;background:var(--cat)}
.badge .dot{width:8mm;height:8mm;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center}
.badge .dot svg{width:4.6mm;height:4.6mm;stroke:#fff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.badge b{display:block;font-family:Caladea,serif;font-size:11.5pt;line-height:1.1}
.badge span{font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
/* à retenir + bilan */
.top{display:grid;gap:6mm;padding:7mm 10mm 0;align-items:start}
.top section{margin-top:0}
.keep{background:var(--card);border-radius:2.2mm;padding:4mm 4.2mm}
.keep .eyebrow{margin-bottom:2.6mm;display:flex;align-items:center;gap:1.8mm}
.keep ul{list-style:none;display:grid;gap:2.6mm}
.keep li{display:flex;gap:2.6mm;align-items:flex-start}
.keep li b{display:block}
.keep li span{color:var(--muted);font-size:9.5pt}
ul.dots{list-style:none;display:grid;gap:2mm}
ul.dots li{padding-left:4mm;position:relative}
ul.dots li::before{content:"";position:absolute;left:.6mm;top:2.1mm;width:1.4mm;height:1.4mm;border-radius:50%;background:var(--rust)}
/* corps */
.body{padding:0 10mm}
.body>section:first-child{margin-top:7mm}
.inter{margin-top:7mm;border-top:0.4mm solid var(--line);padding-top:5mm}
.inter+section{margin-top:0}
.inter .big{font-family:Caladea,serif;font-weight:700;font-size:26pt;line-height:1;color:var(--rust);display:flex;align-items:baseline;gap:3mm;margin-bottom:4mm}
.inter .big span{font-size:10pt;font-family:Carlito,sans-serif;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.goal{background:var(--dark);color:#fff;border-radius:2.2mm;padding:5mm 4.6mm;display:grid;gap:2.4mm}
.goal.split{grid-template-columns:1fr 1.25fr;align-items:center;column-gap:6mm}
.goal .txt{display:grid;gap:1.6mm}
.goal .eyebrow{color:#E9B79F}
.goal h3{font-size:13.5pt;color:#fff}
.goal p{color:#D9CBB8;font-size:9.8pt}
.goal p b{color:#fff}
.steps{display:grid;gap:2mm}
.steps div{border:0.25mm solid rgba(233,183,159,.35);border-radius:1.6mm;padding:2.4mm 2mm;font-size:8.6pt;color:#F4EEE6;line-height:1.25}
.steps b{display:block;font-family:Caladea,serif;font-size:12pt;color:#E9B79F}
.grid{display:grid;gap:3mm}
.grid .card{height:100%}
.card{background:var(--card);border-radius:2.2mm;padding:3.4mm 3.8mm;display:flex;gap:3.2mm;align-items:flex-start}
.card p{font-size:9.6pt;color:#3E3229;margin-top:.8mm}
.card p.meta{font-size:8.6pt;color:var(--muted);margin-top:1.4mm}
.card p.meta b{color:var(--dark)}
.tag{display:inline-block;font-size:6.8pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sage);margin-top:1.2mm}
.next{background:var(--card);border-radius:2.2mm;padding:1.4mm 3.8mm}
.next .row{display:grid;grid-template-columns:32mm 1fr 30mm;gap:3mm;padding:2mm 0;font-size:9.6pt}
.next .row+.row{border-top:0.25mm solid var(--line)}
.next .when{color:var(--muted);text-align:right}
.next i{font-style:normal;color:var(--rust)}
.confirm{border:0.3mm dashed var(--rust);border-radius:2.2mm;padding:3.4mm 4.2mm;font-size:9.6pt}
.confirm .eyebrow{margin-bottom:2mm;display:flex;align-items:center;gap:1.8mm}
</style></head><body>
<svg width="0" height="0" style="position:absolute">
${iconSymbols()}
</svg>
<div class="page">
  <div class="cover">
    <div class="rings"></div>
    <div>
      <div class="eyebrow">${plain(cat.label)} · ${plain(subtitle)}</div>
      <h1>${plain(cr.titre)}</h1>
      <div class="date">${escapeHtml(date)}${participants.length ? ' · <b>' + participants.map(plain).join(' · ') + '</b>' : ''}</div>
    </div>
    <div class="badge"><div class="dot"><svg><use href="#${cat.picto}"/></svg></div><div><b>${plain(cat.label)}</b><span>${plain(subtitle)}</span></div></div>
  </div>
  ${top}
  <div class="body">
    ${blocks.map((b) => renderBlock(b)).join('\n    ')}
    ${confirm}
  </div>
  <div class="foot"><span>${footLeft}</span><span>${escapeHtml(date)}</span></div>
</div>
</body></html>`;
}
