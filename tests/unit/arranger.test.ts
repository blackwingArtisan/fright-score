import { describe, expect, it } from 'vitest';
import { PATCH_IDS } from '../../src/engine/patches';
import { arrange } from '../../src/score/arranger';
import { composePlan } from '../../src/score/composer';
import { MOODS, ScoreSchema } from '../../src/score/schema';

const plan = composePlan({ seed: 7, scene: 'creeping dread, 90 seconds, builds to a sting at 0:70' });

describe('arranger', () => {
  it('is deterministic by seed', () => {
    expect(arrange(plan, 7)).toEqual(arrange(plan, 7));
    expect(arrange(plan, 7)).not.toEqual(arrange(plan, 8));
  });

  it('produces a schema-valid score with library patches only', () => {
    const score = arrange(plan, 7);
    expect(ScoreSchema.safeParse(score).success).toBe(true);
    for (const t of score.tracks) expect(PATCH_IDS).toContain(t.patchId);
  });

  it('keeps every note inside the cue', () => {
    const score = arrange(plan, 7);
    for (const t of score.tracks) {
      for (const n of t.notes) {
        expect(n.atSec).toBeGreaterThanOrEqual(0);
        expect(n.atSec + n.durSec).toBeLessThanOrEqual(score.durationSec + 1e-6);
      }
    }
  });

  it('clears the silence window before the sting and lands the sting exactly', () => {
    const score = arrange(plan, 7);
    const stingTrack = score.tracks.find((t) => t.id === 'stinger')!;
    expect(stingTrack.notes.every((n) => n.atSec === 70)).toBe(true);
    for (const t of score.tracks.filter((x) => x.role !== 'stinger')) {
      for (const n of t.notes) {
        const startsInGap = n.atSec >= 69.4 && n.atSec < 70;
        const ringsIntoGap = n.atSec < 69.4 && n.atSec + n.durSec > 69.4 + 1e-6;
        expect(startsInGap, `${t.id} note at ${n.atSec}`).toBe(false);
        expect(ringsIntoGap, `${t.id} note at ${n.atSec}`).toBe(false);
      }
    }
  });

  it('brings the drone back after the sting', () => {
    const score = arrange(plan, 7);
    const drone = score.tracks.find((t) => t.role === 'drone')!;
    expect(drone.notes.some((n) => n.atSec >= 70)).toBe(true);
  });

  it.each(MOODS)('arranges %s with more than one layer', (mood) => {
    const score = arrange(composePlan({ seed: 5, mood, durationSec: 30 }), 5);
    expect(score.tracks.length).toBeGreaterThan(1);
    expect(score.tracks.reduce((n, t) => n + t.notes.length, 0)).toBeGreaterThan(10);
  });
});
