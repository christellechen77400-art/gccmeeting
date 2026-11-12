// Extraction du texte d'un fichier de notes : .txt, .md, .pdf, .docx.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'];

export async function extractTextFromFile(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  let text: string;
  switch (ext) {
    case '.txt':
    case '.md':
      text = readFileSync(path, 'utf-8');
      break;
    case '.pdf': {
      const { text: pages } = await extractText(new Uint8Array(readFileSync(path)));
      text = pages.join('\n\n');
      break;
    }
    case '.docx':
      text = (await mammoth.extractRawText({ path })).value;
      break;
    default:
      throw new Error(`Format non pris en charge : « ${ext || 'sans extension'} ». Formats acceptés : ${SUPPORTED_EXTENSIONS.join(', ')}.`);
  }
  text = text.trim();
  if (!text) throw new Error(`Aucun texte trouvé dans ${path} (fichier vide ou PDF scanné ?).`);
  return text;
}
