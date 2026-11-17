import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderScore } from '../../src/engine/render';
import { truePeakOf, dbToGain, peakOf, CEILING_DB, FADE_IN_SEC } from '../../src/engine/master';
import { arrange } from '../../src/score/arranger';
import { composePlan } from '../../src/score/composer';
import { MOODS } from '../../src/score/schema';
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
