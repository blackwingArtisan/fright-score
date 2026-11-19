import type { Score } from '../../score/schema';
import { formatTime } from '../../score/theory';
import { COLORS, FONT_GOTHIC, FONT_SILK, fitCanvas } from './canvas';

const HEIGHT = 260;
const SECTION_H = 40;
const RULER_H = 20;

/** Draws sections, intensity, every note, the cues and the playhead. */
export class TimelineView {
  private score: Score | undefined;
  private waveform: Float32Array | undefined;
  private staticLayer: HTMLCanvasElement | undefined;
  private width = 0;
  private progress: number | undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  setScore(score: Score | undefined, left?: Float32Array, right?: Float32Array): void {
    this.score = score;
    this.waveform = left && right ? overview(left, right, 1200) : undefined;
    this.staticLayer = undefined;
  }

  /** Render progress 0..1 drawn across the timeline, or undefined when no render is running. */
  setProgress(fraction: number | undefined): void {
    this.progress = fraction === undefined ? undefined : Math.max(0, Math.min(1, fraction));
  }

  /** Drop the cached layer so the next frame redraws it (after web fonts load, for example). */
  invalidate(): void {
    this.staticLayer = undefined;
  }

  /** Seconds at a CSS x offset within the canvas. */
  timeAt(x: number): number {
    if (!this.score) return 0;
    return Math.max(0, Math.min(this.score.durationSec, (x / this.canvas.clientWidth) * this.score.durationSec));
  }

  /** Draw the frame. `scare` turns the playhead blood red while a sting lands. */
  draw(playheadSec: number, scare = false): void {
    const { ctx, width } = fitCanvas(this.canvas, HEIGHT);
    if (!this.staticLayer || this.width !== width) {
      this.width = width;
      this.staticLayer = this.renderStatic(width);
    }
    ctx.clearRect(0, 0, width, HEIGHT);
    ctx.drawImage(this.staticLayer, 0, 0, width, HEIGHT);
    if (this.progress !== undefined) {
      this.drawProgress(ctx, width, this.progress);
    } else if (this.score) {
      const x = (playheadSec / this.score.durationSec) * width;
      ctx.fillStyle = scare ? 'rgb(224 52 63 / 0.22)' : 'rgb(236 230 210 / 0.12)';
      ctx.fillRect(0, SECTION_H, x, HEIGHT - SECTION_H - RULER_H);
      ctx.strokeStyle = scare ? COLORS.blood : COLORS.silk;
      ctx.lineWidth = scare ? 3 : 1.5;
      if (scare) {
        ctx.shadowColor = COLORS.blood;
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  /** The render sweeping across the board: everything right of the sweep is still dark. */
  private drawProgress(ctx: CanvasRenderingContext2D, width: number, fraction: number): void {
    const x = fraction * width;
    ctx.fillStyle = 'rgb(7 22 17 / 0.82)';
    ctx.fillRect(x, 0, width - x, HEIGHT);
    const grad = ctx.createLinearGradient(x - 60, 0, x, 0);
    grad.addColorStop(0, 'rgb(201 137 74 / 0)');
    grad.addColorStop(1, 'rgb(201 137 74 / 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(Math.max(0, x - 60), 0, Math.min(60, x), HEIGHT);
    ctx.strokeStyle = COLORS.copper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
    const label = `Rendering on the FS-666  ${Math.round(fraction * 100)}%`;
    ctx.font = `bold 12px ${FONT_SILK}`;
    const w = ctx.measureText(label).width + 16;
    const lx = Math.min(width - w - 6, Math.max(6, x + 8));
    ctx.fillStyle = COLORS.maskDeep;
    ctx.fillRect(lx, HEIGHT / 2 - 13, w, 24);
    ctx.strokeStyle = COLORS.copperDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx + 0.5, HEIGHT / 2 - 12.5, w - 1, 23);
    ctx.fillStyle = COLORS.silk;
    ctx.fillText(label, lx + 8, HEIGHT / 2 + 4);
  }

  private renderStatic(width: number): HTMLCanvasElement {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const layer = document.createElement('canvas');
    layer.width = Math.round(width * dpr);
    layer.height = Math.round(HEIGHT * dpr);
    const ctx = layer.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = COLORS.maskDeep;
    ctx.fillRect(0, 0, width, HEIGHT);
    const score = this.score;
    if (!score) {
      ctx.fillStyle = COLORS.tin;
      ctx.font = `13px ${FONT_SILK}`;
      ctx.fillText('The score appears here: sections, every note, and where the scares land.', 16, HEIGHT / 2);
      return layer;
    }
    const dur = score.durationSec;
    const xOf = (t: number) => (t / dur) * width;
    const laneTop = SECTION_H + 4;
    const laneBottom = HEIGHT - RULER_H - 4;

    // Waveform overview behind the lanes.
    if (this.waveform) {
      ctx.fillStyle = 'rgb(201 137 74 / 0.12)';
      const mid = (laneTop + laneBottom) / 2;
      const amp = (laneBottom - laneTop) / 2;
      const n = this.waveform.length;
      for (let i = 0; i < n; i++) {
        const h = this.waveform[i] * amp;
        ctx.fillRect((i / n) * width, mid - h, Math.max(1, width / n), h * 2);
      }
    }

    // Sections.
    score.plan.sections.forEach((s, i) => {
      const x0 = xOf(s.startSec);
      const x1 = xOf(s.endSec);
      ctx.fillStyle = i % 2 === 0 ? COLORS.mask : COLORS.maskRaised;
      ctx.fillRect(x0, 0, x1 - x0, SECTION_H);
      ctx.strokeStyle = COLORS.copperDim;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, 0);
      ctx.lineTo(x0 + 0.5, HEIGHT - RULER_H);
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, x1 - x0 - 4, SECTION_H);
      ctx.clip();
      ctx.fillStyle = COLORS.silk;
      ctx.font = `19px ${FONT_GOTHIC}`;
      ctx.fillText(s.name, x0 + 8, 26);
      ctx.restore();
    });

    // Intensity curve across the sections.
    ctx.strokeStyle = COLORS.copper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    score.plan.sections.forEach((s, i) => {
      const y = SECTION_H - 4 - s.intensity * (SECTION_H - 10);
      if (i === 0) ctx.moveTo(xOf(s.startSec), y);
      else ctx.lineTo(xOf(s.startSec), y);
      ctx.lineTo(xOf(s.endSec), y);
    });
    ctx.stroke();

    // Note lanes.
    const tracks = score.tracks;
    const laneH = (laneBottom - laneTop) / tracks.length;
    tracks.forEach((track, i) => {
      const y0 = laneTop + i * laneH;
      let lo = 127;
      let hi = 0;
      for (const n of track.notes) {
        lo = Math.min(lo, n.midi);
        hi = Math.max(hi, n.midi);
      }
      const span = Math.max(1, hi - lo);
      ctx.fillStyle = track.role === 'stinger' ? COLORS.blood : track.id === 'riser' ? COLORS.copper : COLORS.silkDim;
      for (const n of track.notes) {
        const y = y0 + 2 + (1 - (n.midi - lo) / span) * Math.max(0, laneH - 5);
        ctx.globalAlpha = 0.35 + 0.65 * n.velocity;
        ctx.fillRect(xOf(n.atSec), y, Math.max(1.5, xOf(n.durSec)), 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgb(7 22 17 / 0.75)';
      ctx.font = `10px ${FONT_SILK}`;
      const label = track.id;
      ctx.fillRect(2, y0 + 1, ctx.measureText(label).width + 6, 12);
      ctx.fillStyle = COLORS.tin;
      ctx.fillText(label, 5, y0 + 10);
    });

    // Cues.
    for (const cue of score.plan.cues) {
      const x = xOf(cue.atSec);
      if (cue.kind === 'silence') {
        const w = xOf(cue.lengthSec ?? 0.6);
        ctx.fillStyle = COLORS.maskDeep;
        ctx.fillRect(x, SECTION_H, Math.max(2, w), laneBottom - SECTION_H);
      } else if (cue.kind === 'riser') {
        const x0 = xOf(cue.atSec - (cue.lengthSec ?? 4));
        const grad = ctx.createLinearGradient(x0, 0, x, 0);
        grad.addColorStop(0, 'rgb(201 137 74 / 0)');
        grad.addColorStop(1, 'rgb(201 137 74 / 0.55)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0, laneBottom);
        ctx.lineTo(x, laneBottom);
        ctx.lineTo(x, laneBottom - 26);
        ctx.closePath();
        ctx.fill();
      } else {
        const sting = cue.kind === 'sting';
        ctx.strokeStyle = sting ? COLORS.blood : COLORS.copper;
        ctx.lineWidth = sting ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT - RULER_H);
        ctx.stroke();
        const label = `${sting ? 'Sting' : 'Hit'} ${formatTime(cue.atSec)}`;
        ctx.font = `bold 11px ${FONT_SILK}`;
        const w = ctx.measureText(label).width + 10;
        const lx = Math.min(width - w - 2, x + 4);
        ctx.fillStyle = sting ? COLORS.blood : COLORS.copper;
        ctx.fillRect(lx, SECTION_H + 2, w, 16);
        ctx.fillStyle = COLORS.maskDeep;
        ctx.fillText(label, lx + 5, SECTION_H + 14);
      }
    }

    // Ruler.
    const rulerY = HEIGHT - RULER_H;
    ctx.fillStyle = COLORS.mask;
    ctx.fillRect(0, rulerY, width, RULER_H);
    ctx.strokeStyle = COLORS.copperDim;
    ctx.fillStyle = COLORS.tin;
    ctx.font = `10px ${FONT_SILK}`;
    const step = dur <= 20 ? 2 : dur <= 60 ? 5 : dur <= 150 ? 10 : 30;
    for (let t = 0; t <= dur + 1e-6; t += step) {
      const x = xOf(t);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, rulerY);
      ctx.lineTo(x + 0.5, rulerY + 5);
      ctx.stroke();
      if (x < width - 30) ctx.fillText(formatTime(t).replace(/\.\d$/, ''), x + 3, rulerY + 15);
    }
    return layer;
  }
}

/** Peak envelope of a stereo signal reduced to `bins` points (0..1). */
function overview(left: Float32Array, right: Float32Array, bins: number): Float32Array {
  const out = new Float32Array(bins);
  const per = Math.max(1, Math.floor(left.length / bins));
  for (let b = 0; b < bins; b++) {
    let peak = 0;
    const end = Math.min(left.length, (b + 1) * per);
    for (let i = b * per; i < end; i += 4) {
      const a = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      if (a > peak) peak = a;
    }
    out[b] = peak;
  }
  return out;
}
