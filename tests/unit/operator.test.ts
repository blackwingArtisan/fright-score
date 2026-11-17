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
});
