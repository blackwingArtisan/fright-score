import type { WavInfo } from '../../src/wav/wav';

/** Nothing quieter than -50 dBFS counts as an onset, so dither and a silent file give none. */
export const FLOOR_DBFS = -50;
/** An onset window must be this much louder than the mean level of the quiet stretch before it. */
export const JUMP_DB = 20;
/** RMS window length. */
export const WINDOW_SEC = 0.002;
/** Length of the quiet stretch before an onset, and the shortest time between two onsets. */
export const QUIET_SEC = 0.5;
/** An expected time is paired with an onset at most this far away. */
export const MAX_PAIR_DISTANCE_SEC = 0.5;

const dbToAmplitude = (db: number): number => 10 ** (db / 20);
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** The mean of the channels as floats in -1..1. */
function mixToMono(info: WavInfo): Float32Array {
  const { channels, frameCount, samples } = info;
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c];
    mono[i] = sum / channels / 32768;
  }
  return mono;
}

/**
 * Onset times in seconds, rounded to the millisecond.
 *
 * The file is mixed to mono and cut into 2 ms windows. A window starts an onset when its RMS is at or above
 * -50 dBFS and at least 20 dB above the mean power of the 0.5 s before it, and no onset was found in that 0.5 s.
 * The 0.5 s is counted from the start of the file, so a file that opens loud has no onset at its start. The onset
 * is the first frame, from the window before onward, whose absolute level reaches the same threshold.
 *
 * A relative threshold is used because a sting cue's planned silence still carries release and reverb tails,
 * measured at -24 to -42 dBFS before the sting while the hit itself is near -11 dBFS (design.md, verify_cue).
 */
export function findOnsets(info: WavInfo): number[] {
  const mono = mixToMono(info);
  const windowFrames = Math.max(1, Math.round(info.sampleRate * WINDOW_SEC));
  const windowCount = Math.floor(mono.length / windowFrames);
  const power = new Float64Array(windowCount);
  for (let w = 0; w < windowCount; w++) {
    let sumSquares = 0;
    for (let i = w * windowFrames; i < (w + 1) * windowFrames; i++) sumSquares += mono[i] * mono[i];
    power[w] = sumSquares / windowFrames;
  }
  const quietWindows = Math.ceil((info.sampleRate * QUIET_SEC) / windowFrames);
  const floor = dbToAmplitude(FLOOR_DBFS);
  const jump = dbToAmplitude(JUMP_DB);
  const onsets: number[] = [];
  let historySum = 0;
  for (let w = 0; w < quietWindows && w < windowCount; w++) historySum += power[w];
  let nextAllowed = quietWindows;
  for (let w = quietWindows; w < windowCount; w++) {
    const meanBefore = Math.max(0, historySum / quietWindows);
    const threshold = Math.max(floor, Math.sqrt(meanBefore) * jump);
    if (w >= nextAllowed && Math.sqrt(power[w]) >= threshold) {
      let first = (w - 1) * windowFrames;
      while (Math.abs(mono[first]) < threshold) first++;
      onsets.push(round3(first / info.sampleRate));
      nextAllowed = w + quietWindows;
    }
    historySum += power[w] - power[w - quietWindows];
  }
  return onsets;
}

export interface Pairing {
  expectedHitSec: number;
  measuredSec: number | null;
}

/** Pairs each expected time, in ascending order, with the nearest unused onset within 500 ms. */
export function pairOnsets(expected: number[], onsets: number[]): Pairing[] {
  const used = new Set<number>();
  const pairs: Pairing[] = [];
  for (const expectedHitSec of [...expected].sort((a, b) => a - b)) {
    let best = -1;
    for (let i = 0; i < onsets.length; i++) {
      if (used.has(i)) continue;
      if (best < 0 || Math.abs(onsets[i] - expectedHitSec) < Math.abs(onsets[best] - expectedHitSec)) best = i;
    }
    const near = best >= 0 && Math.abs(onsets[best] - expectedHitSec) <= MAX_PAIR_DISTANCE_SEC + 1e-9;
    if (near) used.add(best);
    pairs.push({ expectedHitSec, measuredSec: near ? onsets[best] : null });
  }
  return pairs;
}
