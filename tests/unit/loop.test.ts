import { describe, expect, it } from 'vitest';
import { renderScore } from '../../src/engine/render';
import { arrange } from '../../src/score/arranger';
import { composePlan, reconcilePlan, snapLoopLength } from '../../src/score/composer';
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
