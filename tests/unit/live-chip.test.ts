import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveChip } from '../../src/web/live/live-chip';
import { HISTORY_FRAMES } from '../../src/web/views/chip';
import type { LiveReport } from '../../src/web/live/protocol';

/** A stand-in for the page's audio context and the worklet node, enough to wake the chip. */
function fakeAudio() {
  const nodes: { port: { onmessage: ((e: { data: LiveReport }) => void) | null; postMessage: ReturnType<typeof vi.fn> } }[] = [];
  class FakeNode {
    port = { onmessage: null as ((e: { data: LiveReport }) => void) | null, postMessage: vi.fn() };
    constructor() {
      nodes.push(this);
    }
    connect(): void {}
  }
  vi.stubGlobal('AudioWorkletNode', FakeNode);
  const addModule = vi.fn(async () => {});
  const ctx = { state: 'running', resume: vi.fn(async () => {}), audioWorklet: { addModule } };
  return { audio: () => ({ ctx: ctx as unknown as AudioContext, output: {} as AudioNode }), nodes, addModule };
}

const report = (level: number, framesRendered = 0): LiveReport => ({ type: 'report', ops: [level, level / 2, level / 4, 0], voices: 1, midi: 60, framesRendered, peak: 0.1 });

describe('LiveChip, the page side of the live chip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not load the worklet until the first note (Requirement 1.6b)', async () => {
    const { audio, nodes, addModule } = fakeAudio();
    const chip = new LiveChip(audio);
    chip.setPatch('glass-bell');
    chip.noteOff('a');
    chip.panic();
    expect(chip.awake).toBe(false);
    expect(addModule).not.toHaveBeenCalled();
    expect(nodes).toHaveLength(0);

    await chip.noteOn('a', 60);
    expect(chip.awake).toBe(true);
    expect(addModule).toHaveBeenCalledTimes(1);
    expect(nodes).toHaveLength(1);
    // The patch chosen before waking is sent first, then the note.
    expect(nodes[0].port.postMessage.mock.calls.map(([m]) => m.type)).toEqual(['patch', 'on']);
    expect(nodes[0].port.postMessage.mock.calls[0][0].patchId).toBe('glass-bell');

    // A second note reuses the same worklet.
    await chip.noteOn('b', 64);
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  it('keeps the last three seconds of operator levels, newest last (Requirement 1.5d)', async () => {
    const { audio, nodes } = fakeAudio();
    const chip = new LiveChip(audio);
    await chip.noteOn('a', 60);
    const send = nodes[0].port.onmessage!;
    // Three seconds of reports at 30 a second fill the history exactly; four seconds only keep the newest three.
    for (let n = 1; n <= 4 * 30; n++) send({ data: report(n / 120, n * 1470) });
    expect(HISTORY_FRAMES).toBe(3 * 30);
    expect(chip.history).toHaveLength(HISTORY_FRAMES);
    expect(chip.history.at(-1)![0]).toBeCloseTo(1, 9);
    expect(chip.history[0][0]).toBeCloseTo(31 / 120, 9);
    expect(chip.latest.framesRendered).toBe(120 * 1470);
  });

  it('remembers the loudest peak since the chip woke up', async () => {
    const { audio, nodes } = fakeAudio();
    const chip = new LiveChip(audio);
    await chip.noteOn('a', 60);
    const send = nodes[0].port.onmessage!;
    for (const peak of [0.2, 0.6, 0.3]) send({ data: { ...report(1), peak } });
    expect(chip.latest.peak).toBe(0.3);
    expect(chip.peakEver).toBe(0.6);
  });
});
