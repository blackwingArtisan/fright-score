import { describe, expect, it } from 'vitest';
import { sineCycles } from '../../src/engine/sine';

describe('sine table', () => {
  it('matches Math.sin within 1e-6 across a full cycle', () => {
    let maxErr = 0;
    for (let i = 0; i < 10_000; i++) {
      const phase = i / 10_000;
      maxErr = Math.max(maxErr, Math.abs(sineCycles(phase) - Math.sin(2 * Math.PI * phase)));
    }
    expect(maxErr).toBeLessThan(1e-6);
  });

  it('wraps negative and large phases', () => {
    expect(sineCycles(-0.25)).toBeCloseTo(-1, 6);
    expect(sineCycles(3.25)).toBeCloseTo(1, 6);
    expect(sineCycles(0.5)).toBeCloseTo(0, 6);
  });
});
