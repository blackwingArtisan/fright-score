import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderScore } from '../../src/engine/render';
import { truePeakOf, dbToGain } from '../../src/engine/master';
import { arrange } from '../../src/score/arranger';
import { composePlan } from '../../src/score/composer';
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

  it('never exceeds the -1 dBFS true-peak ceiling', () => {
    expect(truePeakOf(result.left, result.right)).toBeLessThanOrEqual(dbToGain(-1) + 1e-6);
    expect(result.stats.truePeakDb).toBeCloseTo(-1, 3);
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
