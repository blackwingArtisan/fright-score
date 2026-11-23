import cueScript from '../../examples/godot/addons/fright_score/fright_score_cue.gd?raw';
import cueScriptUid from '../../examples/godot/addons/fright_score/fright_score_cue.gd.uid?raw';
import pluginCfg from '../../examples/godot/addons/fright_score/plugin.cfg?raw';
import pluginScript from '../../examples/godot/addons/fright_score/plugin.gd?raw';
import pluginScriptUid from '../../examples/godot/addons/fright_score/plugin.gd.uid?raw';
import { arrange } from '../score/arranger';
import { reconcilePlan, type CueRequest } from '../score/composer';
import type { PlanSource } from '../score/pipeline';
import { hashString } from '../score/rng';
import { parseScorePlan, type Score } from '../score/schema';
import { writeZip, type ZipEntry } from './zip';

/** The Godot add-on, as the repository ships it in `examples/godot/addons/fright_score/`. */
export const GODOT_ADDON_FILES: readonly ZipEntry[] = [
  { name: 'addons/fright_score/fright_score_cue.gd', data: cueScript },
  { name: 'addons/fright_score/fright_score_cue.gd.uid', data: cueScriptUid },
  { name: 'addons/fright_score/plugin.cfg', data: pluginCfg },
  { name: 'addons/fright_score/plugin.gd', data: pluginScript },
  { name: 'addons/fright_score/plugin.gd.uid', data: pluginScriptUid },
];

/** Shortest and longest loop in the pack, in seconds. */
export const GODOT_LOOP_MIN_SEC = 8;
export const GODOT_LOOP_MAX_SEC = 16;
/** Length of the sting file and the second its hit sits at, matching the add-on's `sting_hit_sec` default. */
export const GODOT_STING_FILE_SEC = 5;
export const GODOT_STING_HIT_SEC = 1;
/** Silence the arranger clears before every sting, matching the add-on's `pre_silence_sec` default. */
export const GODOT_PRE_SILENCE_SEC = 0.6;

/** A 32-bit seed for one file of the pack, from the cue's seed and the part (`loop` or `sting`). */
export function godotFileSeed(cueSeed: number, part: 'loop' | 'sting'): number {
  return (hashString(`godot-${part}`) ^ Math.imul(cueSeed >>> 0, 0x9e3779b1)) >>> 0;
}

/** The request for the pack's loop: the cue's mood and seed, whole bars, no fades. */
export function godotLoopRequest(score: Score): CueRequest {
  const durationSec = Math.min(GODOT_LOOP_MAX_SEC, Math.max(GODOT_LOOP_MIN_SEC, Math.round(score.durationSec)));
  return { seed: godotFileSeed(score.seed, 'loop'), mood: score.plan.mood, durationSec, loop: true };
}

/** The request for the pack's sting: the cue's mood, a short cue with the hit at `GODOT_STING_HIT_SEC`. */
export function godotStingRequest(score: Score): CueRequest {
  return { seed: godotFileSeed(score.seed, 'sting'), mood: score.plan.mood, durationSec: GODOT_STING_FILE_SEC, stingAtSec: [GODOT_STING_HIT_SEC] };
}

/**
 * The score of the sting file. Everything before the hit is cleared, so the file is quiet until the hit and
 * the add-on can start it `GODOT_PRE_SILENCE_SEC` ahead of the event. The same rule as the `score_level` tool.
 */
export async function godotStingScore(director: PlanSource, score: Score): Promise<Score> {
  const request = godotStingRequest(score);
  const reconciled = reconcilePlan(await director.plan(request), request);
  const cues = [
    { atSec: 0, kind: 'silence' as const, lengthSec: GODOT_STING_HIT_SEC },
    ...reconciled.cues.filter((c) => !(c.kind === 'silence' && c.atSec < GODOT_STING_HIT_SEC) && !(c.kind === 'hit' && c.atSec < GODOT_STING_HIT_SEC)),
  ];
  return arrange(parseScorePlan({ ...reconciled, cues }), request.seed);
}

/** The second the hit of a sting score lands: its first stinger note at or after the sting cue. */
export function godotHitSec(stingScore: Score): number | undefined {
  const notes = stingScore.tracks.filter((t) => t.role === 'stinger').flatMap((t) => t.notes);
  const sting = stingScore.plan.cues.find((c) => c.kind === 'sting');
  if (!sting) return undefined;
  const times = notes.map((n) => n.atSec).filter((at) => at >= sting.atSec - 0.0005);
  return times.length > 0 ? Math.round(Math.min(...times) * 1000) / 1000 : undefined;
}

/** File-name base for the pack: lower-case words of the cue title, then the seed. */
export function godotBaseName(score: Score): string {
  const words = score.plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `${words || 'cue'}-seed${score.seed}`;
}

export function godotZipName(score: Score): string {
  return `fright-score-godot-${godotBaseName(score)}.zip`;
}

/** The README.txt of the pack. */
export function godotReadme(score: Score, files: { loop: string; sting: string; loopSec: number }): string {
  return [
    'Fright Score for Godot 4',
    '========================',
    '',
    `Cue: ${score.plan.title} (${score.plan.mood}, seed ${score.seed})`,
    '',
    'Setup, two lines:',
    '1. Unzip this file into your Godot project folder, the one that holds project.godot.',
    `2. Add a FrightScoreCue node, set Loop to ${files.loop} and Sting to ${files.sting}, then call scare() from your game event.`,
    '',
    'What is in the zip:',
    '- addons/fright_score/: the FrightScoreCue node. It works as a plain script, so enabling the plugin is optional.',
    `- ${files.loop}: a ${files.loopSec} second seamless loop with loop points in the WAV. Godot reads them on import.`,
    `- ${files.sting}: a ${GODOT_STING_FILE_SEC} second sting with the hit at ${GODOT_STING_HIT_SEC} second, quiet before it.`,
    '',
    `The node's defaults already match the sting: Sting Hit Sec ${GODOT_STING_HIT_SEC}, Pre Silence Sec ${GODOT_PRE_SILENCE_SEC}. When scare() runs, the loop`,
    `cuts to silence and the hit lands ${GODOT_PRE_SILENCE_SEC} seconds later, out of the quiet.`,
    '',
    'Both WAVs are 44.1 kHz, 16-bit, stereo. Fright Score wrote the notes and its FS-666 chip, an emulated FM synthesizer,',
    'made every sound. Nothing is sampled from existing music.',
    '',
    'A stock site charges about $18-48 for this. Yours, royalty-free.',
    '',
    'The same cue and seed always give the same files, byte for byte.',
    '',
  ].join('\n');
}

export interface GodotPackInput {
  score: Score;
  loopWav: Uint8Array;
  stingWav: Uint8Array;
  loopSec: number;
}

/** The whole pack as one store-only zip: add-on, both WAVs and README.txt. */
export function buildGodotZip({ score, loopWav, stingWav, loopSec }: GodotPackInput): Uint8Array {
  const base = godotBaseName(score);
  const loop = `fright_score/${base}-loop.wav`;
  const sting = `fright_score/${base}-sting.wav`;
  return writeZip([
    ...GODOT_ADDON_FILES,
    { name: loop, data: loopWav },
    { name: sting, data: stingWav },
    { name: 'README.txt', data: godotReadme(score, { loop, sting, loopSec }) },
  ]);
}
