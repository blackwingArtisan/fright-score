import { describe, expect, it } from 'vitest';
import { ALGORITHMS, getAlgorithm, isCarrier } from '../../src/engine/algorithms';
import type { Patch } from '../../src/engine/patches';
import { Voice } from '../../src/engine/voice';

const flat = { attackSec: 0, decaySec: 0.001, sustain: 1, sustainDecaySec: 0, releaseSec: 0.1 };

function patchWith(algorithm: number, levels: [number, number, number, number]): Patch {
  return {
    id: 'grave-drone',
    name: 'test',
    blurb: 'test',
    algorithm,
    feedback: 0,
    ops: levels.map((level) => ({ ratio: 1, detuneCents: 0, level, env: flat })) as Patch['ops'],
    lfo: { rateHz: 0.1, vibratoCents: 0, tremolo: 0 },
    gain: 1,
  };
}

describe('YM2612-style algorithms', () => {
  it('defines all eight algorithms with valid, forward-only routing', () => {
    expect(ALGORITHMS).toHaveLength(8);
    for (const algo of ALGORITHMS) {
      expect(algo.carriers.length).toBeGreaterThan(0);
      algo.inputs.forEach((sources, target) => {
        for (const s of sources) expect(s).toBeLessThan(target);
      });
    }
  });

  it('matches the datasheet carrier counts 1,1,1,1,2,3,3,4', () => {
    expect(ALGORITHMS.map((a) => a.carriers.length)).toEqual([1, 1, 1, 1, 2, 3, 3, 4]);
    expect(isCarrier(0, 3)).toBe(true);
    expect(isCarrier(0, 0)).toBe(false);
    expect(isCarrier(7, 0)).toBe(true);
  });

  it('rejects unknown algorithms', () => {
    expect(() => getAlgorithm(8)).toThrow(/0-7/);
  });

  it('algorithm 0 with silent modulators is a pure sine from operator 4', () => {
    const v = new Voice(patchWith(0, [0, 0, 0, 0.5]), { midi: 69, velocity: 1 }, 44_100);
    let peak = 0;
    for (let i = 0; i < 4410; i++) peak = Math.max(peak, Math.abs(v.tick()));
    expect(peak).toBeGreaterThan(0.49);
    expect(peak).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('algorithm 7 sums all four operators additively', () => {
    const v = new Voice(patchWith(7, [0.25, 0.25, 0.25, 0.25]), { midi: 69, velocity: 1 }, 44_100);
    let peak = 0;
    for (let i = 0; i < 4410; i++) peak = Math.max(peak, Math.abs(v.tick()));
    expect(peak).toBeGreaterThan(0.99);
    expect(peak).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('modulators change the carrier waveform', () => {
    const plain = new Voice(patchWith(0, [0, 0, 0, 1]), { midi: 57, velocity: 1 }, 44_100);
    const fm = new Voice(patchWith(0, [0, 0, 0.5, 1]), { midi: 57, velocity: 1 }, 44_100);
    let diff = 0;
    for (let i = 0; i < 2000; i++) diff += Math.abs(plain.tick() - fm.tick());
    expect(diff / 2000).toBeGreaterThan(0.1);
  });
});
