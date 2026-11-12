import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareAudio } from '../src/transcribe.ts';

// 3 minutes de son synthétique en WAV (≈ 5,8 Mo) : sans appel à Groq.
function makeWav(dir: string): string {
  const file = join(dir, 'son.wav');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=180', '-ar', '16000', file]);
  return file;
}

test('audio sous la limite : envoyé tel quel', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-test-'));
  const wav = makeWav(dir);
  assert.deepEqual(await prepareAudio(wav, dir), [wav]);
});

test('audio trop gros : compressé (mono, 16 kHz, 32 kbit/s), sinon découpé en morceaux sous la limite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gccmeeting-test-'));
  const wav = makeWav(dir);
  const compressed = await prepareAudio(wav, dir, 1_000_000); // 3 min à 32 kbit/s ≈ 0,7 Mo
  assert.equal(compressed.length, 1);
  assert.ok(compressed[0].endsWith('compresse.mp3') && statSync(compressed[0]).size <= 1_000_000);

  const parts = await prepareAudio(wav, mkdtempSync(join(tmpdir(), 'gccmeeting-test-')), 300_000);
  assert.ok(parts.length >= 3, `${parts.length} morceaux`);
  for (const part of parts) assert.ok(statSync(part).size <= 300_000, `${part} : ${statSync(part).size} octets`);
});
