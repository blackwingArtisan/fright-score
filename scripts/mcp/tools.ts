import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { LocalDirector } from '../../src/director/local';
import { PATCHES, PATCH_IDS } from '../../src/engine/patches';
import { renderScore } from '../../src/engine/render';
import { scoreFromRequest } from '../../src/score/pipeline';
import { readScene } from '../../src/score/scene';
import { formatZodError, type Score } from '../../src/score/schema';
import { ComposeRequestSchema } from '../../src/server/compose';
import { encodeWav, parseWav } from '../../src/wav/wav';

/** What a tool handler returns. `isError` results go back to the calling model as text, not as protocol errors. */
export interface ToolResult {
  structured: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  run(args: unknown): Promise<ToolResult>;
}

const ScoreCueArgs = ComposeRequestSchema.extend({
  seed: z.number().int().min(0).max(0xffffffff).default(13),
  writeWavTo: z.string().min(1).optional(),
});

const errorResult = (message: string): ToolResult => ({ structured: { error: message }, isError: true });

/**
 * Where `writeWavTo` may write: a new `.wav` file inside the working directory. The path comes from an agent,
 * so it is checked before anything is rendered and again (with `wx`) when written.
 */
function checkWavPath(writeWavTo: string): { path: string } | { error: string } {
  const cwd = realpathSync(process.cwd());
  const path = resolve(cwd, writeWavTo);
  if (!path.toLowerCase().endsWith('.wav')) return { error: 'writeWavTo must end in .wav' };
  // Resolve symlinks on the nearest existing folder so a link cannot lead out of the working directory.
  let existing = dirname(path);
  while (!existsSync(existing)) existing = dirname(existing);
  const real = resolve(realpathSync(existing), relative(existing, dirname(path)), basename(path));
  const rel = relative(cwd, real);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return { error: 'writeWavTo must be inside the server working directory' };
  }
  if (existsSync(path)) return { error: `writeWavTo names a file that already exists: ${writeWavTo}` };
  return { path };
}

/** The time of the first stinger note at or after each sting cue, read from the realized score. */
function stingLandingSec(score: Score): number[] {
  const notes = score.tracks.filter((t) => t.role === 'stinger').flatMap((t) => t.notes);
  const landings: number[] = [];
  for (const cue of score.plan.cues) {
    if (cue.kind !== 'sting') continue;
    const times = notes.map((n) => n.atSec).filter((at) => at >= cue.atSec - 0.0005);
    if (times.length > 0) landings.push(Math.round(Math.min(...times) * 1000) / 1000);
  }
  return landings;
}

export const scoreCueTool: ToolDefinition = {
  name: 'score_cue',
  description:
    'Compose and render an original, royalty-free horror cue with the local director and the FS-666 FM chip. ' +
    'Returns the score plan, the second each sting lands, and the SHA-256 of the WAV (44.1 kHz, 16-bit, stereo). ' +
    'The same arguments always give the same hash. Pass writeWavTo (a new .wav path inside the working directory) to also save the file.',
  inputSchema: ScoreCueArgs,
  async run(args) {
    const parsed = ScoreCueArgs.safeParse(args ?? {});
    if (!parsed.success) return errorResult(formatZodError(parsed.error));
    const { seed, scene, mood, durationSec, writeWavTo } = parsed.data;
    let stingAtSec = parsed.data.stingAtSec;
    let target: string | undefined;
    if (writeWavTo !== undefined) {
      const checked = checkWavPath(writeWavTo);
      if ('error' in checked) return errorResult(checked.error);
      target = checked.path;
    }
    try {
      if (scene && !stingAtSec) {
        const found = readScene(scene).stingAtSec;
        if (found.length > 0) stingAtSec = found;
      }
      const request = {
        seed,
        ...(scene ? { scene } : {}),
        ...(mood ? { mood } : {}),
        ...(durationSec ? { durationSec } : {}),
        ...(stingAtSec ? { stingAtSec } : {}),
      };
      const score = await scoreFromRequest(new LocalDirector(), request);
      const wav = encodeWav(renderScore(score), { ditherSeed: seed ^ 0x5eed, loop: score.plan.loop === true });
      const structured: Record<string, unknown> = {
        director: 'local',
        seed,
        durationSec: parseWav(wav).durationSec,
        stingLandingSec: stingLandingSec(score),
        sha256: createHash('sha256').update(wav).digest('hex'),
        wavBytes: wav.byteLength,
        plan: score.plan,
      };
      if (target) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, wav, { flag: 'wx' });
        structured.wavPath = target;
      }
      return { structured };
    } catch (error) {
      return errorResult((error as Error).message);
    }
  },
};

const NoArgs = z.strictObject({});

export const listPatchesTool: ToolDefinition = {
  name: 'list_patches',
  description: 'List the FS-666 instruments (FM patches) a score plan can use: id, name, one-line description, algorithm and feedback.',
  inputSchema: NoArgs,
  async run(args) {
    const parsed = NoArgs.safeParse(args ?? {});
    if (!parsed.success) return errorResult(formatZodError(parsed.error));
    const patches = PATCH_IDS.map((id) => {
      const { name, blurb, algorithm, feedback } = PATCHES[id];
      return { id, name, blurb, algorithm, feedback };
    });
    return { structured: { patches } };
  },
};

export const TOOLS: ToolDefinition[] = [scoreCueTool, listPatchesTool];
