/**
 * Sine lookup table, the software stand-in for the chip's log-sin ROM.
 * Phase is measured in cycles (1.0 = one full period), so phase modulation is a plain add.
 */
export const SINE_TABLE_BITS = 12;
export const SINE_TABLE_SIZE = 1 << SINE_TABLE_BITS;

const TABLE = new Float32Array(SINE_TABLE_SIZE + 1);
for (let i = 0; i <= SINE_TABLE_SIZE; i++) {
  TABLE[i] = Math.sin((2 * Math.PI * i) / SINE_TABLE_SIZE);
}

/** sin(2 pi * phaseCycles) from the table with linear interpolation. Any real phase is accepted. */
export function sineCycles(phaseCycles: number): number {
  const wrapped = phaseCycles - Math.floor(phaseCycles);
  const pos = wrapped * SINE_TABLE_SIZE;
  const i = pos | 0;
  const frac = pos - i;
  const a = TABLE[i];
  return a + (TABLE[i + 1] - a) * frac;
}
