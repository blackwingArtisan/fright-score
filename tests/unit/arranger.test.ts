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

  // Requirement 3.2: the sting is a tritone brass cluster with a falling boom, both exactly on the sting time.
  it('builds the sting as a tritone brass cluster and a boom that falls in pitch', () => {
    const score = arrange(plan, 7);
    const stinger = score.tracks.find((t) => t.id === 'stinger')!;
    expect(stinger.patchId).toBe('tritone-brass');
    expect(stinger.notes.length).toBeGreaterThanOrEqual(3);
    const lowest = Math.min(...stinger.notes.map((n) => n.midi));
    const intervals = stinger.notes.map((n) => n.midi - lowest).sort((a, b) => a - b);
    expect(intervals).toContain(6); // the tritone above the lowest note
    expect(intervals).toContain(1); // a semitone clashing against it: a cluster, not a chord

    const boom = score.tracks.find((t) => t.id === 'boom')!;
    expect(boom.notes).toHaveLength(1);
    expect(boom.notes[0].atSec).toBe(70);
    expect(boom.notes[0].bendSemis).toBeLessThan(0); // the pitch glides down
    expect(boom.notes[0].bendSec).toBeGreaterThan(0);
  });

  // Requirement 3.5: the heartbeat and bass speed up toward double time while the riser builds.
  describe('during a riser', () => {
    const risePlan = composePlan({ seed: 7, mood: 'dread', durationSec: 60, stingAtSec: [50] });
    const riser = risePlan.cues.find((c) => c.kind === 'riser')!;
    const riserStart = riser.atSec - (riser.lengthSec ?? 4);
    const beatSec = 60 / risePlan.tempoBpm;
    const score = arrange(risePlan, 7);

    /**
     * Gaps between successive onsets inside a window. The heartbeat is read on its first thump only
     * (its highest note), so the second thump of each beat does not count as a gap.
     */
    function gaps(trackId: string, fromSec: number, toSec: number): number[] {
      const notes = score.tracks.find((t) => t.id === trackId)!.notes;
      const top = Math.max(...notes.map((n) => n.midi));
      const times = notes
        .filter((n) => (trackId !== 'pulse' || n.midi === top) && n.atSec >= fromSec && n.atSec < toSec)
        .map((n) => n.atSec);
      return times.slice(1).map((t, i) => t - times[i]);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    it('plans a riser that ends at the sting', () => {
      expect(riser.atSec).toBe(50);
      expect(riserStart).toBeLessThan(riser.atSec);
    });

    it('speeds the heartbeat up to nearly double time', () => {
      const before = gaps('pulse', riserStart - 8, riserStart);
      const end = gaps('pulse', riser.atSec - 3, riser.atSec);
      expect(mean(before)).toBeCloseTo(beatSec, 1);
      expect(end.length).toBeGreaterThan(2);
      expect(mean(end)).toBeLessThan(beatSec * 0.8);
      expect(end.at(-1)!).toBeLessThan(beatSec * 0.65); // the last beat before the sting is near double time
      expect(Math.min(...end)).toBeGreaterThan(beatSec * 0.45); // never faster than double time
    });

    it('speeds the bass up as well', () => {
      // At this intensity the bass already plays eighth notes, so it is compared with its own pace before the riser.
      const before = gaps('bass', riserStart - 4, riserStart);
      const end = gaps('bass', riser.atSec - 3, riser.atSec);
      expect(end.length).toBeGreaterThan(2);
      expect(mean(end)).toBeLessThan(mean(before) * 0.75);
      expect(end.at(-1)!).toBeLessThan(before[0] * 0.65);
      expect(end.at(-1)!).toBeGreaterThan(before[0] * 0.45); // never faster than double time
    });

    it('does not speed up without a riser', () => {
      const flat = arrange(composePlan({ seed: 7, mood: 'dread', durationSec: 60 }), 7);
      const notes = flat.tracks.find((t) => t.id === 'pulse')!.notes;
      const top = Math.max(...notes.map((n) => n.midi));
      const times = notes.filter((n) => n.midi === top && n.atSec >= 40 && n.atSec < 50).map((n) => n.atSec);
      const g = times.slice(1).map((t, i) => t - times[i]);
      expect(mean(g)).toBeGreaterThan(beatSec * 0.9);
    });
  });
});
