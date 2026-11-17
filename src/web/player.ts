/**
 * Plays a rendered cue with Web Audio and reports the playhead.
 * The AudioContext is created on the first Play click, as browsers require.
 */
export class Player {
  private ctx: AudioContext | undefined;
  private buffer: AudioBuffer | undefined;
  private source: AudioBufferSourceNode | undefined;
  private startedAt = 0;
  private offset = 0;
  analyser: AnalyserNode | undefined;
  onEnded: (() => void) | undefined;

  get playing(): boolean {
    return this.source !== undefined;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  /** Current playhead in seconds. */
  get position(): number {
    if (!this.ctx || !this.source) return this.offset;
    return Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44_100 });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  load(left: Float32Array, right: Float32Array, sampleRate: number): void {
    this.stop();
    this.offset = 0;
    const ctx = this.ensureContext();
    const buffer = ctx.createBuffer(2, left.length, sampleRate);
    buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    this.buffer = buffer;
  }

  async play(): Promise<void> {
    if (!this.buffer || this.source) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.offset >= this.duration - 0.01) this.offset = 0;
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.analyser!);
    source.onended = () => {
      if (this.source !== source) return;
      this.offset = this.position;
      this.source = undefined;
      if (this.offset >= this.duration - 0.05) this.offset = 0;
      this.onEnded?.();
    };
    this.startedAt = ctx.currentTime;
    source.start(0, this.offset);
    this.source = source;
  }

  pause(): void {
    if (!this.source) return;
    this.offset = this.position;
    const s = this.source;
    this.source = undefined;
    s.onended = null;
    s.stop();
  }

  stop(): void {
    this.pause();
    this.offset = 0;
  }

  async seek(sec: number): Promise<void> {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(this.duration, sec));
    if (wasPlaying) await this.play();
  }
}
