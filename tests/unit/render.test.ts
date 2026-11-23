import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fadeOutFor, renderScore, TRACK_POLYPHONY } from '../../src/engine/render';
import { truePeakOf, dbToGain, peakOf, CEILING_DB, FADE_IN_SEC } from '../../src/engine/master';
import { arrange } from '../../src/score/arranger';
import type { PatchId } from '../../src/engine/patches';
import { composePlan } from '../../src/score/composer';
import { MOODS, type Note, type Score, type Track } from '../../src/score/schema';
import { encodeWav } from '../../src/wav/wav';

const SR = 44_100;

function render(seed: number, stingAtSec?: number[]) {
  const plan = composePlan({ seed, mood: 'dread', durationSec: 14, ...(stingAtSec ? { stingAtSec } : {}) });
  const score = arrange(plan, seed);
  return { score, result: renderScore(score, { frames: true }) };
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('renderer', () => {
  const { score, result } = render(7, [10]);

  it('renders exactly the requested length at 44.1 kHz stereo', () => {
    expect(result.sampleRate).toBe(SR);
    expect(result.left.length).toBe(14 * SR);
    expect(result.right.length).toBe(14 * SR);
  });

  it('never exceeds the -3 dBTP true-peak ceiling', () => {
    expect(truePeakOf(result.left, result.right)).toBeLessThanOrEqual(dbToGain(CEILING_DB) + 1e-6);
    expect(result.stats.truePeakDb).toBeLessThanOrEqual(CEILING_DB + 1e-3);
  });

  it('fades in from and out to silence', () => {
    expect(Math.abs(result.left[0])).toBeLessThan(1e-3);
    expect(Math.abs(result.left[result.left.length - 1])).toBeLessThan(1e-3);
    expect(Math.abs(result.right[result.right.length - 1])).toBeLessThan(1e-3);
  });

  it('lands the sting within 50 ms of the requested time, out of near-silence', () => {
    const sting = 10;
    const level = (from: number, to: number) => {
      let peak = 0;
      for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) peak = Math.max(peak, Math.abs(result.left[i]), Math.abs(result.right[i]));
      return peak;
    };
    const stingPeak = level(sting, sting + 0.3);
    // The gap before the sting is far quieter than the sting itself.
    expect(level(sting - 0.35, sting - 0.05)).toBeLessThan(stingPeak * 0.35);
    // First sample that reaches half of the sting's peak.
    let onset = -1;
    for (let i = Math.round((sting - 0.3) * SR); i < Math.round((sting + 0.3) * SR); i++) {
      if (Math.abs(result.left[i]) > stingPeak * 0.5 || Math.abs(result.right[i]) > stingPeak * 0.5) {
        onset = i / SR;
        break;
      }
    }
    expect(Math.abs(onset - sting)).toBeLessThan(0.05);
  });

  it('collects visualizer frames for every track', () => {
    const f = result.frames!;
    expect(f.trackIds).toEqual(score.tracks.map((t) => t.id));
    expect(f.frameCount).toBe(Math.ceil((14 * SR) / Math.round(SR / 30)));
    expect(f.envelopes.length).toBe(f.frameCount * f.trackIds.length * 4);
    expect(Math.max(...f.envelopes)).toBeGreaterThan(0.5);
    expect(Math.max(...f.voices)).toBeGreaterThan(0);
  });

  it('is byte-for-byte deterministic by seed, and the seed changes the audio', () => {
    const a = encodeWav(render(21).result, 21);
    const b = encodeWav(render(21).result, 21);
    const c = encodeWav(render(22).result, 22);
    expect(sha(a)).toBe(sha(b));
    expect(sha(a)).not.toBe(sha(c));
  });
});

describe('opening level and headroom on rendered cues', () => {
  const first50ms = Math.round(0.05 * SR);
  const opening = (left: Float32Array, right: Float32Array) => peakOf(left.subarray(0, first50ms), right.subarray(0, first50ms));

  // Chase is the mood that starts loudest, so it gets an extra seed and a longer cue.
  const cases = [...MOODS.flatMap((mood) => [3, 42].map((seed) => ({ mood, seed, durationSec: 12 }))), { mood: 'chase' as const, seed: 13, durationSec: 30 }];

  it.each(cases)('$mood (seed $seed, $durationSec s) fades in and peaks at -3 dBFS or lower', ({ mood, seed, durationSec }) => {
    const { left, right, stats } = renderScore(arrange(composePlan({ seed, mood, durationSec }), seed));
    const peak = peakOf(left, right);
    expect(peak).toBeLessThanOrEqual(dbToGain(-3) + 1e-6);
    expect(truePeakOf(left, right)).toBeLessThanOrEqual(dbToGain(-3) + 1e-6);
    expect(stats.peakDb).toBeLessThanOrEqual(-3 + 1e-3);
    // The first 50 ms stay quiet: at least 20 dB under the cue's own peak, and under -24 dBFS outright.
    expect(opening(left, right)).toBeLessThanOrEqual(peak * dbToGain(-20));
    expect(opening(left, right)).toBeLessThanOrEqual(dbToGain(-24));
    // The fade reaches full level: the music is audible by the end of the fade-in.
    const afterFade = Math.round(FADE_IN_SEC * SR);
    expect(peakOf(left.subarray(afterFade, afterFade + SR), right.subarray(afterFade, afterFade + SR))).toBeGreaterThan(opening(left, right));
  });

  it('keeps the same -3 dBFS headroom on seamless loops', () => {
    const plan = composePlan({ seed: 3, mood: 'chase', durationSec: 12, loop: true });
    const { left, right } = renderScore(arrange(plan, 3));
    expect(truePeakOf(left, right)).toBeLessThanOrEqual(dbToGain(-3) + 1e-6);
  });
});

/** A score built by hand: the given tracks under a plain dread plan with no stings. */
function handScore(durationSec: number, tracks: Track[]): Score {
  const plan = composePlan({ seed: 1, mood: 'dread', durationSec });
  return { version: 1, seed: 1, sampleRate: 44_100, durationSec, plan: { ...plan, cues: [] }, tracks };
}

const note = (atSec: number, durSec: number, midi: number, velocity = 0.8): Note => ({ atSec, durSec, midi, velocity });
const track = (id: string, patchId: PatchId, notes: Note[]): Track => ({ id, role: 'bass', patchId, gainDb: 0, pan: 0, reverb: 0, notes });

/** Size of one frequency component of `x` between two times, as a single-bin DFT. */
function binMagnitude(x: Float32Array, hz: number, fromSec: number, toSec: number): number {
  let re = 0;
  let im = 0;
  const from = Math.round(fromSec * SR);
  const to = Math.round(toSec * SR);
  for (let i = from; i < to; i++) {
    const w = (2 * Math.PI * hz * i) / SR;
    re += x[i] * Math.cos(w);
    im -= x[i] * Math.sin(w);
  }
  return Math.hypot(re, im) / (to - from);
}

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

describe('voice limits per track (Requirement 5.6)', () => {
  it('never sounds more voices on a track than its limit', () => {
    for (const [id, limit] of [['bass', 2], ['drone', 5], ['motif', 6]] as const) {
      expect(TRACK_POLYPHONY[id]).toBe(limit);
      // Ten long notes at once on a track that allows fewer.
      const notes = Array.from({ length: 10 }, (_, i) => note(0.5 + i * 0.05, 3, 48 + i * 2));
      const { stats } = renderScore(handScore(6, [track(id, 'choir-organ', notes)]));
      expect(stats.maxVoices, id).toBe(limit);
      expect(stats.noteCount, id).toBe(10);
    }
  });

  it('counts each track against its own limit', () => {
    const notes = Array.from({ length: 4 }, (_, i) => note(0.5 + i * 0.05, 3, 48 + i * 3));
    const { stats } = renderScore(handScore(6, [track('bass', 'choir-organ', notes), track('pulse', 'choir-organ', notes)]));
    expect(stats.maxVoices).toBe(4); // two on each of the two tracks
  });

  describe('when a third note arrives on a track limited to two voices', () => {
    // Choir Organ is additive and sustains, so each note is a steady pitch of its own and rings 2 s after release.
    const heldA = note(0, 6, 48);
    const levelOfA = (left: Float32Array) => binMagnitude(left, midiHz(48), 2.5, 4.5) / binMagnitude(left, midiHz(48), 0.55, 0.95);

    it('steals the oldest released voice first, leaving the older held note sounding', () => {
      // B is released at 0.5 s and is still ringing out when C arrives at 1 s.
      const { left } = renderScore(handScore(8, [track('bass', 'choir-organ', [heldA, note(0, 0.5, 55), note(1, 4, 61)])]));
      expect(levelOfA(left)).toBeGreaterThan(0.7);
    });

    it('steals the oldest voice when none has been released', () => {
      const { left } = renderScore(handScore(8, [track('bass', 'choir-organ', [heldA, note(0, 6, 55), note(1, 4, 61)])]));
      expect(levelOfA(left)).toBeLessThan(0.1);
    });
  });
});

describe('fade-out and a late sting (Requirement 6.4)', () => {
  const lateSting = (durationSec: number, atSec: number): Score => {
    const plan = composePlan({ seed: 1, mood: 'dread', durationSec: 20 });
    const base = handScore(durationSec, [track('stinger', 'tritone-brass', [note(atSec, 2, 48, 1), note(atSec, 2, 54, 1)])]);
    return { ...base, plan: { ...plan, durationSec, sections: [{ ...plan.sections[0], startSec: 0, endSec: durationSec }], cues: [{ atSec, kind: 'sting' as const }] } };
  };

  it('uses the full two seconds when the last sting is far from the end, and a shorter one when it is not', () => {
    expect(fadeOutFor(lateSting(20, 5))).toBe(2);
    expect(fadeOutFor(lateSting(10, 8))).toBeCloseTo(10 - (8 + 0.6), 6); // 0.8 s of room after the sting
    expect(fadeOutFor(lateSting(10, 9.9))).toBe(0.25); // never shorter than a quarter second
  });

  it('keeps the sting at full strength: the fade starts only after the sting has sounded', () => {
    const score = lateSting(10, 9);
    const fadeSec = fadeOutFor(score);
    expect(10 - fadeSec).toBeGreaterThanOrEqual(9.6 - 1e-9); // the fade begins after the sting and its 0.6 s of body
    const { left, right } = renderScore(score);
    const peakIn = (fromSec: number, toSec: number) => {
      const a = Math.round(fromSec * SR);
      const b = Math.round(toSec * SR);
      return peakOf(left.subarray(a, b), right.subarray(a, b));
    };
    // A plain two-second fade would have held the sting back to about half level (a gain of 0.5 at 9.0 s);
    // here the sting itself is the loudest moment of the cue and the cue still ends in silence.
    expect(peakIn(9, 9.4)).toBeGreaterThanOrEqual(peakOf(left, right) * 0.95);
    expect(peakIn(9.95, 10)).toBeLessThan(peakOf(left, right) * 0.05);
  });
});

describe('exact length (Requirement 6.2)', () => {
  it.each([7.333, 12.34567, 9.999])('writes ceil(durationSec x 44,100) frames for a %f second cue', (durationSec) => {
    const plan = composePlan({ seed: 1, mood: 'dread', durationSec: 10 });
    const score: Score = { ...handScore(10, [track('bass', 'crypt-bass', [note(0.5, 2, 40)])]), durationSec, plan: { ...plan, durationSec, sections: [{ ...plan.sections[0], startSec: 0, endSec: durationSec }], cues: [] } };
    expect(Number.isInteger(durationSec * SR)).toBe(false);
    const { left, right, stats } = renderScore(score);
    expect(left.length).toBe(Math.ceil(durationSec * SR));
    expect(right.length).toBe(Math.ceil(durationSec * SR));
    expect(stats.durationSec).toBeCloseTo(Math.ceil(durationSec * SR) / SR, 9);
  });
});
