/** Output sample rate for every render (CD quality, like the WAV export). */
export const SAMPLE_RATE = 44_100;

/** Samples per control block: LFO, pitch bend and voice scheduling update at this rate. */
export const CONTROL_BLOCK = 32;

/**
 * Phase modulation depth, in cycles, applied to a full-scale modulator.
 * A modulator at level 1.0 swings its target's phase by +/-2 cycles (+/-4 pi radians),
 * close to the brightest setting of the YM2612 family.
 */
export const MOD_SCALE_CYCLES = 2;

/**
 * Operator 1 self-feedback depth per feedback level 0-7, in cycles.
 * Mirrors the chip's pi/16 .. 4 pi doubling steps.
 */
export const FEEDBACK_CYCLES = [0, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2] as const;
