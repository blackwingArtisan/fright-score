import { describe, expect, it } from 'vitest';
import { applyFades, dbToGain, gainToDb, master, peakOf, softLimit, truePeakOf, DEFAULT_MASTER } from '../../src/engine/master';

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

  it('true peak catches inter-sample overs that the sample peak misses', () => {
    // A sine at fs/4 sampled at 45 degrees: every sample is 0.707, the waveform peaks at 1.
    const n = 4000;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = Math.sin((Math.PI / 2) * i + Math.PI / 4);
    expect(peakOf(ch)).toBeCloseTo(0.707, 2);
    expect(truePeakOf(ch)).toBeGreaterThan(0.95);
  });

  it('normalizes a hot, clipping signal to the -1 dBFS ceiling', () => {
    const n = 44_100;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      l[i] = 3 * Math.sin((2 * Math.PI * 220 * i) / 44_100);
      r[i] = 5 * Math.sin((2 * Math.PI * 330 * i) / 44_100);
    }
    master(l, r, DEFAULT_MASTER);
    expect(truePeakOf(l, r)).toBeLessThanOrEqual(dbToGain(-1) + 1e-6);
    expect(peakOf(l, r)).toBeGreaterThan(dbToGain(-3));
  });

  it('leaves digital silence silent', () => {
    const l = new Float32Array(100);
    const r = new Float32Array(100);
    expect(master(l, r)).toBe(0);
    expect(peakOf(l, r)).toBe(0);
  });
});
