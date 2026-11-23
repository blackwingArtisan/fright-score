import { describe, expect, it } from 'vitest';
import { DEFAULT_MASTER, master } from '../../src/engine/master';
import { renderScore } from '../../src/engine/render';
import { arrange } from '../../src/score/arranger';
import { composePlan, reconcilePlan, snapLoopLength } from '../../src/score/composer';
import { MOOD_PROFILES } from '../../src/score/moods';
import { MOODS } from '../../src/score/schema';
import { encodeWav, parseWav } from '../../src/wav/wav';

const plan = composePlan({ seed: 4, mood: 'chase', durationSec: 12, loop: true });
const barSec = (60 / plan.tempoBpm) * plan.beatsPerBar;

describe('seamless loops', () => {
  it('snaps loop length to whole bars within the allowed range', () => {
    expect(snapLoopLength(10, 2)).toBe(10);
    expect(snapLoopLength(11.2, 2)).toBe(12);
    expect(snapLoopLength(3, 1)).toBe(5);
    expect(snapLoopLength(400, 7)).toBeLessThanOrEqual(300);
    const bars = plan.durationSec / barSec;
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.01);
    expect(plan.loop).toBe(true);
    expect(plan.directorNotes).toMatch(/seamless/);
  });

  it('keeps the loop on whole bars when a director plan is reconciled', () => {
    const fixed = reconcilePlan(plan, { seed: 4, durationSec: 20, loop: true });
    const bars = fixed.durationSec / barSec;
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.01);
    expect(fixed.loop).toBe(true);
  });

  it('renders without fades and wraps the end smoothly into the start', () => {
    const r = renderScore(arrange(plan, 4));
    const n = r.left.length;
    expect(n).toBe(Math.ceil(plan.durationSec * 44_100));
    let startEnergy = 0;
    for (let i = 0; i < 2205; i++) startEnergy += Math.abs(r.left[i]) + Math.abs(r.right[i]);
    expect(startEnergy / 4410).toBeGreaterThan(0.01); // no fade-in: music is already playing at sample 0

    // The jump across the wrap point is no bigger than the steps inside the loop.
    let maxStep = 0;
    for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(r.left[i] - r.left[i - 1]), Math.abs(r.right[i] - r.right[i - 1]));
    const wrapStep = Math.max(Math.abs(r.left[0] - r.left[n - 1]), Math.abs(r.right[0] - r.right[n - 1]));
    expect(wrapStep).toBeLessThanOrEqual(maxStep);
  });

  it('writes loop points that game engines read (WAV smpl chunk)', () => {
    const r = renderScore(arrange(plan, 4));
    const info = parseWav(encodeWav(r, { ditherSeed: 1, loop: true }));
    expect(info.loop).toEqual({ startFrame: 0, endFrame: info.frameCount - 1 });
    expect(parseWav(encodeWav(r, { ditherSeed: 1 })).loop).toBeUndefined();
  });
});

describe('steady intensity across a loop (Requirement 10.1b)', () => {
  const build = 'it builds and builds and keeps getting worse, 24 seconds';

  it.each(MOODS.flatMap((mood) => [4, 9].map((seed) => ({ mood, seed }))))(
    'keeps every section of a $mood loop (seed $seed) near the mood\'s steady level, even when the scene asks for a build',
    ({ mood, seed }) => {
      const loop = composePlan({ seed, mood, scene: build, loop: true });
      const steady = MOOD_PROFILES[mood].steadyIntensity;
      const levels = loop.sections.map((s) => s.intensity);
      expect(levels.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(0.25);
      for (const level of levels) expect(Math.abs(level - steady)).toBeLessThanOrEqual(0.15);
      // No aftermath drop: the last section is not a quiet tail.
      expect(levels.at(-1)!).toBeGreaterThan(steady - 0.15);

      // The same scene without a loop does build, so the steadiness comes from the loop request.
      const open = composePlan({ seed, mood, scene: build });
      const openLevels = open.sections.map((s) => s.intensity);
      expect(Math.max(...openLevels) - Math.min(...openLevels)).toBeGreaterThan(0.5);
    },
  );

  it('renders a loop at one level from start to end, where the same scene as a build gets louder', () => {
    const quarterLevelsDb = (loop: boolean) => {
      const p = composePlan({ seed: 4, mood: 'dread', scene: build, loop });
      const r = renderScore(arrange(p, 4));
      const n = r.left.length;
      return [0, 1, 2, 3].map((q) => {
        let e = 0;
        const from = Math.floor((q * n) / 4);
        const to = Math.floor(((q + 1) * n) / 4);
        for (let i = from; i < to; i++) e += r.left[i] ** 2 + r.right[i] ** 2;
        return 10 * Math.log10(e / (2 * (to - from)));
      });
    };
    const spreadDb = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spreadDb(quarterLevelsDb(true))).toBeLessThan(2.5);
    expect(spreadDb(quarterLevelsDb(false))).toBeGreaterThan(3);
  });
});

describe('output filters warmed with the loop end (Requirement 10.2c)', () => {
  const SR = 44_100;
  // A tone with whole cycles in the buffer, so the end of the loop flows straight into its start.
  const tone = (n: number) => Float32Array.from({ length: n }, (_, i) => 0.8 * Math.sin((2 * Math.PI * 60 * i) / SR + 0.5) + 0.3 * Math.sin((2 * Math.PI * 1500 * i) / SR));
  const options = { ...DEFAULT_MASTER, fadeInSec: 0, fadeOutSec: 0, lowpassHz: 800 };

  function run(circular: boolean) {
    const n = SR; // 60 Hz and 1500 Hz both fit whole cycles in one second
    const left = tone(n);
    const right = tone(n);
    master(left, right, { ...options, circular });
    let interior = 0;
    for (let i = 1; i < n; i++) interior = Math.max(interior, Math.abs(left[i] - left[i - 1]));
    return { wrap: Math.abs(left[0] - left[n - 1]), interior, left };
  }

  it('makes the wrap point as smooth as any other point in the loop', () => {
    const { wrap, interior } = run(true);
    expect(wrap).toBeLessThanOrEqual(interior);
  });

  it('would click at the wrap point if the filters started cold', () => {
    const cold = run(false);
    const warm = run(true);
    expect(cold.wrap).toBeGreaterThan(cold.interior * 1.2);
    expect(cold.wrap).toBeGreaterThan(warm.wrap * 3);
  });

  it('keeps the true peak at the ceiling', () => {
    const left = tone(SR);
    const peak = master(left, tone(SR), { ...options, circular: true });
    expect(peak).toBeCloseTo(10 ** (DEFAULT_MASTER.ceilingDb / 20), 6);
  });
});
