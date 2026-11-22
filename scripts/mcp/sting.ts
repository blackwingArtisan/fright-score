import type { Score } from '../../src/score/schema';

/** The time of the first stinger note at or after each sting cue, read from the realized score. */
export function stingLandingSec(score: Score): number[] {
  const notes = score.tracks.filter((t) => t.role === 'stinger').flatMap((t) => t.notes);
  const landings: number[] = [];
  for (const cue of score.plan.cues) {
    if (cue.kind !== 'sting') continue;
    const times = notes.map((n) => n.atSec).filter((at) => at >= cue.atSec - 0.0005);
    if (times.length > 0) landings.push(Math.round(Math.min(...times) * 1000) / 1000);
  }
  return landings;
}
