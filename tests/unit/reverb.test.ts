import { describe, expect, it } from 'vitest';
import { CRYPT_REVERB, applyReverb } from '../../src/engine/reverb';

const SR = 44_100;

/** Run an impulse through the reverb into silent left and right buffers. */
function impulseResponse(seconds: number, options = CRYPT_REVERB, amount = 1) {
  const n = Math.round(seconds * SR);
  const send = new Float32Array(n);
  send[0] = amount;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  applyReverb(send, left, right, options);
  return { left, right };
}

const energy = (x: Float32Array, fromSec: number, toSec: number) => {
  let e = 0;
  for (let i = Math.round(fromSec * SR); i < Math.min(x.length, Math.round(toSec * SR)); i++) e += x[i] * x[i];
  return e;
};

describe('stereo reverb send (Requirement 6.6)', () => {
  it('adds nothing when nothing is sent', () => {
    const left = new Float32Array(SR).fill(0.25);
    const right = new Float32Array(SR).fill(-0.25);
    applyReverb(new Float32Array(SR), left, right);
    expect(left.every((v) => v === 0.25)).toBe(true);
    expect(right.every((v) => v === -0.25)).toBe(true);
  });

  it('turns an impulse into a tail that starts after the first comb delay and then dies away', () => {
    const { left } = impulseResponse(6);
    expect(energy(left, 0, 0.02)).toBeLessThan(energy(left, 0.02, 0.3)); // the tail builds after the early delays
    expect(energy(left, 0, 1)).toBeGreaterThan(0);
    expect(energy(left, 1, 2)).toBeGreaterThan(energy(left, 4, 5));
    expect(energy(left, 5, 6)).toBeGreaterThan(0); // it rings: this is a crypt, not a closet
    expect(left.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('is stereo: left and right tails differ, with comparable energy', () => {
    const { left, right } = impulseResponse(2);
    let differing = 0;
    for (let i = 0; i < left.length; i++) if (Math.abs(left[i] - right[i]) > 1e-9) differing++;
    expect(differing).toBeGreaterThan(left.length / 2);
    const ratio = energy(left, 0, 2) / energy(right, 0, 2);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it('adds the wet signal onto what is already in the buffers', () => {
    const { left: wet } = impulseResponse(1);
    const send = new Float32Array(SR);
    send[0] = 1;
    const left = new Float32Array(SR).fill(0.1);
    applyReverb(send, left, new Float32Array(SR));
    for (const i of [100, 5000, 20_000]) expect(left[i]).toBeCloseTo(0.1 + wet[i], 6);
  });

  it('is linear in the send level and repeatable', () => {
    const a = impulseResponse(1, CRYPT_REVERB, 1).left;
    const half = impulseResponse(1, CRYPT_REVERB, 0.5).left;
    const again = impulseResponse(1, CRYPT_REVERB, 1).left;
    for (const i of [1500, 8000, 30_000]) expect(half[i]).toBeCloseTo(a[i] / 2, 8);
    expect(Buffer.from(a.buffer).equals(Buffer.from(again.buffer))).toBe(true);
  });

  it('rings longer in a bigger room and sounds darker with more damping', () => {
    const small = impulseResponse(4, { roomSize: 0.2, damping: 0.35 }).left;
    const big = impulseResponse(4, { roomSize: 0.95, damping: 0.35 }).left;
    expect(energy(big, 2, 4)).toBeGreaterThan(energy(small, 2, 4) * 5);

    const bright = impulseResponse(2, { roomSize: 0.88, damping: 0 }).left;
    const dark = impulseResponse(2, { roomSize: 0.88, damping: 1 }).left;
    // Sample-to-sample change relative to level is a rough measure of high-frequency content.
    const roughness = (x: Float32Array) => {
      let d = 0;
      for (let i = 1; i < x.length; i++) d += (x[i] - x[i - 1]) ** 2;
      return d / energy(x, 0, 2);
    };
    expect(roughness(dark)).toBeLessThan(roughness(bright));
  });
});
