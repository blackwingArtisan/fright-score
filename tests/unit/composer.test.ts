import { describe, expect, it } from 'vitest';
import { composePlan, reconcilePlan } from '../../src/score/composer';
import { MOODS } from '../../src/score/schema';
import { MODES } from '../../src/score/theory';

describe('local director (composer)', () => {
  it('is deterministic by seed', () => {
    const a = composePlan({ seed: 42, scene: 'creeping dread, 90 seconds, builds to a sting at 0:70' });
    const b = composePlan({ seed: 42, scene: 'creeping dread, 90 seconds, builds to a sting at 0:70' });
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const plans = [1, 2, 3, 4, 5].map((seed) => composePlan({ seed, mood: 'dread', durationSec: 60 }));
    const fingerprints = new Set(plans.map((p) => `${p.key.root}-${p.key.mode}-${p.tempoBpm}-${p.motif.degrees.join('')}`));
    expect(fingerprints.size).toBeGreaterThanOrEqual(4);
  });

  it('honors the requested length and sting time', () => {
    const plan = composePlan({ seed: 7, scene: 'creeping dread, 90 seconds, builds to a sting at 0:70' });
    expect(plan.durationSec).toBe(90);
    const sting = plan.cues.find((c) => c.kind === 'sting');
    expect(sting?.atSec).toBe(70);
    expect(plan.cues.some((c) => c.kind === 'silence' && c.atSec < 70 && c.atSec + (c.lengthSec ?? 0) >= 69.99)).toBe(true);
    expect(plan.cues.some((c) => c.kind === 'riser' && c.atSec === 70)).toBe(true);
    expect(plan.sections.at(-1)?.endSec).toBe(90);
  });

  it('builds intensity toward the sting, then drops into an aftermath', () => {
    const plan = composePlan({ seed: 7, mood: 'dread', durationSec: 90, stingAtSec: [70] });
    const pre = plan.sections.filter((s) => s.endSec <= 70);
    for (let i = 1; i < pre.length; i++) expect(pre[i].intensity).toBeGreaterThan(pre[i - 1].intensity);
    expect(plan.sections.at(-1)!.intensity).toBeLessThan(pre.at(-1)!.intensity);
  });

  it.each(MOODS)('produces a valid, fitting plan for %s', (mood) => {
    const plan = composePlan({ seed: 11, mood, durationSec: 40 });
    expect(plan.mood).toBe(mood);
    expect(Object.keys(MODES)).toContain(plan.key.mode);
    expect(plan.sections[0].startSec).toBe(0);
    expect(plan.directorNotes).toMatch(/BPM/);
    if (mood === 'chase') expect(plan.tempoBpm).toBeGreaterThan(140);
    if (mood === 'dread') expect(plan.tempoBpm).toBeLessThan(70);
    if (mood === 'lullaby') expect(plan.beatsPerBar).toBe(3);
  });

  it('puts a sting near the end when the scene asks for a jump scare without a time', () => {
    const plan = composePlan({ seed: 3, scene: 'slow walk to the cellar door, then a jump scare, 30 seconds' });
    const sting = plan.cues.find((c) => c.kind === 'sting');
    expect(sting).toBeDefined();
    expect(sting!.atSec).toBeGreaterThan(18);
    expect(sting!.atSec).toBeLessThan(30);
  });

  it('reconcilePlan forces any director plan onto the requested length and stings', () => {
    const plan = composePlan({ seed: 2, mood: 'ritual', durationSec: 60 });
    const fixed = reconcilePlan(plan, { seed: 2, durationSec: 30, stingAtSec: [20] });
    expect(fixed.durationSec).toBe(30);
    expect(fixed.sections.at(-1)!.endSec).toBe(30);
    expect(fixed.cues.filter((c) => c.kind === 'sting').map((c) => c.atSec)).toEqual([20]);
  });
});
