import type { PatchId } from '../../engine/patches';
import workletUrl from './chip.worklet.ts?worker&url';
import { HISTORY_FRAMES } from '../views/chip';
import { LIVE_PROCESSOR, type LiveCommand, type LiveReport } from './protocol';

/**
 * Page-side handle for the live FS-666 AudioWorklet. The worklet is loaded on the first note,
 * since browsers only start audio after a user gesture.
 */
export class LiveChip {
  private node: AudioWorkletNode | undefined;
  private loading: Promise<AudioWorkletNode> | undefined;
  private patchId: PatchId = 'wraith-pad';
  /** Latest report from the audio thread. */
  latest: LiveReport = { type: 'report', ops: [0, 0, 0, 0], voices: 0, midi: 0, framesRendered: 0, peak: 0 };
  /** Loudest output peak seen since the chip woke up. */
  peakEver = 0;
  /** Operator levels for the last three seconds, newest last. */
  readonly history: [number, number, number, number][] = [];

  constructor(private readonly audio: () => { ctx: AudioContext; output: AudioNode }) {}

  get awake(): boolean {
    return this.node !== undefined;
  }

  get patch(): PatchId {
    return this.patchId;
  }

  setPatch(patchId: PatchId): void {
    this.patchId = patchId;
    this.send({ type: 'patch', patchId });
  }

  async noteOn(key: string, midi: number, velocity = 0.85): Promise<void> {
    const node = await this.wake();
    node.port.postMessage({ type: 'on', key, midi, velocity } satisfies LiveCommand);
  }

  noteOff(key: string): void {
    this.send({ type: 'off', key });
  }

  panic(): void {
    this.send({ type: 'panic' });
  }

  private send(command: LiveCommand): void {
    this.node?.port.postMessage(command);
  }

  private wake(): Promise<AudioWorkletNode> {
    if (this.node) {
      const { ctx } = this.audio();
      if (ctx.state === 'suspended') void ctx.resume();
      return Promise.resolve(this.node);
    }
    this.loading ??= (async () => {
      const { ctx, output } = this.audio();
      if (ctx.state === 'suspended') await ctx.resume();
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, LIVE_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (event: MessageEvent<LiveReport>) => this.receive(event.data);
      node.port.postMessage({ type: 'patch', patchId: this.patchId } satisfies LiveCommand);
      node.connect(output);
      this.node = node;
      return node;
    })();
    return this.loading;
  }

  private receive(report: LiveReport): void {
    this.latest = report;
    if (report.peak > this.peakEver) this.peakEver = report.peak;
    this.history.push(report.ops);
    if (this.history.length > HISTORY_FRAMES) this.history.shift();
  }
}
