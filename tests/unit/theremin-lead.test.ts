import { describe, expect, it } from 'vitest';
import { PATCHES, PATCH_IDS, type Patch } from '../../src/engine/patches';
import { Voice } from '../../src/engine/voice';
import { ymPatch } from '../../src/export/vgm';

const SR = 44_100;
const patch = PATCHES['theremin-lead'];
/** Samples in one vibrato cycle (3.6 Hz divides 44,100 exactly). */
const LFO_PERIOD = SR / patch.lfo.rateHz;
const A4 = { midi: 69, velocity: 1 } as const;

function render(p: Patch, seconds: number): Float32Array {
  const v = new Voice(p, A4, SR);
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = v.tick();
  return out;
}

function rms(x: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
}

/** Positions (in samples, linearly interpolated) where the signal crosses zero going up. */
function upwardCrossings(x: Float32Array, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(1, from); i < to; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) out.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]));
  }
  return out;
}

const centsOf = (hz: number, refHz: number) => 1200 * Math.log2(hz / refHz);

/** Pitch of each cycle in cents relative to 440 Hz. */
function pitchContourCents(x: Float32Array, from: number, to: number): number[] {
  const c = upwardCrossings(x, from, to);
  const out: number[] = [];
  for (let i = 1; i < c.length; i++) out.push(centsOf(SR / (c[i] - c[i - 1]), 440));
  return out;
}

describe('theremin-lead patch', () => {
  it('is the last patch in the library and is described like the others', () => {
    expect(PATCH_IDS[PATCH_IDS.length - 1]).toBe('theremin-lead');
    expect(patch.id).toBe('theremin-lead');
    expect(patch.name).toBe('Theremin Lead');
    expect(patch.blurb.length).toBeGreaterThan(20);
    expect(patch.blurb).not.toContain('\n');
  });

  it('has a soft attack and holds its sustain', () => {
    const v = new Voice(patch, A4, SR);
    const carrier = v.ops[1].env;
    const x = new Float32Array(6 * SR);
    let levelAt100ms = 0;
    for (let i = 0; i < x.length; i++) {
      x[i] = v.tick();
      if (i === Math.round(0.1 * SR)) levelAt100ms = carrier.level;
    }
    // Soft attack: a tenth of a second in, the carrier is still rising and well below full scale.
    expect(levelAt100ms).toBeGreaterThan(0.1);
    expect(levelAt100ms).toBeLessThan(0.5);
    expect(rms(x, 0, Math.round(0.01 * SR))).toBeLessThan(0.1 * rms(x, 2 * SR, 3 * SR));
    // Sustain: the stage stays 'sustain' and the level does not fall for seconds.
    expect(carrier.stage).toBe('sustain');
    expect(carrier.level).toBeCloseTo(0.92, 5);
    const early = rms(x, 2 * SR, 3 * SR);
    const late = rms(x, 5 * SR, 6 * SR);
    expect(Math.abs(20 * Math.log10(late / early))).toBeLessThan(2);
    // Release is a slow fade, not a click.
    v.noteOff();
    let ticks = 0;
    while (v.active && ticks < 10 * SR) {
      v.tick();
      ticks++;
    }
    expect(ticks).toBeGreaterThan(0.5 * SR);
    expect(ticks).toBeLessThan(6 * SR);
  });

  it('peaks at a sensible level without clipping, quieter than a full-scale sine', () => {
    const x = render(patch, 5);
    let peak = 0;
    for (const s of x) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThan(0.7);
  });

  it('plays A4 at 440 Hz within five cents', () => {
    const x = render(patch, 4);
    // Whole vibrato cycles, so the vibrato averages out: from 2 cycles in, for 8 cycles.
    const from = 2 * LFO_PERIOD;
    const to = 10 * LFO_PERIOD;
    const c = upwardCrossings(x, from, to);
    const hz = ((c.length - 1) * SR) / (c[c.length - 1] - c[0]);
    expect(Math.abs(centsOf(hz, 440))).toBeLessThan(5);
  });

  it('has a vibrato: the pitch swings about 80 cents peak to peak at the LFO rate', () => {
    const x = render(patch, 4);
    const from = 2 * LFO_PERIOD;
    const to = 10 * LFO_PERIOD;
    const contour = pitchContourCents(x, from, to);
    const swing = Math.max(...contour) - Math.min(...contour);
    expect(swing).toBeGreaterThan(60);
    expect(swing).toBeLessThan(100);
    // The contour crosses its mean upward once per vibrato cycle: 8 cycles, 8 crossings (one either way).
    const mean = contour.reduce((a, b) => a + b, 0) / contour.length;
    let up = 0;
    for (let i = 1; i < contour.length; i++) if (contour[i - 1] < mean && contour[i] >= mean) up++;
    expect(up).toBeGreaterThanOrEqual(7);
    expect(up).toBeLessThanOrEqual(9);
  });

  it('holds a steady pitch when the vibrato is switched off, so the swing is the LFO and nothing else', () => {
    const still: Patch = { ...patch, lfo: { ...patch.lfo, vibratoCents: 0 } };
    const x = render(still, 4);
    const contour = pitchContourCents(x, 2 * LFO_PERIOD, 10 * LFO_PERIOD);
    expect(Math.max(...contour) - Math.min(...contour)).toBeLessThan(10);
  });

  it('is nearly a sine: little energy above the fundamental', () => {
    const x = render({ ...patch, lfo: { ...patch.lfo, vibratoCents: 0, tremolo: 0 } }, 3);
    // A 3rd harmonic probe at 1320 Hz against the fundamental at 440 Hz (Goertzel-style correlation).
    const probe = (hz: number) => {
      let re = 0;
      let im = 0;
      for (let i = 2 * SR; i < 3 * SR; i++) {
        re += x[i] * Math.cos((2 * Math.PI * hz * i) / SR);
        im += x[i] * Math.sin((2 * Math.PI * hz * i) / SR);
      }
      return Math.hypot(re, im);
    };
    expect(probe(1320)).toBeLessThan(0.1 * probe(440));
  });

  it('is deterministic: two renders give identical samples', () => {
    expect(Buffer.from(render(patch, 1).buffer).equals(Buffer.from(render(patch, 1).buffer))).toBe(true);
  });

  it('maps onto YM2612 registers with a vibrato and a soft attack', () => {
    const p = ymPatch(patch);
    expect(p.id).toBe('theremin-lead');
    expect(p.algorithm).toBe(4);
    expect(p.carriers).toEqual([1, 3]);
    // The chip's vibrato depth step closest to 40 cents is FMS 6, and the LFO rate is above the slow-drift cutoff.
    expect(p.fms).toBe(6);
    for (const op of p.ops) {
      expect(op.ar).toBeGreaterThanOrEqual(1);
      expect(op.ar).toBeLessThan(15); // far slower than an instant attack (31)
      expect(op.d2r).toBe(0); // the sustain never decays
      expect(op.rr).toBeGreaterThanOrEqual(1);
    }
    // The twin carriers sit a few cents either side of pitch: DT 4 + n is flat, n is sharp.
    expect(p.ops[1].dt).toBe(5);
    expect(p.ops[3].dt).toBe(1);
  });
});
