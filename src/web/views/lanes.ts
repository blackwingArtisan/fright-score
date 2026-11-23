/** How many channels the chip panel shows while it is collapsed. */
export const COLLAPSED_LANES = 4;

/** How far the playhead must move, in seconds, before the collapsed panel may swap one of its channels. */
export const LANE_DWELL_SEC = 0.5;

/**
 * Picks the channels the collapsed chip panel shows: the ones sounding at the playhead, at most `max`, in track order.
 * Channels already on show keep their place while they sound, so rows do not swap on every note. When fewer than
 * `max` channels sound, the panel fills up with the channels it showed before, then with the earliest tracks,
 * so it always keeps the same height.
 */
export function pickLanes(previous: readonly number[], sounding: readonly boolean[], max = COLLAPSED_LANES): number[] {
  const count = sounding.length;
  const limit = Math.min(max, count);
  const chosen: number[] = [];
  const add = (i: number): void => {
    if (chosen.length < limit && i >= 0 && i < count && !chosen.includes(i)) chosen.push(i);
  };
  for (const i of previous) if (sounding[i]) add(i);
  for (let i = 0; i < count; i++) if (sounding[i]) add(i);
  for (const i of previous) add(i);
  for (let i = 0; i < count; i++) add(i);
  return chosen.sort((a, b) => a - b);
}

/**
 * The full recorded envelope of one channel, reduced to `columns` values 0..1: each column holds the loudest
 * level of the frames it covers. `levelAt` gives the channel's level at a visualizer frame.
 */
export function envelopeGhost(frameCount: number, columns: number, levelAt: (frame: number) => number): Float32Array {
  const out = new Float32Array(Math.max(0, columns));
  if (frameCount <= 0) return out;
  for (let c = 0; c < out.length; c++) {
    const from = Math.floor((c / out.length) * frameCount);
    const to = Math.max(from + 1, Math.floor(((c + 1) / out.length) * frameCount));
    let peak = 0;
    for (let f = from; f < to && f < frameCount; f++) peak = Math.max(peak, levelAt(f));
    out[c] = peak;
  }
  return out;
}
