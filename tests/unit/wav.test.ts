import { describe, expect, it } from 'vitest';
import { WAV_HEADER_BYTES, encodeWav, parseWav, wavToFloat } from '../../src/wav/wav';

function tone(n: number, amp: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 44_100);
  return x;
}

describe('WAV encoder', () => {
  const left = tone(44_100, 0.5);
  const right = tone(44_100, 0.25);
  const bytes = encodeWav({ sampleRate: 44_100, left, right });
  const view = new DataView(bytes.buffer);
  const ascii = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));

  it('writes a canonical 44-byte PCM header', () => {
    expect(ascii(0)).toBe('RIFF');
    expect(ascii(8)).toBe('WAVE');
    expect(ascii(12)).toBe('fmt ');
    expect(ascii(36)).toBe('data');
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getUint32(28, true)).toBe(44_100 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(44_100 * 4);
  });

  it('has exactly header + frames x 4 bytes', () => {
    expect(bytes.byteLength).toBe(WAV_HEADER_BYTES + 44_100 * 4);
  });

  it('round-trips through the parser within dither', () => {
    const info = parseWav(bytes);
    expect(info).toMatchObject({ sampleRate: 44_100, channels: 2, bitsPerSample: 16, frameCount: 44_100, durationSec: 1 });
    const [l, r] = wavToFloat(info);
    for (let i = 0; i < 44_100; i += 97) {
      expect(Math.abs(l[i] - left[i])).toBeLessThan(1e-4);
      expect(Math.abs(r[i] - right[i])).toBeLessThan(1e-4);
    }
  });

  it('clamps out-of-range input instead of wrapping', () => {
    const hot = encodeWav({ sampleRate: 44_100, left: new Float32Array([2, -2]), right: new Float32Array([1.5, -1.5]) });
    const info = parseWav(hot);
    const [l0, r0, l1, r1] = Array.from(info.samples);
    expect(l0).toBe(32767);
    expect(r0).toBe(32767);
    expect(l1).toBeLessThanOrEqual(-32766);
    expect(r1).toBeLessThanOrEqual(-32766);
  });

  it('is byte-for-byte deterministic for the same dither seed', () => {
    const again = encodeWav({ sampleRate: 44_100, left, right });
    expect(Buffer.from(again).equals(Buffer.from(bytes))).toBe(true);
  });

  it('rejects mismatched channels and non-WAV data', () => {
    expect(() => encodeWav({ sampleRate: 44_100, left: new Float32Array(2), right: new Float32Array(3) })).toThrow();
    expect(() => parseWav(new Uint8Array(64))).toThrow(/RIFF/);
  });
});
