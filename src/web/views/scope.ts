import { COLORS, fitCanvas } from './canvas';

/** Oscilloscope of the live output. */
export class ScopeView {
  private data: Float32Array<ArrayBuffer> | undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  draw(analyser: AnalyserNode | undefined, live: boolean): void {
    const { ctx, width, height } = fitCanvas(this.canvas, 72);
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    ctx.strokeStyle = 'rgb(122 85 48 / 0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 4);
      ctx.lineTo(x + 0.5, height - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.copper;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (!analyser || !live) {
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();
      return;
    }
    if (!this.data || this.data.length !== analyser.fftSize) this.data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(this.data);
    const n = this.data.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * width;
      const y = mid - this.data[i] * (mid - 4) * 1.6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
