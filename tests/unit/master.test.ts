import { describe, expect, it } from 'vitest';
import {
  applyFades,
  dcBlock,
  lowpass,
  rmsOf,
  dbToGain,
  fadeInCurve,
  gainToDb,
  master,
  peakOf,
  softLimit,
  truePeakOf,
  CEILING_DB,
  DEFAULT_MASTER,
} from '../../src/engine/master';

describe('master chain', () => {
  it('soft limiter is transparent below threshold and never reaches full scale', () => {
    expect(softLimit(0.3)).toBe(0.3);
    expect(softLimit(-0.5)).toBe(-0.5);
    for (const x of [0.7, 1, 2]) {
      expect(softLimit(x)).toBeLessThan(1);
      expect(softLimit(-x)).toBeGreaterThan(-1);
    }
    for (const x of [10, 1e6]) expect(Math.abs(softLimit(x))).toBeLessThanOrEqual(1);
    expect(softLimit(2)).toBeGreaterThan(softLimit(1));
  });

  it('converts between dB and gain', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('fades start and end at silence', () => {
    const ch = new Float32Array(1000).fill(1);
    applyFades([ch], 1000, 0.1, 0.2);
    expect(ch[0]).toBe(0);
    expect(ch[999]).toBe(0);
    expect(ch[500]).toBe(1);
    expect(ch[50]).toBeCloseTo(0.5, 1);
  });

  it('builds a raised-cosine fade-in curve for playback that runs from silence to full level', () => {
    const curve = fadeInCurve(64);
    expect(curve[0]).toBe(0);
    expect(curve[63]).toBeCloseTo(1, 6);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
  });

  it('true peak catches inter-sample overs that the sample peak misses', () => {
    // A sine at fs/4 sampled at 45 degrees: every sample is 0.707, the waveform peaks at 1.
    const n = 4000;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((Math.PI / 2) * i + Math.PI / 4);
    expect(peakOf(ch)).toBeCloseTo(0.707, 2);
    expect(truePeakOf(ch)).toBeGreaterThan(0.95);
  });

  it('normalizes a hot, clipping signal to the -3 dBTP ceiling', () => {
    const n = 44_100;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = 3 * Math.sin((2 * Math.PI * 220 * i) / 44_100);
      r[i] = 5 * Math.sin((2 * Math.PI * 330 * i) / 44_100);
    }
    master(l, r, DEFAULT_MASTER);
    expect(CEILING_DB).toBe(-3);
    expect(truePeakOf(l, r)).toBeLessThanOrEqual(dbToGain(CEILING_DB) + 1e-6);
    expect(peakOf(l, r)).toBeGreaterThan(dbToGain(CEILING_DB - 2));
  });

  it('leaves digital silence silent', () => {
    const l = new Float32Array(100);
    const r = new Float32Array(100);
    expect(master(l, r)).toBe(0);
    expect(peakOf(l, r)).toBe(0);
  });

  // Requirement 6.6: the DC blocker and the output low-pass.
  describe('DC blocker', () => {
    const SR = 44_100;
    const sine = (hz: number, n: number, offset = 0) => Float32Array.from({ length: n }, (_, i) => offset + 0.5 * Math.sin((2 * Math.PI * hz * i) / SR));

    it('removes a constant offset and leaves the music in place', () => {
      const x = sine(220, SR * 2, 0.3);
      dcBlock(x);
      const tail = x.subarray(SR); // after the blocker has settled
      const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
      expect(Math.abs(mean)).toBeLessThan(0.005);
      expect(rmsOf(tail)).toBeCloseTo(0.5 / Math.SQRT2, 2);
    });

    it('settles a pure step to silence', () => {
      const x = new Float32Array(SR * 4).fill(1);
      dcBlock(x);
      expect(x[0]).toBe(1);
      expect(Math.abs(x[x.length - 1])).toBeLessThan(0.01);
    });

    it('passes a low bass note almost untouched', () => {
      const x = sine(40, SR * 2);
      const before = rmsOf(x.subarray(SR));
      dcBlock(x);
      expect(rmsOf(x.subarray(SR)) / before).toBeGreaterThan(0.98);
    });
  });

  describe('output low-pass', () => {
    const SR = 44_100;
    const gainAt = (hz: number, cutoffHz = 11_000) => {
      const x = Float32Array.from({ length: SR }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR));
      const before = rmsOf(x.subarray(SR / 2));
      lowpass(x, cutoffHz, SR);
      return rmsOf(x.subarray(SR / 2)) / before;
    };

    it('passes the body of the sound', () => {
      expect(gainAt(200)).toBeGreaterThan(0.99);
      expect(gainAt(2_000)).toBeGreaterThan(0.95);
    });

    it('cuts the top end, more the higher it goes', () => {
      expect(gainAt(18_000)).toBeLessThan(gainAt(8_000));
      expect(gainAt(20_000)).toBeLessThan(0.5);
    });

    it('moves the cutoff with the setting', () => {
      expect(gainAt(5_000, 1_000)).toBeLessThan(0.15);
      expect(gainAt(5_000, 11_000)).toBeGreaterThan(0.8);
    });

    it('keeps a constant level unchanged once settled', () => {
      const x = new Float32Array(2000).fill(0.4);
      lowpass(x, 11_000, SR);
      expect(x[x.length - 1]).toBeCloseTo(0.4, 5);
    });
  });
});
