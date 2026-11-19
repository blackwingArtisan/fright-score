import { getAlgorithm } from '../../engine/algorithms';
import { getPatch, type Patch } from '../../engine/patches';
import type { VizFrames } from '../../engine/render';
import type { Score } from '../../score/schema';
import { midiToName } from '../../score/theory';
import { COLORS, FONT_SILK, fitCanvas } from './canvas';

const ROW_H = 58;
const PAD = 22;
const PAD_GAP = 46;
/** Envelope history shown per row: three seconds at 30 frames per second. */
export const HISTORY_FRAMES = 90;

/**
 * The FS-666 channel view. Each track is a channel row: four operator pads wired by copper
 * traces in the patch's algorithm, lit by their envelope levels, plus the note, voice count
 * and a three-second envelope history.
 */
export class ChipView {
  private score: Score | undefined;
  private frames: VizFrames | undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  set(score: Score | undefined, frames: VizFrames | undefined): void {
    this.score = score;
    this.frames = frames;
  }

  draw(positionSec: number): void {
    const rows = this.score?.tracks.length ?? 3;
    const idle = !this.score || !this.frames;
    // The idle caption gets its own line under the rows, so it never overlaps the last channel.
    const height = rows * ROW_H + 6 + (idle ? 24 : 0);
    const { ctx, width } = fitCanvas(this.canvas, height);
    ctx.clearRect(0, 0, width, height);
    const { labelW, padsX, readoutX, ribbonX, ribbonW } = rowLayout(width);

    if (!this.score || !this.frames) {
      for (let r = 0; r < rows; r++) this.drawRow(ctx, r, labelW, padsX, readoutX, ribbonX, ribbonW, undefined, 0);
      ctx.fillStyle = COLORS.tin;
      ctx.font = `12px ${FONT_SILK}`;
      ctx.fillText('Channels light up here when a cue plays.', 4, rows * ROW_H + 22);
      return;
    }
    const frame = Math.min(this.frames.frameCount - 1, Math.max(0, Math.floor(positionSec * this.frames.frameRate)));
    this.score.tracks.forEach((_, r) => this.drawRow(ctx, r, labelW, padsX, readoutX, ribbonX, ribbonW, r, frame));
  }

  private drawRow(
    ctx: CanvasRenderingContext2D,
    row: number,
    labelW: number,
    padsX: number,
    readoutX: number,
    ribbonX: number,
    ribbonW: number,
    trackIndex: number | undefined,
    frame: number,
  ): void {
    const track = trackIndex !== undefined ? this.score?.tracks[trackIndex] : undefined;
    const patch = track ? getPatch(track.patchId) : undefined;
    const frames = this.frames;
    const trackCount = this.score?.tracks.length ?? 1;
    const live = frames !== undefined && trackIndex !== undefined;
    const idx = frame * trackCount + (trackIndex ?? 0);
    drawOperatorRow(ctx, {
      y0: row * ROW_H + 4,
      labelW,
      padsX,
      readoutX,
      ribbonX,
      ribbonW,
      patch,
      title: patch ? patch.name : 'Channel',
      subtitle: track ? `${track.id}, algorithm ${getAlgorithm(patch!.algorithm).id}` : 'idle',
      level: (op, ago = 0) => {
        const f = frame - ago;
        return live && f >= 0 ? frames.envelopes[(f * trackCount + trackIndex) * 4 + op] : 0;
      },
      readout: live ? { voices: frames.voices[idx], midi: frames.notes[idx] } : undefined,
      accent: track?.role === 'stinger' ? COLORS.blood : COLORS.copper,
    });
  }
}

export interface OperatorRowSpec {
  /** Top of the row in CSS pixels. */
  y0: number;
  labelW: number;
  padsX: number;
  readoutX: number;
  ribbonX: number;
  ribbonW: number;
  patch: Patch | undefined;
  title: string;
  subtitle: string;
  /** Envelope level 0..1 of an operator, `ago` visualizer frames in the past. */
  level: (op: number, ago?: number) => number;
  /** Sounding voices and the latest note; undefined hides the readout. */
  readout: { voices: number; midi: number } | undefined;
  /** Colour of the envelope history line. */
  accent: string;
}

/** Horizontal layout of a channel row for a canvas `width` CSS pixels wide. */
export function rowLayout(width: number): { labelW: number; padsX: number; readoutX: number; ribbonX: number; ribbonW: number } {
  const narrow = width < 560;
  const labelW = narrow ? 104 : 168;
  const padsX = labelW + 16;
  const readoutX = padsX + PAD_GAP * 3 + PAD + 20;
  const ribbonX = readoutX + (narrow ? 52 : 92);
  return { labelW, padsX, readoutX, ribbonX, ribbonW: Math.max(0, width - ribbonX - 8) };
}

/** Height of one channel row in CSS pixels. */
export const CHANNEL_ROW_HEIGHT = ROW_H;

/**
 * Draws one FS-666 channel: four operator pads wired by copper traces in the patch's
 * algorithm, lit by their envelope levels, a note readout and a three-second envelope history.
 * Shared by the cue's channel view and the live keyboard view.
 */
export function drawOperatorRow(ctx: CanvasRenderingContext2D, spec: OperatorRowSpec): void {
  const { y0, labelW, padsX, readoutX, ribbonX, ribbonW, patch, level } = spec;
  const mid = y0 + 30;
  const algo = getAlgorithm(patch?.algorithm ?? 4);

  // Row divider, like a silkscreen outline.
  ctx.strokeStyle = 'rgb(122 85 48 / 0.45)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y0 + ROW_H - 2.5);
  ctx.lineTo(ctx.canvas.width, y0 + ROW_H - 2.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label.
  ctx.fillStyle = COLORS.silk;
  ctx.font = `13px ${FONT_SILK}`;
  ctx.fillText(spec.title, 4, y0 + 22, labelW - 8);
  ctx.fillStyle = COLORS.tin;
  ctx.font = `11px ${FONT_SILK}`;
  ctx.fillText(spec.subtitle, 4, y0 + 40, labelW - 8);

  const padX = (op: number) => padsX + op * PAD_GAP + PAD / 2;
  const busY = mid + 20;

  // Modulation traces: arcs above the pads.
  algo.inputs.forEach((sources, target) => {
    for (const src of sources) {
      const a = padX(src);
      const b = padX(target);
      const lift = 8 + Math.abs(b - a) * 0.18;
      ctx.strokeStyle = blend(level(src));
      ctx.lineWidth = 1.5 + 1.5 * level(src);
      ctx.beginPath();
      ctx.moveTo(a, mid - PAD / 2);
      ctx.bezierCurveTo(a, mid - PAD / 2 - lift, b, mid - PAD / 2 - lift, b, mid - PAD / 2);
      ctx.stroke();
    }
  });

  // Carrier traces down to the output bus.
  const carriers = algo.carriers;
  ctx.strokeStyle = COLORS.copperDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX(Math.min(...carriers)), busY);
  ctx.lineTo(readoutX - 8, busY);
  ctx.stroke();
  for (const c of carriers) {
    ctx.strokeStyle = blend(level(c));
    ctx.beginPath();
    ctx.moveTo(padX(c), mid + PAD / 2);
    ctx.lineTo(padX(c), busY);
    ctx.stroke();
  }

  // Operator 1 feedback loop.
  if (patch && patch.feedback > 0) {
    ctx.strokeStyle = blend(level(0));
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(padX(0) - PAD / 2 - 4, mid, 6, Math.PI * 0.35, Math.PI * 1.65);
    ctx.stroke();
  }

  // Pads.
  for (let op = 0; op < 4; op++) {
    const lv = level(op);
    const cx = padX(op);
    const isCarrier = carriers.includes(op);
    ctx.fillStyle = COLORS.maskDeep;
    ctx.strokeStyle = COLORS.copper;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (isCarrier) ctx.arc(cx, mid, PAD / 2, 0, Math.PI * 2);
    else ctx.rect(cx - PAD / 2, mid - PAD / 2, PAD, PAD);
    ctx.fill();
    ctx.stroke();
    if (lv > 0.002) {
      ctx.save();
      ctx.shadowColor = COLORS.copper;
      ctx.shadowBlur = 14 * lv;
      ctx.fillStyle = `rgb(232 170 104 / ${0.15 + 0.85 * lv})`;
      ctx.beginPath();
      if (isCarrier) ctx.arc(cx, mid, (PAD / 2 - 3) * Math.sqrt(lv) + 1, 0, Math.PI * 2);
      else {
        const s = (PAD - 6) * Math.sqrt(lv) + 2;
        ctx.rect(cx - s / 2, mid - s / 2, s, s);
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = lv > 0.45 ? COLORS.maskDeep : COLORS.tin;
    ctx.font = `10px ${FONT_SILK}`;
    ctx.fillText(String(op + 1), cx - 3, mid + 3.5);
  }

  // Note readout and voice dots.
  if (spec.readout) {
    const { voices, midi: note } = spec.readout;
    ctx.fillStyle = voices > 0 ? COLORS.silk : COLORS.tin;
    ctx.font = `13px ${FONT_SILK}`;
    ctx.fillText(voices > 0 ? midiToName(note) : '--', readoutX, mid + 2);
    for (let v = 0; v < Math.min(6, voices); v++) {
      ctx.fillStyle = COLORS.copper;
      ctx.fillRect(readoutX + v * 7, mid + 10, 4, 4);
    }
  }

  // Envelope history ribbon (carrier level over the last three seconds).
  if (ribbonW > 40) {
    const top = y0 + 10;
    const h = ROW_H - 22;
    ctx.strokeStyle = 'rgb(122 85 48 / 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ribbonX + 0.5, top + 0.5, ribbonW - 1, h);
    if (spec.readout) {
      ctx.beginPath();
      for (let k = 0; k < HISTORY_FRAMES; k++) {
        const ago = HISTORY_FRAMES - 1 - k;
        let v = 0;
        for (const c of carriers) v = Math.max(v, level(c, ago));
        const x = ribbonX + (k / (HISTORY_FRAMES - 1)) * (ribbonW - 2) + 1;
        const y = top + h - 2 - v * (h - 4);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = spec.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function blend(level: number): string {
  const l = Math.max(0, Math.min(1, level));
  const r = Math.round(122 + (232 - 122) * l);
  const g = Math.round(85 + (170 - 85) * l);
  const b = Math.round(48 + (104 - 48) * l);
  return `rgb(${r} ${g} ${b})`;
}
