import { describe, expect, it } from 'vitest';
import { Envelope, decayCoefficient } from '../../src/engine/envelope';

const SR = 1000;

function run(env: Envelope, samples: number): number[] {
  return Array.from({ length: samples }, () => env.next());
}

describe('five-stage envelope', () => {
  it('rises linearly to full scale in attackSec', () => {
    const env = new Envelope({ attackSec: 0.1, decaySec: 1, sustain: 0.5, sustainDecaySec: 0, releaseSec: 0.2 }, SR);
    env.noteOn();
    const out = run(env, 100);
    expect(out[49]).toBeCloseTo(0.5, 2);
    expect(out[99]).toBeCloseTo(1, 6);
    expect(env.stage).toBe('decay');
  });

  it('decays to the sustain level and holds there', () => {
    const env = new Envelope({ attackSec: 0, decaySec: 0.2, sustain: 0.4, sustainDecaySec: 0, releaseSec: 0.2 }, SR);
    env.noteOn();
    run(env, 1000);
    expect(env.stage).toBe('sustain');
    expect(env.level).toBeCloseTo(0.4, 3);
  });

  it('keeps falling during sustain when sustainDecaySec is set', () => {
    const env = new Envelope({ attackSec: 0, decaySec: 0.05, sustain: 0.8, sustainDecaySec: 1, releaseSec: 0.2 }, SR);
    env.noteOn();
    run(env, 200);
    const before = env.level;
    run(env, 300);
    expect(env.level).toBeLessThan(before);
  });

  it('releases to silence within releaseSec (60 dB fall) and turns off', () => {
    const env = new Envelope({ attackSec: 0, decaySec: 0.01, sustain: 1, sustainDecaySec: 0, releaseSec: 0.5 }, SR);
    env.noteOn();
    run(env, 50);
    env.noteOff();
    run(env, 500);
    expect(env.level).toBeLessThan(0.0011);
    run(env, 200);
    expect(env.active).toBe(false);
    expect(env.level).toBe(0);
  });

  it('releases from the middle of the attack', () => {
    const env = new Envelope({ attackSec: 1, decaySec: 1, sustain: 1, sustainDecaySec: 0, releaseSec: 0.1 }, SR);
    env.noteOn();
    run(env, 100);
    expect(env.level).toBeCloseTo(0.1, 2);
    env.noteOff();
    expect(env.stage).toBe('release');
    run(env, 300);
    expect(env.active).toBe(false);
  });

  it('chokes faster than the patch release', () => {
    const slow = new Envelope({ attackSec: 0, decaySec: 0.01, sustain: 1, sustainDecaySec: 0, releaseSec: 2 }, SR);
    const choked = new Envelope({ attackSec: 0, decaySec: 0.01, sustain: 1, sustainDecaySec: 0, releaseSec: 2 }, SR);
    for (const e of [slow, choked]) {
      e.noteOn();
      run(e, 20);
    }
    slow.noteOff();
    choked.noteOff(0.05, SR);
    run(slow, 60);
    run(choked, 60);
    expect(choked.level).toBeLessThan(slow.level / 10);
  });

  it('computes 60 dB decay coefficients', () => {
    const c = decayCoefficient(1, SR);
    expect(Math.pow(c, SR)).toBeCloseTo(0.001, 6);
    expect(decayCoefficient(0, SR)).toBe(0);
  });
});
