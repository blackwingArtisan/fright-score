import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../../src/score/rng';

describe('seeded rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('keeps values in range', () => {
    const r = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('forks independent but reproducible streams', () => {
    const a = createRng(5).fork('drone');
    const b = createRng(5).fork('drone');
    const c = createRng(5).fork('motif');
    expect(a.next()).toEqual(b.next());
    expect(createRng(5).fork('drone').next()).not.toEqual(c.next());
  });

  it('honors weights', () => {
    const r = createRng(3);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted(['a', 'b'] as const, [3, 1])]++;
    expect(counts.a / counts.b).toBeGreaterThan(2.4);
    expect(counts.a / counts.b).toBeLessThan(3.8);
  });

  it('hashes strings stably', () => {
    expect(hashString('fright')).toBe(hashString('fright'));
    expect(hashString('fright')).not.toBe(hashString('score'));
  });
});
