import { describe, expect, it } from 'vitest';
import { createDirector } from '../../src/director';
import { scoreFromRequest } from '../../src/score/pipeline';
import { DEMO_SCENE, DEMO_SEED } from '../../src/web/demo';
import {
  HEARTBEAT_BPM,
  HEARTBEAT_PERIOD_SEC,
  HEARTBEAT_STILL,
  NON_DRONE_SHARE,
  beatShare,
  heartbeatLevel,
  restingPulse,
  stingTag,
} from '../../src/web/views/dread';

describe('dread at rest: the heartbeat', () => {
  it('beats about 50 times a minute', () => {
    expect(HEARTBEAT_BPM).toBe(50);
    expect(HEARTBEAT_PERIOD_SEC).toBeCloseTo(1.2, 6);
  });

  it('has a strong beat, a softer second beat, and a rest, and repeats every period', () => {
    const lub = heartbeatLevel(0);
    const dub = heartbeatLevel(0.28);
    const rest = heartbeatLevel(0.9);
    expect(lub).toBeGreaterThan(0.95);
    expect(dub).toBeGreaterThan(0.4);
    expect(dub).toBeLessThan(lub);
    expect(rest).toBeLessThan(0.1);
    expect(heartbeatLevel(0.28 + 5 * HEARTBEAT_PERIOD_SEC)).toBeCloseTo(dub, 6);
  });

  it('stays within 0..1', () => {
    for (let t = 0; t < 6; t += 0.01) {
      const level = heartbeatLevel(t);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('holds one still level under reduced motion, whatever the time', () => {
    for (const t of [0, 0.28, 0.9, 7.3]) expect(restingPulse(t, true)).toBe(HEARTBEAT_STILL);
    expect(restingPulse(0, false)).toBe(heartbeatLevel(0));
  });

  it('ties the beat to the drone: the drone beats at full strength, other channels less', () => {
    expect(beatShare('drone')).toBe(1);
    expect(beatShare('bass')).toBe(NON_DRONE_SHARE);
    expect(beatShare(undefined)).toBe(NON_DRONE_SHARE);
  });
});

describe('dread at rest: the sting tag', () => {
  it('writes minutes and whole seconds', () => {
    expect(stingTag(70)).toBe('1:10');
    expect(stingTag(9)).toBe('0:09');
    expect(stingTag(125.4)).toBe('2:05');
  });

  it("reads the demo's sting time from the cue", async () => {
    const score = await scoreFromRequest(createDirector('local', {}), { seed: DEMO_SEED, scene: DEMO_SCENE });
    const stings = score.plan.cues.filter((c) => c.kind === 'sting');
    expect(stings).toHaveLength(1);
    expect(stingTag(stings[0].atSec)).toBe('1:10');
  });
});
