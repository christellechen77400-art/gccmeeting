// Transcription d'un fichier audio avec Groq (whisper-large-v3-turbo, français).
// Fichier trop gros pour Groq : compressé avec ffmpeg (mono, 16 kHz, 32 kbit/s), puis découpé si besoin.

import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

export const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.webm', '.mp4', '.ogg'];
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
const MAX_BYTES = 25 * 1024 * 1024; // pièce jointe acceptée par Groq (offre gratuite)
const PART_MARGIN = 0.9; // morceaux un peu plus petits que la limite (le débit varie)

const run = promisify(execFile);

async function ffmpeg(args: string[]): Promise<void> {
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('ffmpeg est introuvable : il sert à compresser les fichiers audio trop gros pour Groq. Installe-le avec : brew install ffmpeg');
    }
    throw new Error(`Erreur ffmpeg : ${(err as { stderr?: string }).stderr?.trim() || (err as Error).message}`);
  }
}

async function durationSeconds(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

// Renvoie le ou les fichiers à envoyer à Groq, chacun sous `maxBytes` (fichiers de travail dans `dir`).
export async function prepareAudio(file: string, dir: string, maxBytes = MAX_BYTES): Promise<string[]> {
  if (statSync(file).size <= maxBytes) return [file];

  const compressed = join(dir, 'compresse.mp3');
  await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', compressed]);
  const size = statSync(compressed).size;
  console.log(`Audio compressé : ${(statSync(file).size / 1e6).toFixed(1)} Mo → ${(size / 1e6).toFixed(1)} Mo.`);
  if (size <= maxBytes) return [compressed];

  const parts = Math.ceil(size / (maxBytes * PART_MARGIN));
  const seconds = Math.ceil((await durationSeconds(compressed)) / parts);
  await ffmpeg(['-i', compressed, '-f', 'segment', '-segment_time', String(seconds), '-c', 'copy', join(dir, 'morceau-%03d.mp3')]);
  const files = readdirSync(dir).filter((f) => f.startsWith('morceau-')).sort().map((f) => join(dir, f));
  console.log(`Audio découpé en ${files.length} morceaux d'environ ${Math.round(seconds / 60)} min.`);
  return files;
}

async function transcribePart(file: string, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)]), basename(file));
  form.append('model', MODEL);
  form.append('language', 'fr');
  form.append('response_format', 'json');
  const response = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  if (response.status === 401) throw new Error('Clé Groq refusée : vérifie GROQ_API_KEY dans .env.');
  if (!response.ok) throw new Error(`Erreur de transcription Groq (${response.status}) : ${await response.text()}`);
  return ((await response.json()) as { text: string }).text.trim();
}

// Texte brut de l'enregistrement ; les morceaux éventuels sont recollés dans l'ordre.
export async function transcribe(file: string, maxBytes = MAX_BYTES): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Clé Groq manquante : renseigne GROQ_API_KEY dans le fichier .env (modèle : .env.example).');
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-audio-'));
  try {
    const texts: string[] = [];
    for (const part of await prepareAudio(file, dir, maxBytes)) texts.push(await transcribePart(part, apiKey));
    return texts.join(' ').trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
