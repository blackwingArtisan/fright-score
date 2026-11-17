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
});
