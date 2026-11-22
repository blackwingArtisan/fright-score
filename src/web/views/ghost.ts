import { createRng } from '../../score/rng';

/**
 * The possessed chip: when a sting lands, a few register-write rows in the stitch panel briefly read as a
 * hidden message. The message depends only on the cue's seed, so the same cue always haunts the same way.
 * Each message is three words, one per row, and each row also shows the word's ASCII bytes as if the chip
 * had been written to.
 */
export const GHOST_MESSAGES: readonly (readonly [string, string, string])[] = [
  ['IT', 'IS', 'BEHIND'],
  ['DO', 'NOT', 'LOOK'],
  ['THE', 'DOOR', 'OPENS'],
  ['WE', 'HEAR', 'YOU'],
  ['LET', 'ME', 'OUT'],
  ['STILL', 'DOWN', 'HERE'],
  ['NOT', 'ALONE', 'NOW'],
  ['IT', 'WAITS', 'BELOW'],
];

/** Milliseconds each step of the flicker lasts, alternating shown and hidden, starting shown. */
export const GHOST_FLICKER_STEPS_MS: readonly number[] = [90, 60, 90, 50, 120, 40, 260];

/** How long the message stays when the visitor asked for reduced motion: still, with no flicker. */
export const GHOST_STILL_MS = 1500;

/** The three words the cue's seed spells. */
export function ghostMessage(seed: number): readonly [string, string, string] {
  return createRng(seed >>> 0).fork('ghost').pick(GHOST_MESSAGES);
}

/** The ASCII bytes of a word as hexadecimal pairs, like a register value. */
export function ghostHex(word: string): string {
  return [...word].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/** What the screen reader hears, once, when the message appears. */
export function ghostAnnouncement(seed: number): string {
  return `The chip is possessed. It writes: ${ghostMessage(seed).join(' ').toLowerCase()}.`;
}
