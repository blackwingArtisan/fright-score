import { describe, expect, it } from 'vitest';
import { Operator, operatorFrequency, type OperatorParams } from '../../src/engine/operator';

const SR = 44_100;
const flat = { attackSec: 0, decaySec: 0.001, sustain: 1, sustainDecaySec: 0, releaseSec: 0.1 };

function params(over: Partial<OperatorParams> = {}): OperatorParams {
  return { ratio: 1, detuneCents: 0, level: 1, env: flat, ...over };
}

function render(op: Operator, n: number, mod: (i: number) => number = () => 0): Float64Array {
  op.noteOn();
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = op.tick(mod(i), 1);
  return out;
}

function zeroCrossings(x: Float64Array): number {
  let c = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) c++;
  return c;
}

/** Magnitude of one frequency bin (single-bin DFT). */
function binMagnitude(x: Float64Array, hz: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    const w = (2 * Math.PI * hz * i) / SR;
    re += x[i] * Math.cos(w);
    im -= x[i] * Math.sin(w);
  }
  return Math.hypot(re, im) / x.length;
}

describe('FM operator', () => {
  it('runs at note frequency times ratio, with detune in cents', () => {
    expect(operatorFrequency(params({ ratio: 2 }), 220)).toBeCloseTo(440, 9);
    expect(operatorFrequency(params({ detuneCents: 1200 }), 220)).toBeCloseTo(440, 9);
    expect(operatorFrequency(params({ fixedHz: 1000, ratio: 5 }), 220)).toBeCloseTo(1000, 9);
  });

  it('produces a sine at the right pitch when unmodulated', () => {
    const out = render(new Operator(params(), 441, 0, SR), SR);
    expect(zeroCrossings(out)).toBeGreaterThanOrEqual(440);
    expect(zeroCrossings(out)).toBeLessThanOrEqual(441);
  });

  it('scales its output by level', () => {
    const out = render(new Operator(params({ level: 0.25 }), 100, 0, SR), 4410);
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak).toBeGreaterThan(0.24);
    expect(peak).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('adds harmonics when phase-modulated (classic FM sidebands)', () => {
    const f = 441;
    const plain = render(new Operator(params(), f, 0, SR), SR);
    const modded = render(new Operator(params(), f, 0, SR), SR, (i) => 0.3 * Math.sin((2 * Math.PI * f * i) / SR));
    expect(binMagnitude(plain, 2 * f)).toBeLessThan(0.001);
    expect(binMagnitude(modded, 2 * f)).toBeGreaterThan(0.05);
  });

  it('self-feedback brightens the tone as the feedback level rises', () => {
    const f = 441;
    const h3 = (fb: number) => binMagnitude(render(new Operator(params(), f, fb, SR), SR), 3 * f);
    expect(h3(0)).toBeLessThan(0.001);
    expect(h3(5)).toBeGreaterThan(h3(2));
  });

  // Requirement 5.2: eight feedback levels, 0 through 7, and anything above is held at 7.
  describe('self-feedback levels', () => {
    const f = 441;
    const tone = (level: number) => render(new Operator(params(), f, level, SR), SR / 2);
    /** Energy in harmonics 2 to 8, relative to the fundamental. */
    const harmonicRatio = (x: Float64Array) => {
      let h = 0;
      for (let k = 2; k <= 8; k++) h += binMagnitude(x, k * f) ** 2;
      return Math.sqrt(h) / binMagnitude(x, f);
    };
    const same = (a: Float64Array, b: Float64Array) => a.every((v, i) => v === b[i]);

    it('level 0 is a pure sine and every higher level changes the waveform', () => {
      expect(harmonicRatio(tone(0))).toBeLessThan(0.001);
      for (let level = 1; level <= 7; level++) {
        expect(same(tone(level), tone(level - 1)), `level ${level} equals level ${level - 1}`).toBe(false);
        expect(harmonicRatio(tone(level)), `level ${level}`).toBeGreaterThan(0.001);
      }
    });

    it('gets brighter from level 1 to level 5 and stays brighter than a plain sine at 7', () => {
      const ratios = [0, 1, 2, 3, 4, 5, 6, 7].map((l) => harmonicRatio(tone(l)));
      for (let level = 1; level <= 5; level++) expect(ratios[level], `level ${level}`).toBeGreaterThan(ratios[level - 1]);
      expect(ratios[7]).toBeGreaterThan(ratios[1]);
    });

    it('clamps above 7 to level 7 and below 0 to level 0, and rounds fractions to the nearest level', () => {
      const seven = tone(7);
      for (const level of [8, 12, 100]) expect(same(tone(level), seven), `level ${level}`).toBe(true);
      const zero = tone(0);
      for (const level of [-1, -50, 0.4]) expect(same(tone(level), zero), `level ${level}`).toBe(true);
      expect(same(tone(6.6), seven)).toBe(true);
    });
  });
});
