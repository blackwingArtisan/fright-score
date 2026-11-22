import type { EnvelopeParams } from './envelope';
import type { OperatorParams } from './operator';

export interface PatchLfo {
  rateHz: number;
  /** Vibrato depth in cents. */
  vibratoCents: number;
  /** Tremolo depth 0..1. */
  tremolo: number;
}

/** An FM instrument: an algorithm, operator 1 feedback, four operators and an LFO. */
export interface Patch {
  id: PatchId;
  name: string;
  blurb: string;
  algorithm: number;
  /** Operator 1 self-feedback, 0-7. */
  feedback: number;
  ops: [OperatorParams, OperatorParams, OperatorParams, OperatorParams];
  lfo: PatchLfo;
  /** Overall patch loudness trim. */
  gain: number;
}

export const PATCH_IDS = [
  'grave-drone',
  'wraith-pad',
  'heartbeat',
  'tritone-brass',
  'music-box',
  'glass-bell',
  'crypt-bass',
  'screech',
  'ritual-drum',
  'choir-organ',
  'theremin-lead',
] as const;

export type PatchId = (typeof PATCH_IDS)[number];

function env(attackSec: number, decaySec: number, sustain: number, sustainDecaySec: number, releaseSec: number): EnvelopeParams {
  return { attackSec, decaySec, sustain, sustainDecaySec, releaseSec };
}

function op(ratio: number, level: number, envelope: EnvelopeParams, detuneCents = 0, fixedHz?: number): OperatorParams {
  return fixedHz === undefined
    ? { ratio, level, env: envelope, detuneCents }
    : { ratio, level, env: envelope, detuneCents, fixedHz };
}

const NO_LFO: PatchLfo = { rateHz: 0.1, vibratoCents: 0, tremolo: 0 };

export const PATCHES: Record<PatchId, Patch> = {
  'grave-drone': {
    id: 'grave-drone',
    name: 'Grave Drone',
    blurb: 'Two detuned organ pairs that breathe slowly. The floor of every cue.',
    algorithm: 4,
    feedback: 3,
    ops: [
      op(1, 0.32, env(2.5, 4, 0.6, 0, 3)),
      op(1, 0.8, env(2.2, 3, 0.85, 0, 3.2)),
      op(2.003, 0.18, env(3, 5, 0.5, 0, 3)),
      op(1, 0.6, env(2.8, 3, 0.8, 0, 3.4), 7),
    ],
    lfo: { rateHz: 0.17, vibratoCents: 6, tremolo: 0.18 },
    gain: 0.5,
  },
  'wraith-pad': {
    id: 'wraith-pad',
    name: 'Wraith Pad',
    blurb: 'A breathy, high pad: one noisy modulator feeding three detuned carriers.',
    algorithm: 5,
    feedback: 5,
    ops: [
      op(3, 0.12, env(2, 3, 0.7, 0, 2.5)),
      op(1, 0.5, env(1.8, 2, 0.8, 0, 3)),
      op(2.002, 0.3, env(2.2, 2, 0.7, 0, 3), -9),
      op(0.998, 0.4, env(2.4, 2, 0.8, 0, 3), 11),
    ],
    lfo: { rateHz: 0.31, vibratoCents: 9, tremolo: 0.3 },
    gain: 0.42,
  },
  heartbeat: {
    id: 'heartbeat',
    name: 'Heartbeat',
    blurb: 'A soft, low thump with a falling pitch. Lub-dub.',
    algorithm: 7,
    feedback: 0,
    ops: [
      op(1, 0.9, env(0.002, 0.22, 0, 0, 0.12)),
      op(0.5, 0.55, env(0.003, 0.3, 0, 0, 0.15)),
      op(2, 0.22, env(0.001, 0.07, 0, 0, 0.05)),
      op(3.01, 0.06, env(0.001, 0.04, 0, 0, 0.03)),
    ],
    lfo: NO_LFO,
    gain: 0.95,
  },
  'tritone-brass': {
    id: 'tritone-brass',
    name: 'Tritone Brass',
    blurb: 'A snarling feedback brass stab for stingers and hits.',
    algorithm: 3,
    feedback: 6,
    ops: [
      op(1, 0.42, env(0.004, 0.6, 0.35, 0, 1.2)),
      op(1, 0.55, env(0.006, 0.9, 0.4, 0, 1.2)),
      op(3, 0.28, env(0.003, 0.3, 0.1, 0, 0.8)),
      op(1, 0.9, env(0.004, 1.4, 0.4, 6, 1.6)),
    ],
    lfo: { rateHz: 5.5, vibratoCents: 4, tremolo: 0 },
    gain: 0.6,
  },
  'music-box': {
    id: 'music-box',
    name: 'Music Box',
    blurb: 'A warped little tine, slightly out of tune, like a toy left in the attic.',
    algorithm: 4,
    feedback: 0,
    ops: [
      op(3.5, 0.28, env(0.001, 0.5, 0, 0, 0.4)),
      op(1, 0.7, env(0.001, 1.8, 0, 0, 1.4)),
      op(7, 0.14, env(0.001, 0.25, 0, 0, 0.2)),
      op(2, 0.3, env(0.001, 0.9, 0, 0, 0.8), 3),
    ],
    lfo: { rateHz: 4.6, vibratoCents: 14, tremolo: 0.04 },
    gain: 0.5,
  },
  'glass-bell': {
    id: 'glass-bell',
    name: 'Glass Bell',
    blurb: 'An inharmonic bell built on the square root of two. Cold and ringing.',
    algorithm: 4,
    feedback: 0,
    ops: [
      op(1.414, 0.45, env(0.001, 2.4, 0, 0, 2)),
      op(1, 0.6, env(0.001, 3.2, 0, 0, 3)),
      op(3.73, 0.25, env(0.001, 1.2, 0, 0, 1)),
      op(4, 0.22, env(0.001, 1.6, 0, 0, 1.5), -5),
    ],
    lfo: { rateHz: 0.9, vibratoCents: 3, tremolo: 0.1 },
    gain: 0.42,
  },
  'crypt-bass': {
    id: 'crypt-bass',
    name: 'Crypt Bass',
    blurb: 'A growling four-stack bass for ostinatos and the two-note shark figure.',
    algorithm: 0,
    feedback: 4,
    ops: [
      op(1, 0.22, env(0.003, 0.3, 0.3, 0, 0.2)),
      op(1, 0.24, env(0.003, 0.4, 0.4, 0, 0.2)),
      op(0.5, 0.2, env(0.003, 0.5, 0.5, 0, 0.2)),
      op(1, 0.95, env(0.004, 0.6, 0.6, 4, 0.25)),
    ],
    lfo: NO_LFO,
    gain: 0.62,
  },
  screech: {
    id: 'screech',
    name: 'Screech',
    blurb: 'Bowed-metal noise from maxed feedback. Strings scraping in the dark.',
    algorithm: 0,
    feedback: 7,
    ops: [
      op(1, 0.35, env(0.8, 2, 0.6, 0, 1.5)),
      op(7.1, 0.22, env(1, 2, 0.6, 0, 1.5)),
      op(1.5, 0.2, env(0.9, 2, 0.7, 0, 1.5)),
      op(1, 0.7, env(0.6, 1.5, 0.75, 0, 1.6)),
    ],
    lfo: { rateHz: 6.8, vibratoCents: 38, tremolo: 0.35 },
    gain: 0.3,
  },
  'ritual-drum': {
    id: 'ritual-drum',
    name: 'Ritual Drum',
    blurb: 'A deep skin tom with a noisy stick attack.',
    algorithm: 4,
    feedback: 7,
    ops: [
      op(1.6, 0.4, env(0.001, 0.06, 0, 0, 0.05)),
      op(1, 0.95, env(0.001, 0.55, 0, 0, 0.3)),
      op(1, 0.5, env(0.001, 0.05, 0, 0, 0.04), 0, 1800),
      op(1, 0.22, env(0.001, 0.09, 0, 0, 0.06), 0, 2400),
    ],
    lfo: NO_LFO,
    gain: 0.85,
  },
  'choir-organ': {
    id: 'choir-organ',
    name: 'Choir Organ',
    blurb: 'Four sine partials in parallel with a slow vibrato. Monks in a cold chapel.',
    algorithm: 7,
    feedback: 1,
    ops: [
      op(1, 0.5, env(0.9, 2, 0.8, 0, 2)),
      op(2, 0.24, env(1.1, 2, 0.7, 0, 2), 4),
      op(3, 0.12, env(1.3, 2, 0.6, 0, 2), -3),
      op(4, 0.07, env(1.5, 2, 0.5, 0, 2), 6),
    ],
    lfo: { rateHz: 4.8, vibratoCents: 11, tremolo: 0.06 },
    gain: 0.45,
  },
  'theremin-lead': {
    id: 'theremin-lead',
    name: 'Theremin Lead',
    blurb: 'A near-pure sine that wavers on a wide, slow vibrato, with a detuned twin. A hand shaking in the air.',
    algorithm: 4,
    feedback: 1,
    ops: [
      // Pair one: a faint same-pitch modulator warms the first carrier, which sits a few cents flat.
      op(1, 0.03, env(0.35, 0.8, 0.92, 0, 0.7)),
      op(1, 0.8, env(0.3, 0.8, 0.92, 0, 0.7), -4),
      // Pair two: a faint octave modulator gives the twin carrier a thin edge; it sits a few cents sharp.
      op(2, 0.025, env(0.4, 0.8, 0.9, 0, 0.8)),
      op(1, 0.18, env(0.38, 0.8, 0.9, 0, 0.8), 4),
    ],
    lfo: { rateHz: 3.6, vibratoCents: 40, tremolo: 0.05 },
    gain: 0.45,
  },
};

export function getPatch(id: PatchId): Patch {
  const patch = PATCHES[id];
  if (!patch) throw new Error(`Unknown patch "${id}"`);
  return patch;
}

/** Longest release among a patch's operators, used to size note tails. */
export function maxReleaseSec(patch: Patch): number {
  return Math.max(...patch.ops.map((o) => o.env.releaseSec));
}
