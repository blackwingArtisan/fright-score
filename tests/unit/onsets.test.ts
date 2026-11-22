import { describe, expect, it } from 'vitest';
import { findOnsets, pairOnsets } from '../../scripts/mcp/onsets';
import type { WavInfo } from '../../src/wav/wav';

const RATE = 44_100;

/** A mono WavInfo made of silent stretches and 440 Hz tones, each given as [startSec, lengthSec]. */
function buffer(totalSec: number, tones: [number, number][], amplitude = 0.5): WavInfo {
  const frameCount = Math.round(totalSec * RATE);
  const samples = new Int16Array(frameCount);
  for (const [startSec, lengthSec] of tones) {
    const from = Math.round(startSec * RATE);
    const to = Math.min(frameCount, from + Math.round(lengthSec * RATE));
    for (let i = from; i < to; i++) samples[i] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * 440 * (i - from)) / RATE + 1));
  }
  return { sampleRate: RATE, channels: 1, bitsPerSample: 16, frameCount, durationSec: totalSec, samples };
}

describe('findOnsets', () => {
  it('finds one onset within 2 ms of a tone that follows 0.6 s of silence', () => {
    const onsets = findOnsets(buffer(2, [[0.6, 0.5]]));
    expect(onsets).toHaveLength(1);
    expect(Math.abs(onsets[0] - 0.6)).toBeLessThanOrEqual(0.002);
  });

  it('finds none when the silence before the tone is only 0.3 s', () => {
    expect(findOnsets(buffer(2, [[0.3, 0.5]]))).toEqual([]);
  });

  it('finds two onsets for two tones with a silent gap between them', () => {
    const onsets = findOnsets(buffer(4, [[0.6, 0.4], [2.5, 0.4]]));
    expect(onsets).toHaveLength(2);
    expect(Math.abs(onsets[0] - 0.6)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(onsets[1] - 2.5)).toBeLessThanOrEqual(0.002);
  });

  it('does not count a tone that follows a gap shorter than 0.5 s', () => {
    expect(findOnsets(buffer(4, [[0.6, 0.4], [1.3, 0.4]]))).toHaveLength(1);
  });

  it('finds none in a file that starts loud', () => {
    expect(findOnsets(buffer(2, [[0, 0.5]]))).toEqual([]);
  });

  it('finds none in an all-silent file or in sound below -50 dBFS', () => {
    expect(findOnsets(buffer(2, []))).toEqual([]);
    expect(findOnsets(buffer(2, [[0.6, 0.5]], 0.002))).toEqual([]);
  });

  it('is deterministic', () => {
    const info = buffer(3, [[0.7, 0.3]]);
    expect(findOnsets(info)).toEqual(findOnsets(info));
  });
});

describe('pairOnsets', () => {
  it('pairs each expected time with the nearest unused onset', () => {
    expect(pairOnsets([2, 1], [0.9, 2.2])).toEqual([
      { expectedHitSec: 1, measuredSec: 0.9 },
      { expectedHitSec: 2, measuredSec: 2.2 },
    ]);
  });

  it('uses an onset once', () => {
    expect(pairOnsets([1, 1.2], [1.1])).toEqual([
      { expectedHitSec: 1, measuredSec: 1.1 },
      { expectedHitSec: 1.2, measuredSec: null },
    ]);
  });

  it('leaves null beyond 500 ms and when there are no onsets', () => {
    expect(pairOnsets([1], [1.6])).toEqual([{ expectedHitSec: 1, measuredSec: null }]);
    expect(pairOnsets([1], [1.5])).toEqual([{ expectedHitSec: 1, measuredSec: 1.5 }]);
    expect(pairOnsets([3], [])).toEqual([{ expectedHitSec: 3, measuredSec: null }]);
  });
});
