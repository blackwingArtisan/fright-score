import { createRng } from '../score/rng';

/**
 * 16-bit PCM WAV (RIFF) encoder and parser.
 * Encoding uses TPDF dither from a seeded generator, so exports stay byte-for-byte reproducible.
 */

export interface StereoAudio {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  frameCount: number;
  durationSec: number;
  /** Interleaved samples. */
  samples: Int16Array;
}

export const WAV_HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

export function encodeWav(audio: StereoAudio, ditherSeed = 0x5eed): Uint8Array {
  const frames = audio.left.length;
  if (audio.right.length !== frames) throw new Error('left and right channels must be the same length');
  const channels = 2;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const rng = createRng(ditherSeed);
  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < frames; i++) {
    for (const ch of [audio.left, audio.right]) {
      const dither = rng.next() - rng.next(); // TPDF, +/-1 LSB
      const value = Math.round(Math.max(-1, Math.min(1, ch[i])) * 32767 + dither);
      view.setInt16(offset, Math.max(-32768, Math.min(32767, value)), true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

/** Parse a PCM WAV file, walking chunks so files with extra chunks also work. */
export function parseWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      const format = view.getUint16(body, true);
      if (format !== 1) throw new Error(`Unsupported WAV format ${format}; expected PCM`);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${bitsPerSample}`);
      const count = Math.min(size, bytes.byteLength - body) / 2;
      const samples = new Int16Array(count);
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true);
      const frameCount = count / channels;
      return { sampleRate, channels, bitsPerSample, frameCount, durationSec: frameCount / sampleRate, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}

/** Convert interleaved 16-bit samples back to float channels (for playback of the exact export). */
export function wavToFloat(info: WavInfo): Float32Array[] {
  const out = Array.from({ length: info.channels }, () => new Float32Array(info.frameCount));
  for (let i = 0; i < info.frameCount; i++) {
    for (let c = 0; c < info.channels; c++) out[c][i] = info.samples[i * info.channels + c] / 32768;
  }
  return out;
}
