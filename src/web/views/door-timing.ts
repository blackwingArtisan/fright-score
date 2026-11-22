/** Pure timing for the door scene: no DOM and no Web Audio types, so Vitest can test it. */

/** The defaults of `examples/godot/addons/fright_score/fright_score_cue.gd`. */
export const DOOR_TIMING = {
  preSilenceSec: 0.6,
  hitInFileSec: 1.0,
  cutSec: 0.08,
  ringSec: 2.5,
  returnSec: 1.5,
} as const;

export interface ScareOptions {
  hitInFileSec?: number;
  preSilenceSec?: number;
  cutSec?: number;
}

export interface ScarePlan {
  /** The loop starts to drop out. */
  cutStartSec: number;
  /** The loop is silent. */
  cutEndSec: number;
  /** When the sting source starts on the audio clock. */
  stingStartSec: number;
  /** Where in the file the sting starts (the top of its pre-silence). */
  stingOffsetSec: number;
  /** When the hit sounds on the audio clock. */
  hitSec: number;
  /** hitSec minus the event time. */
  hitDelaySec: number;
}

const ok = (n: number): boolean => Number.isFinite(n) && n >= 0;

/** Place the cut, the sting and the hit for a door event read once from the audio clock. */
export function planScare(eventSec: number, options: ScareOptions = {}): ScarePlan {
  const hitInFileSec = options.hitInFileSec ?? DOOR_TIMING.hitInFileSec;
  const preSilenceSec = options.preSilenceSec ?? DOOR_TIMING.preSilenceSec;
  const cutSec = options.cutSec ?? DOOR_TIMING.cutSec;
  for (const [name, value] of Object.entries({ eventSec, hitInFileSec, preSilenceSec, cutSec })) {
    if (!ok(value)) throw new RangeError(`${name} must be a finite number of seconds, 0 or more (got ${value})`);
  }
  if (preSilenceSec > hitInFileSec) {
    throw new RangeError(`preSilenceSec (${preSilenceSec}) is longer than hitInFileSec (${hitInFileSec}): the file has less silence than the plan assumes`);
  }
  const stingOffsetSec = hitInFileSec - preSilenceSec;
  const stingStartSec = eventSec;
  const hitSec = stingStartSec + (hitInFileSec - stingOffsetSec);
  return {
    cutStartSec: eventSec,
    cutEndSec: eventSec + cutSec,
    stingStartSec,
    stingOffsetSec,
    hitSec,
    hitDelaySec: hitSec - eventSec,
  };
}

/** Three decimals, as shown in the measured line. */
export function formatOffset(offsetSec: number): string {
  return offsetSec.toFixed(3);
}
