import type { PatchId } from '../../engine/patches';

/** Name the live FS-666 processor registers under in the AudioWorklet scope. */
export const LIVE_PROCESSOR = 'fs666-live';

/** Simultaneous voices on the live chip, like the six channels of the original part. */
export const LIVE_POLYPHONY = 6;

/** Output trim before the soft limiter, so a full chord stays clean. */
export const LIVE_GAIN = 0.32;

/** Messages from the page to the live chip. */
export type LiveCommand =
  | { type: 'patch'; patchId: PatchId }
  | { type: 'on'; key: string; midi: number; velocity: number }
  | { type: 'off'; key: string }
  | { type: 'panic' };

/** What the live chip reports back, about 30 times a second. */
export interface LiveReport {
  type: 'report';
  /** Highest envelope level per operator across sounding voices (0..1). */
  ops: [number, number, number, number];
  voices: number;
  /** MIDI note of the most recent voice, 0 when silent. */
  midi: number;
  /** Total sample frames synthesized since the chip woke up. */
  framesRendered: number;
  /** Output peak since the previous report (0..1). */
  peak: number;
}
