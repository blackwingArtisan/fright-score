import { softLimit } from '../../engine/master';
import { getPatch, type Patch } from '../../engine/patches';
import { Voice } from '../../engine/voice';
import { LIVE_GAIN, LIVE_POLYPHONY, type LiveCommand, type LiveReport } from './protocol';

interface LiveVoice {
  key: string;
  voice: Voice;
  midi: number;
}

/**
 * The real-time FS-666: voices started and released by commands, synthesized block by block.
 * It uses the same Voice, Operator and Envelope classes as the offline renderer, so the keyboard
 * plays exactly the chip that renders the cues. The AudioWorklet wraps this; tests drive it directly.
 */
export class LiveChipCore {
  private patch: Patch = getPatch('wraith-pad');
  private voices: LiveVoice[] = [];
  private framesRendered = 0;
  private peak = 0;

  constructor(private readonly sampleRate: number) {}

  get voiceCount(): number {
    return this.voices.length;
  }

  get patchId(): Patch['id'] {
    return this.patch.id;
  }

  handle(command: LiveCommand): void {
    switch (command.type) {
      case 'patch':
        this.patch = getPatch(command.patchId);
        break;
      case 'on': {
        if (this.voices.length >= LIVE_POLYPHONY) {
          // Voice stealing, as in the renderer: the oldest released voice, else the oldest voice.
          const released = this.voices.findIndex((v) => v.voice.isReleased);
          this.voices.splice(released >= 0 ? released : 0, 1);
        }
        const voice = new Voice(this.patch, { midi: command.midi, velocity: command.velocity }, this.sampleRate);
        this.voices.push({ key: command.key, voice, midi: command.midi });
        break;
      }
      case 'off':
        for (const v of this.voices) if (v.key === command.key && !v.voice.isReleased) v.voice.noteOff();
        break;
      case 'panic':
        for (const v of this.voices) if (!v.voice.isReleased) v.voice.noteOff(0.05);
        break;
    }
  }

  /** Synthesize the next `left.length` frames into `left` (and `right`, when given). */
  render(left: Float32Array, right?: Float32Array): void {
    const n = left.length;
    const voices = this.voices;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let v = 0; v < voices.length; v++) sum += voices[v].voice.tick();
      const y = softLimit(sum * LIVE_GAIN, 0.7);
      left[i] = y;
      if (right) right[i] = y;
      const a = Math.abs(y);
      if (a > this.peak) this.peak = a;
    }
    this.voices = voices.filter((v) => !(v.voice.isReleased && !v.voice.active));
    this.framesRendered += n;
  }

  /** Snapshot for the visualizer; resets the running peak. */
  report(): LiveReport {
    const ops: [number, number, number, number] = [0, 0, 0, 0];
    for (const v of this.voices) {
      for (let o = 0; o < 4; o++) ops[o] = Math.max(ops[o], v.voice.ops[o].env.level);
    }
    const latest = this.voices[this.voices.length - 1];
    const report: LiveReport = {
      type: 'report',
      ops,
      voices: this.voices.length,
      midi: latest?.midi ?? 0,
      framesRendered: this.framesRendered,
      peak: this.peak,
    };
    this.peak = 0;
    return report;
  }
}
