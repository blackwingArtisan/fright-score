import { describe, expect, it } from 'vitest';
import { PATCHES, PATCH_IDS, getPatch } from '../../src/engine/patches';
import { Voice, midiToHz } from '../../src/engine/voice';

function rms(v: Voice, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = v.tick();
    s += x * x;
  }
  return Math.sqrt(s / n);
}

describe('voice', () => {
  it('converts MIDI to Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 9);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });

  it('every patch in the library sounds and stays finite', () => {
    for (const id of PATCH_IDS) {
      const v = new Voice(getPatch(id), { midi: 48, velocity: 0.8 }, 44_100);
      let energy = 0;
      for (let i = 0; i < 44_100; i++) {
        const x = v.tick();
        expect(Number.isFinite(x)).toBe(true);
        energy += x * x;
      }
      expect(energy, id).toBeGreaterThan(0);
    }
  });

  it('louder velocity gives a louder note', () => {
    const soft = rms(new Voice(PATCHES['music-box'], { midi: 72, velocity: 0.2 }), 8000);
    const loud = rms(new Voice(PATCHES['music-box'], { midi: 72, velocity: 1 }), 8000);
    expect(loud).toBeGreaterThan(soft * 3);
  });

  it('goes inactive after note-off and release', () => {
    const v = new Voice(PATCHES['crypt-bass'], { midi: 40, velocity: 1 });
    for (let i = 0; i < 4410; i++) v.tick();
    expect(v.active).toBe(true);
    v.noteOff();
    for (let i = 0; i < 44_100; i++) v.tick();
    expect(v.active).toBe(false);
  });

  it('pitch bend lowers the pitch over time', () => {
    const count = (bendSemis: number) => {
      const v = new Voice(PATCHES['choir-organ'], { midi: 69, velocity: 1, bendSemis, bendSec: 0.05 });
      let prev = 0;
      let crossings = 0;
      for (let i = 0; i < 44_100; i++) {
        const x = v.tick();
        if (prev < 0 && x >= 0) crossings++;
        prev = x;
      }
      return crossings;
    };
    expect(count(-12)).toBeLessThan(count(0) * 0.6);
  });
});
