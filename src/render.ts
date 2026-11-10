// Usage : npm run render -- exemples/musiciens.json
// Produit out/<nom>.pdf (A4) et out/<nom>.png (×2) à partir d'un compte-rendu JSON.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { CATEGORIES } from './categories.ts';
import { renderHtml } from './template.ts';
import type { CompteRendu } from './types.ts';

const A4_WIDTH_PX = 794; // 210 mm à 96 dpi
const A4_HEIGHT_PX = 1123; // 297 mm à 96 dpi

export function parseCompteRendu(raw: string): CompteRendu {
  const cr = JSON.parse(raw) as CompteRendu;
  if (!cr.titre) throw new Error('Le champ « titre » est obligatoire.');
  if (!cr.date) throw new Error('Le champ « date » est obligatoire.');
  if (cr.categorie && !CATEGORIES[cr.categorie]) {
    throw new Error(`Catégorie inconnue : « ${cr.categorie} ». Valeurs possibles : ${Object.keys(CATEGORIES).join(', ')}.`);
  }
  return cr;
}

export async function render(jsonPath: string, outDir = 'out'): Promise<{ pdf: string; png: string }> {
  if (!existsSync(jsonPath)) throw new Error(`Fichier introuvable : ${jsonPath}`);
  const cr = parseCompteRendu(readFileSync(jsonPath, 'utf-8'));
  const name = basename(jsonPath, extname(jsonPath));
  mkdirSync(outDir, { recursive: true });
  const pdf = join(outDir, `${name}.pdf`);
  const png = join(outDir, `${name}.png`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: A4_WIDTH_PX, height: A4_HEIGHT_PX },
      deviceScaleFactor: 2,
    });
    await page.setContent(renderHtml(cr), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const height = await page.evaluate(() => document.querySelector('.page')!.scrollHeight);
    if (height > A4_HEIGHT_PX + 1) {
      console.warn(`Attention : le compte-rendu dépasse une page A4 (${height} px pour ${A4_HEIGHT_PX}).`);
    }

    await page.screenshot({ path: png, fullPage: true });
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
  return { pdf, png };
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
