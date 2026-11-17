import { LiveChipCore } from './core';
import { LIVE_PROCESSOR, type LiveCommand } from './protocol';

/*
 * The FS-666 on the browser's audio thread. Every output sample is synthesized here in real time
 * by LiveChipCore, which runs the same operator, envelope and algorithm code as the offline renderer.
 */

// The AudioWorklet global scope is not part of the DOM typings.
declare const sampleRate: number;
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessorBase): void;
declare class AudioWorkletProcessorBase {
  readonly port: MessagePort;
}
const Base = (globalThis as unknown as { AudioWorkletProcessor: typeof AudioWorkletProcessorBase }).AudioWorkletProcessor;

class LiveChipProcessor extends Base {
  private readonly core = new LiveChipCore(sampleRate);
  private readonly reportEvery = Math.round(sampleRate / 30);
  private sinceReport = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<LiveCommand>) => this.core.handle(event.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0] ?? [];
    if (!left) return true;
    this.core.render(left, right);
    this.sinceReport += left.length;
    if (this.sinceReport >= this.reportEvery) {
      this.sinceReport = 0;
      this.port.postMessage(this.core.report());
    }
    return true;
  }
}

registerProcessor(LIVE_PROCESSOR, LiveChipProcessor);
