/** Dread at rest: the slow heartbeat shared by the chip's operator pads and the timeline's sting marker. */

/** Beats per minute of the resting heartbeat. */
export const HEARTBEAT_BPM = 50;
/** Seconds between beats at `HEARTBEAT_BPM`. */
export const HEARTBEAT_PERIOD_SEC = 60 / HEARTBEAT_BPM;
/** The steady level held under reduced motion (a still, half-lit pulse). */
export const HEARTBEAT_STILL = 0.6;
/** How strongly a track that is not the drone beats, relative to the drone (the heartbeat is tied to the drone). */
export const NON_DRONE_SHARE = 0.55;

/** One decaying thump: 1 at `centerSec`, falling off quickly after it, 0 before it. */
function thump(tSec: number, centerSec: number, decaySec: number): number {
  const dt = tSec - centerSec;
  if (dt < 0) return 0;
  return Math.exp(-dt / decaySec);
}

/**
 * The heartbeat level 0..1 at `tSec`: a strong "lub" at the start of each beat and a softer "dub" 0.28 s later,
 * then a rest until the next beat. Pure, so the shape is unit tested.
 */
export function heartbeatLevel(tSec: number): number {
  const phase = ((tSec % HEARTBEAT_PERIOD_SEC) + HEARTBEAT_PERIOD_SEC) % HEARTBEAT_PERIOD_SEC;
  const lub = thump(phase, 0, 0.09);
  const dub = 0.6 * thump(phase, 0.28, 0.09);
  return Math.min(1, lub + dub);
}

/** Heartbeat level now, or the still level when the visitor prefers reduced motion. */
export function restingPulse(tSec: number, reducedMotion: boolean): number {
  return reducedMotion ? HEARTBEAT_STILL : heartbeatLevel(tSec);
}

/** How strongly a channel beats: the drone at full strength, every other channel at `NON_DRONE_SHARE`. */
export function beatShare(role: string | undefined): number {
  return role === 'drone' ? 1 : NON_DRONE_SHARE;
}

/** The sting's tag as the page shows it: minutes and whole seconds, like "1:10". */
export function stingTag(atSec: number): string {
  const whole = Math.round(atSec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
