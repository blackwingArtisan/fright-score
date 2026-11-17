import type { RenderStats, VizFrames } from '../engine/render';
import type { Score } from '../score/schema';

export interface RenderRequestMessage {
  type: 'render';
  id: number;
  score: Score;
}

export type WorkerMessage =
  | { type: 'progress'; id: number; fraction: number }
  | {
      type: 'done';
      id: number;
      left: Float32Array;
      right: Float32Array;
      wav: Uint8Array;
      frames: VizFrames;
      stats: RenderStats;
    }
  | { type: 'error'; id: number; message: string };
