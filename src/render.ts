// Usage : npm run render -- exemples/musiciens.json
// Produit out/<nom>.pdf (A4) et out/<nom>.png (×2) à partir d'un compte-rendu JSON.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import { CATEGORIES } from './categories.ts';
import { renderHtml } from './template.ts';
import type { CompteRendu } from './types.ts';

const A4_WIDTH_PX = 794; // 210 mm à 96 dpi
const A4_HEIGHT_PX = 1123; // 297 mm à 96 dpi
// Réduction du contenu (texte et espacements) par pas de 2,5 % pour tenir sur une page.
// Minimum 80 % : texte des cartes à 7,7 pt, petites capitales jamais sous 6 pt (voir .fit dans template.ts).
const FIT_SCALES = [1, 0.975, 0.95, 0.925, 0.9, 0.875, 0.85, 0.825, 0.8];

export function parseCompteRendu(raw: string): CompteRendu {
  const cr = JSON.parse(raw) as CompteRendu;
  if (!cr.titre) throw new Error('Le champ « titre » est obligatoire.');
  if (!cr.date) throw new Error('Le champ « date » est obligatoire.');
  if (cr.categorie && !CATEGORIES[cr.categorie]) {
    throw new Error(`Catégorie inconnue : « ${cr.categorie} ». Valeurs possibles : ${Object.keys(CATEGORIES).join(', ')}.`);
  }
  return cr;
}

// Essaie des tailles de plus en plus petites ; renvoie celle qui tient sur une page,
// ou 0 (taille normale remise) si même la plus petite dépasse, avec la hauteur à cette plus petite taille.
async function fitToOnePage(page: Page): Promise<{ scale: number; height: number }> {
  let height = 0;
  for (const scale of FIT_SCALES) {
    height = await page.evaluate((k) => {
      document.documentElement.style.setProperty('--fit', String(k));
      return document.querySelector('.page')!.scrollHeight;
    }, scale);
    if (height <= A4_HEIGHT_PX + 1) return { scale, height };
  }
  await page.evaluate(() => document.documentElement.style.removeProperty('--fit'));
  return { scale: 0, height };
}

// `overflow` : de combien (en %) le compte-rendu dépasse une page même réduit au minimum ; 0 s'il tient.
export async function render(jsonPath: string, outDir = 'out'): Promise<{ pdf: string; png: string; overflow: number }> {
  if (!existsSync(jsonPath)) throw new Error(`Fichier introuvable : ${jsonPath}`);
  const cr = parseCompteRendu(readFileSync(jsonPath, 'utf-8'));
  const name = basename(jsonPath, extname(jsonPath));
  mkdirSync(outDir, { recursive: true });
  const pdf = join(outDir, `${name}.pdf`);
  const png = join(outDir, `${name}.png`);

  let overflow = 0;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: A4_WIDTH_PX, height: A4_HEIGHT_PX },
      deviceScaleFactor: 2,
    });
    await page.setContent(renderHtml(cr), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const fit = await fitToOnePage(page);
    if (fit.scale && fit.scale < 1) console.log(`Réduit à ${Math.round(fit.scale * 100)} % pour tenir sur une page.`);
    if (!fit.scale) {
      overflow = Math.ceil((fit.height / A4_HEIGHT_PX - 1) * 100);
      console.warn(`Attention : le compte-rendu dépasse une page de ${overflow} %, même réduit à ${Math.round(FIT_SCALES.at(-1)! * 100)} % : PDF sur 2 pages.`);
    }

    // PNG : toujours une seule image en hauteur, sans coupure de page.
    await page.screenshot({ path: png, fullPage: true });
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
  return { pdf, png, overflow };
}

// Lancé directement (npm run render), pas importé par un autre script.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Usage : npm run render -- <fichier.json>');
    process.exit(1);
  }
  render(jsonPath)
    .then(({ pdf, png }) => console.log(`PDF : ${pdf}\nPNG : ${png}`))
    .catch((err: Error) => {
      console.error(`Erreur : ${err.message}`);
      process.exit(1);
    });
}
