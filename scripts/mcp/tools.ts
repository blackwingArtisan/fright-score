import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { LocalDirector } from '../../src/director/local';
import { PATCHES, PATCH_IDS } from '../../src/engine/patches';
import { renderScore } from '../../src/engine/render';
import { scoreFromRequest } from '../../src/score/pipeline';
import { readScene } from '../../src/score/scene';
import { formatZodError } from '../../src/score/schema';
import { ComposeRequestSchema } from '../../src/server/compose';
import { encodeWav, parseWav } from '../../src/wav/wav';
import { ScoreLevelArgs, scoreLevel } from './level';
import { findOnsets, pairOnsets } from './onsets';
import { checkNewFile, checkReadablePath } from './paths';
import { stingLandingSec } from './sting';

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
      const checked = checkNewFile(writeWavTo);
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

export const scoreLevelTool: ToolDefinition = {
  name: 'score_level',
  description:
    'Score a whole game level with the local director and the FS-666 FM chip: for 1 to 8 rooms, one seamless loop per room ' +
    'and one 5 s sting file per event, each with its SHA-256, size, duration and, for stings, the second the hit lands ' +
    '(hitSec) and where to start playback so it lands 0.6 s later. The same arguments and seed always give the same hashes. ' +
    'Pass writeDir (a new folder inside the working directory) to also save the WAV files and a manifest.json.',
  inputSchema: ScoreLevelArgs,
  async run(args) {
    return scoreLevel(args);
  },
};

const VerifyCueArgs = z.strictObject({
  wavPath: z.string().min(1),
  expectedHitSec: z.array(z.number().min(0).max(300)).min(1).max(16),
  toleranceMs: z.number().min(1).max(1000).default(50),
});

export const verifyCueTool: ToolDefinition = {
  name: 'verify_cue',
  description:
    'Measure a rendered 16-bit PCM .wav file inside the working directory: find each onset that follows at least 0.5 s of ' +
    'silence and compare it with each expected hit time. Returns the measured second, the error in milliseconds and pass or fail ' +
    'for every expected time. Reads the file only; it writes nothing.',
  inputSchema: VerifyCueArgs,
  async run(args) {
    const parsed = VerifyCueArgs.safeParse(args ?? {});
    if (!parsed.success) return errorResult(formatZodError(parsed.error));
    const { wavPath, expectedHitSec, toleranceMs } = parsed.data;
    const checked = checkReadablePath(wavPath);
    if ('error' in checked) return errorResult(checked.error);
    let info: ReturnType<typeof parseWav>;
    try {
      info = parseWav(new Uint8Array(readFileSync(checked.path)));
    } catch (error) {
      return errorResult(`wavPath is not a 16-bit PCM WAV file: ${(error as Error).message}`);
    }
    if (info.channels < 1 || info.sampleRate < 1) return errorResult('wavPath is not a 16-bit PCM WAV file: bad format chunk');
    const results = pairOnsets(expectedHitSec, findOnsets(info)).map(({ expectedHitSec: expected, measuredSec }) => {
      if (measuredSec === null) return { expectedHitSec: expected, measuredSec: null, errorMs: null, pass: false };
      const errorMs = Math.round((measuredSec - expected) * 1000 * 1000) / 1000;
      return { expectedHitSec: expected, measuredSec, errorMs, pass: Math.abs(errorMs) <= toleranceMs };
    });
    return {
      structured: {
        wavPath: checked.path,
        durationSec: info.durationSec,
        toleranceMs,
        pass: results.every((r) => r.pass),
        results,
      },
    };
  },
};

export const TOOLS: ToolDefinition[] = [scoreCueTool, listPatchesTool, scoreLevelTool, verifyCueTool];
