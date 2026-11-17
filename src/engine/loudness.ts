import type { Mood } from '../score/schema';

/**
 * Integrated loudness in LUFS, following ITU-R BS.1770-4: K-weighting (a high shelf plus a
 * high-pass), 400 ms blocks with 75% overlap, an absolute gate at -70 LUFS and a relative gate
 * 10 LU below the ungated level. Left and right are weighted 1.0, as the standard specifies.
 */

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/*
 * The two K-weighting stages, designed for any sample rate with the bilinear transform.
 * At 48 kHz these reproduce the coefficients tabled in BS.1770 exactly.
 */

/** Stage 1: a +4 dB high shelf that models the acoustic effect of the head. */
function highShelf(sampleRate: number): Biquad {
  const f0 = 1681.974450955533;
  const gainDb = 3.999843853973347;
  const q = 0.7071752369554196;
  const k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k / q + k * k;
  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

/** Stage 2: the RLB high-pass near 38 Hz. */
function highPass(sampleRate: number): Biquad {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;
  const k = Math.tan((Math.PI * f0) / sampleRate);
  const a0 = 1 + k / q + k * k;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
}

/** The two K-weighting biquads (shelf, then high-pass) for a sample rate, normalized so a0 = 1. */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  return [highShelf(sampleRate), highPass(sampleRate)];
}

function filter(input: ArrayLike<number>, f: Biquad): Float64Array {
  const out = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

function kWeightedSquares(channel: Float32Array, sampleRate: number): Float64Array {
  const [shelf, highpass] = kWeighting(sampleRate);
  const stage2 = filter(filter(channel, shelf), highpass);
  for (let i = 0; i < stage2.length; i++) stage2[i] *= stage2[i];
  return stage2;
}

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = 10;

const toLufs = (power: number) => (power <= 0 ? -Infinity : -0.691 + 10 * Math.log10(power));

/** Integrated loudness of one or more channels in LUFS. Returns -Infinity for silence or audio shorter than one block. */
export function integratedLoudness(sampleRate: number, ...channels: Float32Array[]): number {
  const length = channels[0]?.length ?? 0;
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  if (length < block) return -Infinity;
  const squares = channels.map((ch) => kWeightedSquares(ch, sampleRate));
  // Prefix sums make every 400 ms block a constant-time lookup.
  const prefix = squares.map((sq) => {
    const p = new Float64Array(sq.length + 1);
    for (let i = 0; i < sq.length; i++) p[i + 1] = p[i] + sq[i];
    return p;
  });
  const powers: number[] = [];
  for (let start = 0; start + block <= length; start += step) {
    let sum = 0;
    for (const p of prefix) sum += (p[start + block] - p[start]) / block;
    powers.push(sum);
  }
  const aboveAbsolute = powers.filter((p) => toLufs(p) > ABSOLUTE_GATE_LUFS);
  if (aboveAbsolute.length === 0) return -Infinity;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const relativeGate = toLufs(mean(aboveAbsolute)) - RELATIVE_GATE_LU;
  const gated = aboveAbsolute.filter((p) => toLufs(p) > relativeGate);
  return toLufs(mean(gated));
}

/**
 * Loudness ceiling per mood, in LUFS. The master chain pushes every cue to the -1 dBTP peak
 * ceiling; dense moods would then come out much louder than sparse ones. Each mood is trimmed
 * down to its ceiling so a quiet lullaby stays quiet and a chase still hits hard. Gain is only
 * ever reduced, never raised, so the true-peak ceiling always holds.
 */
export const MOOD_LOUDNESS_LUFS: Record<Mood, number> = {
  dread: -16,
  stalker: -16,
  chase: -14,
  ritual: -15,
  lullaby: -18,
};
