import { describe, expect, it } from 'vitest';
import { integratedLoudness, kWeighting, MOOD_LOUDNESS_LUFS } from '../../src/engine/loudness';
import { CEILING_DB } from '../../src/engine/master';
import { renderScore } from '../../src/engine/render';
import { arrange } from '../../src/score/arranger';
import { composePlan } from '../../src/score/composer';
import { MOODS } from '../../src/score/schema';

const SR = 44_100;

function sine(hz: number, amplitude: number, seconds: number, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

describe('integrated loudness (ITU-R BS.1770)', () => {
  it('reads a full-scale 997 Hz sine in one channel as -3.01 LUFS, the standard reference', () => {
    const left = sine(997, 1, 5);
    const right = new Float32Array(left.length);
    expect(integratedLoudness(SR, left, right)).toBeCloseTo(-3.01, 1);
  });

  it('matches the coefficients tabled in BS.1770 at 48 kHz', () => {
    const [shelf, highpass] = kWeighting(48_000);
    const table = [
      [shelf.b0, 1.53512485958697],
      [shelf.b1, -2.69169618940638],
      [shelf.b2, 1.19839281085285],
      [shelf.a1, -1.69065929318241],
      [shelf.a2, 0.73248077421585],
      [highpass.b0, 1],
      [highpass.b1, -2],
      [highpass.b2, 1],
      [highpass.a1, -1.99004745483398],
      [highpass.a2, 0.99007225036621],
    ];
    for (const [got, want] of table) expect(got).toBeCloseTo(want, 10);
  });

  it('works at 48 kHz too, and tracks gain one to one', () => {
    const loud = integratedLoudness(48_000, sine(997, 1, 4, 48_000));
    const quiet = integratedLoudness(48_000, sine(997, 0.1, 4, 48_000));
    expect(loud).toBeCloseTo(-3.01, 1);
    expect(loud - quiet).toBeCloseTo(20, 1);
  });

  it('weights lows down and highs up (K-weighting)', () => {
    const low = integratedLoudness(SR, sine(40, 0.5, 4));
    const mid = integratedLoudness(SR, sine(997, 0.5, 4));
    const high = integratedLoudness(SR, sine(6000, 0.5, 4));
    expect(low).toBeLessThan(mid - 0.5);
    expect(high).toBeGreaterThan(mid + 2);
  });

  it('gates out silence, so a long quiet tail does not drag the reading down', () => {
    const tone = sine(997, 0.5, 4);
    const padded = new Float32Array(tone.length * 3);
    padded.set(tone, 0);
    // Only the few blocks that straddle the tone's end pull the reading down, and only slightly.
    expect(Math.abs(integratedLoudness(SR, padded) - integratedLoudness(SR, tone))).toBeLessThan(0.3);
  });

  it('returns -Infinity for silence and for audio shorter than one 400 ms block', () => {
    expect(integratedLoudness(SR, new Float32Array(SR))).toBe(-Infinity);
    expect(integratedLoudness(SR, sine(997, 1, 0.2))).toBe(-Infinity);
  });
});

describe('mood loudness ceilings', () => {
  it('keeps every mood at or under its ceiling, and the lullaby quieter than the chase', () => {
    const measured: Record<string, number> = {};
    for (const mood of MOODS) {
      const plan = composePlan({ seed: 3, mood, durationSec: 12 });
      const result = renderScore(arrange(plan, 3));
      const lufs = integratedLoudness(SR, result.left, result.right);
      expect(lufs).toBeLessThanOrEqual(MOOD_LOUDNESS_LUFS[mood] + 0.05);
      expect(result.stats.loudnessLufs).toBeCloseTo(lufs, 1);
      expect(result.stats.truePeakDb).toBeLessThanOrEqual(CEILING_DB + 1e-3);
      measured[mood] = lufs;
    }
    expect(measured.lullaby).toBeLessThan(measured.chase - 3);
  });
});
