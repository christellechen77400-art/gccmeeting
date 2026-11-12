// Modèle HTML/CSS du compte-rendu, charte GCC (docs/TEMPLATE.md, reference/exemple-cr-musiciens-charte-gcc.html).

import { readFileSync } from 'node:fs';
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from './categories.ts';
import { ICONS, iconSymbols } from './icons.ts';
import type { Block, CompteRendu, Element } from './types.ts';

const FONTS_DIR = new URL('../fonts/', import.meta.url);
const LOGO = new URL('../reference/gcc-logo.png', import.meta.url);

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
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2")}`;
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


function card(e: Element, fallbackPicto: string): string {
  const tags = e.tags?.length ? `<span class="tag">${e.tags.map(plain).join(' · ')}</span>` : '';
  return `<div class="card">${icon(e.picto, fallbackPicto, 'lg')}<div>`
    + (e.titre ? `<h3>${plain(e.titre)}</h3>` : '')
    + (e.texte ? `<p>${rich(e.texte)}</p>` : '')
    + meta(e) + tags + '</div></div>';
}

// Intertitre de section, avec la petite barre de couleur de la catégorie.
function heading(b: Block): string {
  return `<h2 class="sec">${plain(b.titre ?? BLOCK_DEFAULTS[b.type].titre)}</h2>`;
}

// Libellé en haut d'un panneau (« À retenir », bilan placé à côté).
function label(text: string, picto: string): string {
  return `<div class="label">${icon(picto, picto, 'xs')}${plain(text)}</div>`;
}

function dots(items: string[]): string {
  return `<ul class="dots">${items.map((t) => `<li>${rich(t)}</li>`).join('')}</ul>`;
}

function gridCols(n: number): number {
  if (n === 1) return 1;
  return n % 3 === 0 ? 3 : 2;
}

function renderBlock(b: Block): string {
  const d = BLOCK_DEFAULTS[b.type];
  const els = b.elements ?? [];
  switch (b.type) {
    case 'intertitre':
      return `<h2 class="inter"><span class="yr">${plain(b.titre)}</span>`
        + (b.sous_titre ? ` <small>${plain(b.sous_titre)}</small>` : '') + '</h2>';
    case 'bilan':
      return `<section>${heading(b)}<div class="panel">${dots(els.map(elementText))}</div></section>`;
    case 'objectif': {
      // Éléments avec un titre : piliers (picto, titre, texte), comme reference/exemple-cr-gcc.png ;
      // sinon étapes numérotées, comme reference/exemple-cr-musiciens-charte-gcc.png.
      const pillars = els.length > 0 && els.every((e) => e.titre);
      const steps = !els.length ? '' : pillars
        ? '<div class="pillars">'
          + els.map((e) => `<div class="pillar">${icon(e.picto, 'target', 'lg w')}<div><b>${plain(e.titre)}</b>`
            + (e.texte ? `<span>${rich(e.texte)}</span>` : '') + '</div></div>').join('')
          + '</div>'
        : `<div><div class="k">${plain(b.titre_etapes ?? 'Étapes')}</div>`
          + `<div class="steps" style="grid-template-columns:repeat(${Math.min(els.length, 4)},1fr)">`
          + els.map((e, i) => `<div><span class="n">${i + 1}</span>${rich(elementText(e))}</div>`).join('')
          + '</div></div>';
      return `<section><div class="goal${steps ? ' split' : ''}"><div class="txt">`
        + `<div class="k">${plain(b.sous_titre ?? d.titre)}</div>`
        + (b.titre ? `<h3>${plain(b.titre)}</h3>` : '')
        + (b.texte ? `<p>${rich(b.texte)}</p>` : '')
        + `</div>${steps}</div></section>`;
    }
    case 'prochaines_etapes':
      return `<section>${heading(b)}<div class="panel next">`
        + els.map((e) => `<div class="row"><b>${e.qui ? plain(e.qui) : '<i>à confirmer</i>'}</b>`
          + `<span>${rich(elementText(e))}</span>`
          + `<span class="when">${e.quand ? plain(e.quand) : '<i>à confirmer</i>'}</span></div>`).join('')
        + '</div></section>';
    case 'cartes':
    case 'decisions':
    case 'questions':
    case 'nouveautes': {
      const cols = b.type === 'nouveautes' ? Math.min(els.length, 2) : gridCols(els.length);
      return `<section>${heading(b)}<div class="grid" style="grid-template-columns:repeat(${cols},1fr)">`
        + els.map((e) => card(e, d.cardPicto)).join('') + '</div></section>';
    }
  }
}

function count(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

export function renderHtml(cr: CompteRendu): string {
  const cat = resolveCategory(cr.categorie);
  const subtitle = cr.sous_titre ?? cat.defaultSubtitle;
  const date = formatDate(cr.date);
  const participants = (cr.participants ?? []).filter(Boolean);
  const absents = (cr.absents ?? []).filter(Boolean);
  const blocks = (cr.blocs ?? []).filter(hasContent);
  const keep = (cr.a_retenir ?? []).slice(0, 3);

  // Présents en pastilles blanches sous le titre, absents barrés ; rien sans groupe.
  const chips = participants.map((p) => `<span class="chip">${plain(p)}</span>`)
    .concat(absents.map((a) => `<span class="chip abs">${plain(a)}</span>`)).join('');
  const sub = participants.length || absents.length
    ? `<p class="sub"><b>${count(participants.length, 'participant')}</b>`
      + (absents.length ? ` · ${count(absents.length, 'absent')}` : '') + `</p><div class="chips">${chips}</div>`
    : '';

  // Le premier bilan se place à côté de « À retenir », comme dans la référence.
  const bilanIdx = blocks.findIndex((b) => b.type === 'bilan');
  const topBilan = bilanIdx >= 0 ? blocks.splice(bilanIdx, 1)[0] : undefined;

  const keepHtml = keep.length
    ? `<div class="panel tint">${label('À retenir', 'pin')}`
      + keep.map((k, i) => `<div class="row"><span class="num">${i + 1}</span><div><b>${plain(k.titre)}</b>`
        + (k.detail ? `<span>${rich(k.detail)}</span>` : '') + '</div></div>').join('')
      + '</div>'
    : '';
  const bilanHtml = topBilan
    ? `<div class="panel">${label(topBilan.titre ?? BLOCK_DEFAULTS.bilan.titre, topBilan.picto && ICONS[topBilan.picto] ? topBilan.picto : 'history')}`
      + dots((topBilan.elements ?? []).map(elementText)) + '</div>'
    : '';
  const topParts = [keepHtml, bilanHtml].filter(Boolean);
  const top = topParts.length
    ? `<div class="top" style="grid-template-columns:repeat(${topParts.length},1fr)">${topParts.join('')}</div>`
    : '';

  const confirm = cr.a_confirmer?.length
    ? `<section><div class="panel confirm">${label('À confirmer', 'alert')}${dots(cr.a_confirmer)}</div></section>`
    : '';

  const footLeft = ['GCC Meeting', cat.label, cr.titre].map(plain).join(' · ');
  const logo = readFileSync(LOGO).toString('base64');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${plain(cr.titre)}</title>
<style>
${fontFace('Inter', 'Inter-Regular.woff2', 400)}
${fontFace('Inter', 'Inter-Medium.woff2', 500)}
${fontFace('Inter', 'Inter-SemiBold.woff2', 600)}
${fontFace('Inter', 'Inter-Bold.woff2', 700)}
${fontFace('Inter Display', 'InterDisplay-Bold.woff2', 700)}
${fontFace('Inter Display', 'InterDisplay-ExtraBold.woff2', 800)}
:root{--ink:#1c1c1e;--muted:#6c6c72;--fond:#f2f2f7;--card:#fff;--line:#e4e4e5;--brand:#cf2a20;--cat:${cat.color};--deep:${cat.deep ?? cat.color};
--tint:color-mix(in srgb,var(--cat) 9%,white);--tint-line:color-mix(in srgb,var(--cat) 18%,white);--soft:color-mix(in srgb,var(--cat) 12%,white);
--shadow:0 4px 14px rgba(28,28,30,.08),0 1px 2px rgba(28,28,30,.05);
--sans:Inter,"PingFang SC","Noto Sans CJK SC",-apple-system,sans-serif;--display:"Inter Display",Inter,"PingFang SC","Noto Sans CJK SC",sans-serif}
@page{size:210mm 297mm;margin:12mm 0 0;background:#f2f2f7}
@page:first{margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--fond);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:var(--sans);color:var(--ink);font-size:9.6pt;line-height:1.4;letter-spacing:-.003em}
b{font-weight:600}
.page{width:210mm;min-height:297mm;background:var(--fond);position:relative;overflow:hidden;padding:8mm 0 12mm}
.halo{position:absolute;left:-40mm;top:-40mm;width:150mm;height:110mm;border-radius:50%;background:var(--cat);opacity:.13;filter:blur(40px)}
.foot{position:absolute;left:11mm;right:11mm;bottom:5.5mm;display:flex;justify-content:space-between;font-size:7.4pt;color:var(--muted)}
/* en-tête : signature, catégorie · groupe, titre, participants */
.head{position:relative;padding:0 11mm}
.brandrow{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:2.4mm;font-weight:700;font-size:12.5pt;letter-spacing:-.02em}
.brand img{width:8mm;height:8mm}
.brand span{color:var(--brand)}
.date{font-size:9pt;color:var(--muted)}
.svcline{display:flex;align-items:center;gap:1.6mm;color:var(--cat);font-weight:600;font-size:10pt;margin-top:4.6mm}
.dot{width:2.2mm;height:2.2mm;border-radius:50%;background:var(--cat)}
h1{font-family:var(--display);font-weight:800;font-size:25pt;line-height:1.05;letter-spacing:-.03em;margin-top:1.4mm}
.sub{color:var(--muted);font-size:10pt;margin-top:1.6mm}
.sub b{color:var(--ink);font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:1.4mm;margin-top:2.2mm}
.chip{background:var(--card);border-radius:10mm;padding:.8mm 2.6mm;font-size:8.4pt;font-weight:500;box-shadow:0 0 0 .25mm var(--line)}
.chip.abs{background:transparent;color:var(--muted);text-decoration:line-through}
/* contenu sous l'en-tête : réduit par render.ts (--fit < 1) s'il dépasse une page ; marges latérales compensées */
.fit{zoom:var(--fit,1);position:relative}
.fit .tag{font-size:max(7.6pt,calc(6pt / var(--fit,1)))}
.fit .label,.fit .k{font-size:max(8pt,calc(6.4pt / var(--fit,1)))}
.top{display:grid;gap:3.6mm;padding:4.4mm calc(11mm / var(--fit,1)) 0;align-items:stretch}
.body{padding:0 calc(11mm / var(--fit,1))}
section{margin-top:3.9mm}
.panel{background:var(--card);border-radius:4.2mm;padding:3.8mm 4.4mm;box-shadow:var(--shadow)}
.panel.tint{background:var(--tint);box-shadow:0 0 0 .25mm var(--tint-line)}
.label{font-size:8pt;font-weight:600;color:var(--cat);margin-bottom:2.4mm;display:flex;align-items:center;gap:1.6mm}
.row{display:flex;gap:3mm;align-items:flex-start;padding:1.6mm 0}
.row+.row{border-top:.25mm solid var(--tint-line)}
.row b{display:block}
.row span{color:var(--muted);font-size:9pt}
.row .num{flex:none;width:6mm;height:6mm;border-radius:50%;background:var(--deep);color:#fff;display:grid;place-items:center;font-size:8.4pt;font-weight:600}
.ico{width:4.6mm;height:4.6mm;flex:none;stroke:var(--cat);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ico.xs{width:3.6mm;height:3.6mm}
.ico.lg{width:7.6mm;height:7.6mm;padding:1.6mm;border-radius:50%;background:var(--soft);margin-top:-.4mm}
.ico.w{stroke:#fff;background:rgba(255,255,255,.14)}
ul.dots{list-style:none;display:grid;gap:1.8mm}
ul.dots li{padding-left:3.6mm;position:relative}
ul.dots li::before{content:"";position:absolute;left:0;top:1.9mm;width:1.3mm;height:1.3mm;border-radius:50%;background:var(--cat)}
h2{font-family:var(--display);font-weight:700;letter-spacing:-.02em;display:flex;align-items:baseline;gap:2.4mm}
h2.sec{font-size:11.5pt;margin-bottom:2.3mm}
h2.sec::before{content:"";width:1.1mm;height:4.2mm;border-radius:1mm;background:var(--cat);align-self:center}
h2.inter{font-size:14pt;margin:4.4mm 0 -1.6mm}
h2.inter .yr{color:var(--cat)}
h2.inter small{font-size:9.5pt;font-weight:500;color:var(--muted);letter-spacing:0;font-family:var(--sans)}
h3{font-weight:600;font-size:9.6pt;margin-bottom:.6mm}
.goal{background:var(--deep);color:#fff;border-radius:4.2mm;padding:4.4mm 5mm;display:grid;gap:2.4mm}
.goal.split{grid-template-columns:1fr 1.2fr;align-items:center;column-gap:5mm}
.goal .k{font-size:8pt;font-weight:600;color:color-mix(in srgb,var(--deep) 35%,white);margin-bottom:1.4mm}
.goal .steps,.goal .pillars{margin-top:.6mm}
.goal h3{font-family:var(--display);font-size:14pt;font-weight:700;letter-spacing:-.02em;line-height:1.15;margin:0}
.goal p{color:color-mix(in srgb,var(--deep) 18%,white);font-size:9pt;margin-top:1.8mm}
.goal p b{color:#fff}
.steps{display:grid;gap:2mm}
.steps div{background:rgba(255,255,255,.12);border-radius:3mm;padding:2.6mm;font-size:8.4pt;line-height:1.3;color:#e9e9ed}
.steps .n{display:block;font-size:12pt;font-weight:700;margin-bottom:.8mm;color:#fff}
.steps div b{color:#fff}
.pillars{display:grid;gap:2mm}
.pillar{display:flex;gap:2.6mm;align-items:flex-start;background:rgba(255,255,255,.12);border-radius:3mm;padding:2.6mm 3mm}
.pillar b{display:block;font-size:10pt;color:#fff}
.pillar span{font-size:8.6pt;color:#e9e9ed}
.pillar span b{display:inline;font-size:inherit}
.grid{display:grid;gap:2.7mm}
.card{background:var(--card);border-radius:4.2mm;padding:2.7mm 3.4mm;box-shadow:var(--shadow);display:flex;gap:2.6mm;align-items:flex-start;height:100%}
.card p{color:var(--muted);font-size:8.8pt;line-height:1.35}
.card p b{color:var(--ink)}
.card p.meta{font-size:8.4pt;margin-top:1.2mm}
.tag{display:inline-block;margin-top:1.4mm;font-size:7.6pt;font-weight:600;color:var(--cat);background:var(--soft);border-radius:10mm;padding:.4mm 2mm}
.next{padding:1.4mm 4.8mm}
.next .row{display:grid;grid-template-columns:32mm 1fr 30mm;gap:3mm;font-size:9pt}
.next .row span{color:var(--ink)}
.next .row+.row{border-top-color:var(--line)}
.next .when{text-align:right}
.next .row span.when{color:var(--muted)}
.next i{font-style:normal;color:var(--cat)}
.confirm{box-shadow:none;background:transparent;border:.3mm dashed color-mix(in srgb,var(--cat) 45%,white);font-size:9pt}
/* PDF de plusieurs pages : ne pas couper un bloc, ne pas laisser un titre seul en bas de page */
.panel,.goal,.card,.next .row{break-inside:avoid}
h2{break-after:avoid}
</style></head><body>
<svg width="0" height="0" style="position:absolute">
${iconSymbols()}
</svg>
<div class="page">
  <div class="halo"></div>
  <div class="head">
    <div class="brandrow"><div class="brand"><img src="data:image/png;base64,${logo}" alt="">GCC <span>Meeting</span></div><div class="date">Compte-rendu · ${escapeHtml(date)}</div></div>
    <div class="svcline"><i class="dot"></i>${plain(cat.label)} · ${plain(subtitle)}</div>
    <h1>${plain(cr.titre)}</h1>
    ${sub}
  </div>
  <div class="fit">
  ${top}
  <div class="body">
    ${blocks.map((b) => renderBlock(b)).join('\n    ')}
    ${confirm}
  </div>
  </div>
  <div class="foot"><span>${footLeft}</span><span>${escapeHtml(date)}</span></div>
</div>
</body></html>`;
}
