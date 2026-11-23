import { describe, expect, it } from 'vitest';
import { composePlan } from '../../src/score/composer';
import { ScorePlanSchema, parseScorePlan } from '../../src/score/schema';

const valid = composePlan({ seed: 1, mood: 'dread', durationSec: 30 });

describe('score plan schema', () => {
  it('accepts a director plan', () => {
    expect(ScorePlanSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a section that runs past the end', () => {
    const bad = { ...valid, sections: [{ ...valid.sections[0], endSec: 99 }] };
    expect(() => parseScorePlan(bad)).toThrow(/past durationSec/);
  });

  it('rejects a motif whose rhythm does not match its notes', () => {
    const bad = { ...valid, motif: { degrees: [0, 1, 2], rhythmBeats: [1, 1] } };
    expect(() => parseScorePlan(bad)).toThrow(/same length/);
  });

  it('rejects unknown patches, moods and modes', () => {
    expect(ScorePlanSchema.safeParse({ ...valid, palette: { drone: 'kazoo' } }).success).toBe(false);
    expect(ScorePlanSchema.safeParse({ ...valid, mood: 'cheerful' }).success).toBe(false);
    expect(ScorePlanSchema.safeParse({ ...valid, key: { root: 'C', mode: 'ionian' } }).success).toBe(false);
  });

  it('rejects cues after the end and lengths out of range', () => {
    expect(ScorePlanSchema.safeParse({ ...valid, cues: [{ atSec: 31, kind: 'sting' }] }).success).toBe(false);
    expect(ScorePlanSchema.safeParse({ ...valid, durationSec: 2 }).success).toBe(false);
    expect(ScorePlanSchema.safeParse({ ...valid, durationSec: 301 }).success).toBe(false);
  });

  it.each([
    ['ends at the moment it starts', 10, 10],
    ['ends before it starts', 12, 8],
  ])('rejects a section that %s, naming the section', (_label, startSec, endSec) => {
    const second = { ...valid.sections[0], name: 'Broken', startSec, endSec };
    const bad = { ...valid, sections: [valid.sections[0], second] };
    expect(ScorePlanSchema.safeParse(bad).success).toBe(false);
    // The error path points at the second section (index 1), not the whole plan.
    expect(() => parseScorePlan(bad)).toThrow(/sections\.1: section ends before it starts/);
    expect(() => parseScorePlan(bad)).not.toThrow(/sections\.0/);
  });
});
