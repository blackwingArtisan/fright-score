import { getAlgorithm } from '../../engine/algorithms';
import { getPatch } from '../../engine/patches';
import type { LiveChip } from '../live/live-chip';
import { COLORS } from './canvas';
import { CHANNEL_ROW_HEIGHT, drawOperatorRow, rowLayout } from './chip';
import { fitCanvas } from './canvas';

/** One channel row driven by the live chip's reports from the audio thread. */
export class LiveView {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly chip: LiveChip,
  ) {}

  draw(): void {
    const height = CHANNEL_ROW_HEIGHT + 6;
    const { ctx, width } = fitCanvas(this.canvas, height);
    ctx.clearRect(0, 0, width, height);
    const patch = getPatch(this.chip.patch);
    const { latest, history } = this.chip;
    drawOperatorRow(ctx, {
      y0: 4,
      ...rowLayout(width),
      patch,
      title: patch.name,
      subtitle: `live, algorithm ${getAlgorithm(patch.algorithm).id}`,
      level: (op, ago = 0) => {
        if (ago === 0) return latest.ops[op];
        const frame = history[history.length - 1 - ago];
        return frame ? frame[op] : 0;
      },
      readout: { voices: latest.voices, midi: latest.midi },
      accent: COLORS.copper,
    });
  }
}
