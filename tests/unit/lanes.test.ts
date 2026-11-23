import { describe, expect, it } from 'vitest';
import { COLLAPSED_LANES, envelopeGhost, pickLanes } from '../../src/web/views/lanes';

const sounding = (...on: number[]) => Array.from({ length: 8 }, (_, i) => on.includes(i));

describe('pickLanes', () => {
  it('shows the channels that sound, in track order, at most four', () => {
    expect(pickLanes([], sounding(1, 5))).toEqual([0, 1, 2, 5]);
    expect(pickLanes([], sounding(6, 2, 4))).toEqual([0, 2, 4, 6]);
    expect(pickLanes([], sounding(0, 1, 2, 3, 4, 5))).toEqual([0, 1, 2, 3]);
  });

  it('keeps the same height: four rows even when little sounds, none when the cue has fewer channels', () => {
    expect(pickLanes([], sounding())).toHaveLength(COLLAPSED_LANES);
    expect(pickLanes([], [true, false, false])).toEqual([0, 1, 2]);
  });

  it('lets a channel that keeps sounding hold its row against newcomers', () => {
    expect(pickLanes([4, 5, 6, 7], sounding(0, 1, 2, 3, 4, 5, 6, 7))).toEqual([4, 5, 6, 7]);
  });

  it('prefers sounding channels over silent ones that were on show', () => {
    expect(pickLanes([0, 1, 2, 3], sounding(7))).toEqual([0, 1, 2, 7]);
    expect(pickLanes([0, 1, 2, 3], sounding(7))).toContain(7);
  });

  it('is the same for the same input', () => {
    expect(pickLanes([2, 3], sounding(3, 6))).toEqual(pickLanes([2, 3], sounding(3, 6)));
  });
});

describe('envelopeGhost', () => {
  it('keeps the loudest frame of every column, so a short peak is never lost', () => {
    const levels = new Float32Array(100);
    levels[37] = 0.9;
    const ghost = envelopeGhost(levels.length, 10, (f) => levels[f]);
    expect(ghost).toHaveLength(10);
    expect(ghost[3]).toBeCloseTo(0.9, 6);
    expect(Math.max(...ghost)).toBeCloseTo(0.9, 6);
  });

  it('stretches a short cue over more columns than frames, and handles an empty one', () => {
    const ghost = envelopeGhost(4, 16, (f) => (f + 1) / 4);
    expect(ghost).toHaveLength(16);
    expect(ghost[0]).toBeCloseTo(0.25, 6);
    expect(ghost[15]).toBeCloseTo(1, 6);
    expect(envelopeGhost(0, 8, () => 1).every((v) => v === 0)).toBe(true);
  });
});
