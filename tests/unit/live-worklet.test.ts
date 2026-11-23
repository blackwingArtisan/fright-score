import { afterEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_FRAMES } from '../../src/web/views/chip';
import { LIVE_PROCESSOR, type LiveCommand, type LiveReport } from '../../src/web/live/protocol';

const QUANTUM = 128; // frames per AudioWorklet render quantum

interface Processor {
  port: { onmessage: ((event: { data: LiveCommand }) => void) | null; postMessage: (message: LiveReport) => void };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

/** Load the worklet module against a stand-in AudioWorklet scope and return its processor class. */
async function loadProcessor(sampleRate: number): Promise<new () => Processor> {
  const registered = new Map<string, new () => Processor>();
  class FakeBase {
    readonly port = { onmessage: null, postMessage: vi.fn() };
  }
  vi.stubGlobal('AudioWorkletProcessor', FakeBase);
  vi.stubGlobal('sampleRate', sampleRate);
  vi.stubGlobal('registerProcessor', (name: string, ctor: new () => Processor) => registered.set(name, ctor));
  vi.resetModules();
  await import('../../src/web/live/chip.worklet');
  const ctor = registered.get(LIVE_PROCESSOR);
  if (!ctor) throw new Error('the worklet did not register its processor');
  return ctor;
}

/** Run the processor for `seconds` of audio and return the reports it posted, with the frame each came at. */
function runFor(processor: Processor, seconds: number, rate: number): { reports: LiveReport[]; framesAtReport: number[] } {
  const posted: LiveReport[] = [];
  const framesAtReport: number[] = [];
  let frames = 0;
  processor.port.postMessage = (report) => {
    posted.push(report);
    framesAtReport.push(frames);
  };
  const outputs = [[new Float32Array(QUANTUM), new Float32Array(QUANTUM)]];
  while (frames < seconds * rate) {
    processor.process([], outputs);
    frames += QUANTUM;
  }
  return { reports: posted, framesAtReport };
}
describe('the live chip worklet reports to the page (Requirement 1.5c, 1.5d)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([44_100, 48_000])('posts about 30 reports a second at %i Hz', async (rate) => {
    const Processor = await loadProcessor(rate);
    const processor = new Processor();
    processor.port.onmessage?.({ data: { type: 'patch', patchId: 'glass-bell' } });
    processor.port.onmessage?.({ data: { type: 'on', key: 'a', midi: 72, velocity: 0.8 } });
    const { reports, framesAtReport } = runFor(processor, 3, rate);
    // Every report arrives within one render quantum of its 1/30 s mark, so the rate stays near 30 a second.
    expect(reports.length).toBeGreaterThanOrEqual(3 * 28);
    expect(reports.length).toBeLessThanOrEqual(3 * 31);
    const gaps = framesAtReport.slice(1).map((f, i) => f - framesAtReport[i]);
    for (const gap of gaps) {
      expect(gap / rate).toBeGreaterThanOrEqual(1 / 30 - 1e-9);
      expect(gap / rate).toBeLessThan(1 / 30 + (QUANTUM / rate) + 1e-9);
    }
  });

  it('carries live envelope levels and the frame count from the audio thread', async () => {
    const Processor = await loadProcessor(44_100);
    const processor = new Processor();
    processor.port.onmessage?.({ data: { type: 'patch', patchId: 'choir-organ' } });
    processor.port.onmessage?.({ data: { type: 'on', key: 'a', midi: 48, velocity: 1 } });
    const { reports } = runFor(processor, 1, 44_100);
    const last = reports.at(-1)!;
    expect(last.type).toBe('report');
    expect(last.voices).toBe(1);
    expect(last.ops).toHaveLength(4);
    expect(Math.max(...last.ops)).toBeGreaterThan(0.1);
    for (let i = 1; i < reports.length; i++) expect(reports[i].framesRendered).toBeGreaterThan(reports[i - 1].framesRendered);
  });

  it('keeps the page history at 90 reports, which is three seconds of them', () => {
    expect(HISTORY_FRAMES).toBe(90);
    expect(HISTORY_FRAMES / 30).toBe(3);
  });
});
