import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

/** The largest WAV `verify_cue` reads: a five-minute stereo file is about 53 MB. */
export const MAX_READ_BYTES = 64 * 1024 * 1024;

type Checked = { path: string } | { error: string };

/** Resolves a not-yet-existing path against the real working folder, following links on its nearest existing ancestor. */
function resolveNew(target: string): { cwd: string; path: string; real: string } {
  const cwd = realpathSync(process.cwd());
  const path = resolve(cwd, target);
  let existing = dirname(path);
  while (!existsSync(existing)) existing = dirname(existing);
  const real = resolve(realpathSync(existing), relative(existing, dirname(path)), basename(path));
  return { cwd, path, real };
}

const isOutside = (cwd: string, real: string): boolean => {
  const rel = relative(cwd, real);
  return rel === '' || rel.startsWith('..') || isAbsolute(rel);
};

/**
 * Where `writeWavTo` may write: a new `.wav` file inside the working directory. The path comes from an agent,
 * so it is checked before anything is rendered and again (with `wx`) when written.
 */
export function checkNewFile(writeWavTo: string): Checked {
  const { cwd, path, real } = resolveNew(writeWavTo);
  if (!path.toLowerCase().endsWith('.wav')) return { error: 'writeWavTo must end in .wav' };
  if (isOutside(cwd, real)) return { error: 'writeWavTo must be inside the server working directory' };
  if (existsSync(path)) return { error: `writeWavTo names a file that already exists: ${writeWavTo}` };
  return { path };
}

/** Where `writeDir` may write: a folder that does not exist yet, inside the working directory and not the directory itself. */
export function checkNewDir(writeDir: string): Checked {
  const { cwd, path, real } = resolveNew(writeDir);
  if (isOutside(cwd, real)) return { error: 'writeDir must be a new folder inside the server working directory' };
  if (existsSync(path)) return { error: `writeDir names a folder that already exists: ${writeDir}` };
  return { path: real };
}

/** A `.wav` file that exists inside the working directory (links resolved) and is at most 64 MB. */
export function checkReadablePath(wavPath: string): Checked {
  const cwd = realpathSync(process.cwd());
  const path = resolve(cwd, wavPath);
  if (!path.toLowerCase().endsWith('.wav')) return { error: 'wavPath must end in .wav' };
  if (!existsSync(path)) return { error: `wavPath does not exist: ${wavPath}` };
  const real = realpathSync(path);
  if (isOutside(cwd, real)) return { error: 'wavPath must be inside the server working directory' };
  if (!real.toLowerCase().endsWith('.wav')) return { error: 'wavPath must end in .wav' };
  const stat = statSync(real);
  if (!stat.isFile()) return { error: `wavPath is not a file: ${wavPath}` };
  if (stat.size > MAX_READ_BYTES) return { error: `wavPath is larger than ${MAX_READ_BYTES / (1024 * 1024)} MB` };
  return { path: real };
}
