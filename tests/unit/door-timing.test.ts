import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOOR_TIMING, formatOffset, planScare } from '../../src/web/views/door-timing';

describe('planScare', () => {
  it('starts the sting at the event, 0.4 s into the file, and lands the hit 0.6 s later', () => {
    for (const t of [0, 0.5, 3.1415, 42, 1234.5678]) {
      const plan = planScare(t);
      expect(plan.stingStartSec).toBe(t);
      expect(plan.stingOffsetSec).toBeCloseTo(0.4, 12);
      expect(plan.hitSec).toBeCloseTo(t + 0.6, 9);
      expect(plan.hitDelaySec).toBeCloseTo(0.6, 9);
      expect(plan.cutStartSec).toBe(t);
      expect(plan.cutEndSec).toBeCloseTo(t + 0.08, 12);
    }
  });

  it('follows custom hit and pre-silence values', () => {
    const plan = planScare(10, { hitInFileSec: 2, preSilenceSec: 0.5, cutSec: 0.2 });
    expect(plan.stingOffsetSec).toBeCloseTo(1.5, 12);
    expect(plan.hitDelaySec).toBeCloseTo(0.5, 12);
    expect(plan.cutEndSec).toBeCloseTo(10.2, 12);
  });

  it('matches the defaults in fright_score_cue.gd', () => {
    const gd = readFileSync('examples/godot/addons/fright_score/fright_score_cue.gd', 'utf8');
    const read = (name: string): number => Number(new RegExp(`@export var ${name} := ([0-9.]+)`).exec(gd)?.[1]);
    expect(DOOR_TIMING.hitInFileSec).toBe(read('sting_hit_sec'));
    expect(DOOR_TIMING.preSilenceSec).toBe(read('pre_silence_sec'));
    expect(DOOR_TIMING.cutSec).toBe(read('cut_sec'));
    expect(DOOR_TIMING.ringSec).toBe(read('ring_sec'));
    expect(DOOR_TIMING.returnSec).toBe(read('return_sec'));
  });

  it('throws RangeError for bad input', () => {
    expect(() => planScare(-1)).toThrow(RangeError);
    expect(() => planScare(Number.NaN)).toThrow(RangeError);
    expect(() => planScare(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => planScare(1, { cutSec: -0.1 })).toThrow(RangeError);
    expect(() => planScare(1, { hitInFileSec: 0.5, preSilenceSec: 0.6 })).toThrow(RangeError);
  });
});

describe('formatOffset', () => {
  it('shows three decimals', () => {
    expect(formatOffset(0.6)).toBe('0.600');
    expect(formatOffset(0.60049)).toBe('0.600');
    expect(formatOffset(0.5)).toBe('0.500');
  });
});
