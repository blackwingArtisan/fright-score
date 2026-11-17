/// <reference lib="webworker" />
import { renderScore } from '../engine/render';
import { parseScore } from '../score/schema';
import { encodeWav } from '../wav/wav';
import type { RenderRequestMessage, WorkerMessage } from './protocol';

/** Renders scores off the main thread with the same engine the CLI uses. */
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<RenderRequestMessage>) => void) | null;
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
};

ctx.onmessage = (event) => {
  const { id, score: raw } = event.data;
  try {
    const score = parseScore(raw);
    let last = 0;
    const result = renderScore(score, {
      frames: true,
      onProgress: (fraction) => {
        if (fraction - last >= 0.02 || fraction === 1) {
          last = fraction;
          ctx.postMessage({ type: 'progress', id, fraction });
        }
      },
    });
    const wav = encodeWav(result, { ditherSeed: score.seed ^ 0x5eed, loop: score.plan.loop === true });
    const frames = result.frames!;
    ctx.postMessage(
      { type: 'done', id, left: result.left, right: result.right, wav, frames, stats: result.stats },
      [result.left.buffer, result.right.buffer, wav.buffer, frames.envelopes.buffer, frames.voices.buffer, frames.notes.buffer],
    );
  } catch (error) {
    ctx.postMessage({ type: 'error', id, message: (error as Error).message });
  }
};
