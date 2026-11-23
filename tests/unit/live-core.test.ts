import { describe, expect, it } from 'vitest';
import { softLimit } from '../../src/engine/master';
import { getPatch } from '../../src/engine/patches';
import { Voice } from '../../src/engine/voice';
import { LiveChipCore } from '../../src/web/live/core';
import { LIVE_GAIN, LIVE_POLYPHONY } from '../../src/web/live/protocol';

const SR = 44_100;
const QUANTUM = 128; // frames per AudioWorklet render quantum

function run(core: LiveChipCore, seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil((seconds * SR) / QUANTUM) * QUANTUM);
  for (let i = 0; i < out.length; i += QUANTUM) core.render(out.subarray(i, i + QUANTUM));
  return out;
}

const peak = (xs: Float32Array) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('live chip core (the AudioWorklet engine)', () => {
  it('is silent until a key is played', () => {
    const core = new LiveChipCore(SR);
    expect(peak(run(core, 0.1))).toBe(0);
    expect(core.report().framesRendered).toBe(Math.ceil((0.1 * SR) / QUANTUM) * QUANTUM);
  });

  it('plays sample for sample what the offline engine plays for the same patch and note', () => {
    const core = new LiveChipCore(SR);
    core.handle({ type: 'patch', patchId: 'glass-bell' });
    core.handle({ type: 'on', key: 'a', midi: 72, velocity: 0.85 });
    const live = run(core, 0.25);
    const reference = new Voice(getPatch('glass-bell'), { midi: 72, velocity: 0.85 }, SR);
    for (let i = 0; i < live.length; i++) {
      expect(live[i]).toBeCloseTo(softLimit(reference.tick() * LIVE_GAIN, 0.7), 6);
    }
  });

  it('reports voices, the note, operator levels and the peak, then resets the peak', () => {
    const core = new LiveChipCore(SR);
    core.handle({ type: 'patch', patchId: 'choir-organ' });
    core.handle({ type: 'on', key: 'a', midi: 48, velocity: 1 });
    run(core, 0.3);
    const report = core.report();
    expect(report.voices).toBe(1);
    expect(report.midi).toBe(48);
    expect(Math.max(...report.ops)).toBeGreaterThan(0.1);
    expect(report.peak).toBeGreaterThan(0.01);
    expect(report.peak).toBeLessThan(1);
    expect(core.report().peak).toBe(0);
  });

  it('releases on key up and frees the voice once its tail has died away', () => {
    const core = new LiveChipCore(SR);
    core.handle({ type: 'patch', patchId: 'music-box' });
    core.handle({ type: 'on', key: 'a', midi: 72, velocity: 0.8 });
    run(core, 0.2);
    core.handle({ type: 'off', key: 'a' });
    const tail = run(core, 6);
    expect(core.voiceCount).toBe(0);
    expect(peak(tail.subarray(tail.length - QUANTUM))).toBe(0);
  });

  it('caps polyphony by stealing the oldest voice and never clips a full chord', () => {
    const core = new LiveChipCore(SR);
    core.handle({ type: 'patch', patchId: 'screech' });
    for (let i = 0; i < LIVE_POLYPHONY + 3; i++) core.handle({ type: 'on', key: `k${i}`, midi: 60 + i, velocity: 1 });
    expect(core.voiceCount).toBe(LIVE_POLYPHONY);
    const out = run(core, 0.5);
    expect(peak(out)).toBeLessThan(1);
    expect(peak(out)).toBeGreaterThan(0.05);
  });

  it('switches patches for new notes and silences everything on panic', () => {
    const core = new LiveChipCore(SR);
    core.handle({ type: 'patch', patchId: 'crypt-bass' });
    expect(core.patchId).toBe('crypt-bass');
    core.handle({ type: 'on', key: 'a', midi: 36, velocity: 1 });
    core.handle({ type: 'on', key: 'b', midi: 43, velocity: 1 });
    run(core, 0.2);
    core.handle({ type: 'panic' });
    run(core, 1);
    expect(core.voiceCount).toBe(0);
  });

  // Requirement 1.4a: when all six voices are busy, a new note takes the oldest released voice first.
  describe('voice stealing order', () => {
    interface Held {
      key: string;
      midi: number;
    }
    // Six notes with no octave or fifth between them, so their tones do not blur into each other.
    const held: Held[] = [48, 50, 53, 58, 63, 66].map((midi, i) => ({ key: `k${i}`, midi }));
    const FRAMES = 64 * QUANTUM; // each phase of the scenario
    const STOLEN_BY = { key: 'new', midi: 71 };

    /** The last phase of the live core's output: six notes, `release` released, then a seventh note. */
    function scenario(release: string[]) {
      const core = new LiveChipCore(SR);
      core.handle({ type: 'patch', patchId: 'choir-organ' });
      for (const h of held) core.handle({ type: 'on', key: h.key, midi: h.midi, velocity: 0.8 });
      run(core, FRAMES / SR);
      for (const key of release) core.handle({ type: 'off', key });
      run(core, FRAMES / SR);
      core.handle({ type: 'on', key: STOLEN_BY.key, midi: STOLEN_BY.midi, velocity: 0.8 });
      const after = run(core, FRAMES / SR);
      return { core, after };
    }

    /** The same three phases from plain Voices: `victim` is dropped when the seventh note arrives. */
    function reference(release: string[], victim: string): Float32Array {
      const voices = new Map<string, Voice>();
      for (const h of held) voices.set(h.key, new Voice(getPatch('choir-organ'), { midi: h.midi, velocity: 0.8 }, SR));
      const sum = (n: number) => {
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          let x = 0;
          for (const v of voices.values()) x += v.tick();
          out[i] = softLimit(x * LIVE_GAIN, 0.7);
        }
        return out;
      };
      sum(FRAMES);
      for (const key of release) voices.get(key)!.noteOff();
      sum(FRAMES);
      voices.delete(victim);
      voices.set(STOLEN_BY.key, new Voice(getPatch('choir-organ'), { midi: STOLEN_BY.midi, velocity: 0.8 }, SR));
      return sum(FRAMES);
    }

    const maxDiff = (a: Float32Array, b: Float32Array) => a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);

    it('drops the oldest released voice, not the oldest voice', () => {
      const { core, after } = scenario(['k2']);
      expect(core.voiceCount).toBe(LIVE_POLYPHONY);
      expect(maxDiff(after, reference(['k2'], 'k2'))).toBeLessThan(1e-6);
      // The plausible wrong answer, dropping the oldest voice k0, sounds different.
      expect(maxDiff(after, reference(['k2'], 'k0'))).toBeGreaterThan(0.01);
    });

    it('drops the oldest voice when none has been released', () => {
      const { core, after } = scenario([]);
      expect(core.voiceCount).toBe(LIVE_POLYPHONY);
      expect(maxDiff(after, reference([], 'k0'))).toBeLessThan(1e-6);
      expect(maxDiff(after, reference([], 'k5'))).toBeGreaterThan(0.01);
    });

    it('drops the oldest of several released voices, whatever order they were released in', () => {
      const { after } = scenario(['k4', 'k1', 'k3']); // released newest first: k1 is still the oldest released
      expect(maxDiff(after, reference(['k4', 'k1', 'k3'], 'k1'))).toBeLessThan(1e-6);
      expect(maxDiff(after, reference(['k4', 'k1', 'k3'], 'k4'))).toBeGreaterThan(0.01);
    });
  });
});
