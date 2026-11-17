/**
 * Seeded pseudo-random number generator (mulberry32) with helpers.
 * Every random decision in the composer, arranger and engine goes through this,
 * so the same seed always produces the same cue.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** One element chosen with the given relative weights. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** An independent generator derived from this seed and a label. */
  fork(label: string): Rng;
  readonly seed: number;
}

/** 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  const initial = seed >>> 0;
  let state = initial;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    seed: initial,
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() needs a non-empty array');
      return items[Math.floor(next() * items.length)];
    },
    weighted: (items, weights) => {
      if (items.length === 0 || items.length !== weights.length) {
        throw new Error('weighted() needs matching non-empty items and weights');
      }
      const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
      if (total <= 0) return items[0];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    fork: (label) => createRng((hashString(label) ^ Math.imul(initial, 0x9e3779b1)) >>> 0),
  };
  return rng;
}
