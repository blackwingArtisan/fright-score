/**
 * Master chain helpers. Order used by the renderer:
 * DC blocker -> output low-pass -> drive into a soft limiter -> fade in/out -> true-peak normalize to the ceiling.
 */

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

/** One-pole DC blocking filter, in place. */
export function dcBlock(samples: Float32Array, r = 0.9995): void {
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    samples[i] = y;
  }
}

/**
 * Gentle two-pole low-pass, in place. Stands in for the analog output filter that sat after
 * the original chip's DAC, and tames aliasing from high feedback settings.
 */
export function lowpass(samples: Float32Array, cutoffHz: number, sampleRate: number): void {
  const a = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    y1 += a * (samples[i] - y1);
    y2 += a * (y1 - y2);
    samples[i] = y2;
  }
}

const TP_TAPS = 16;
const TP_PHASES = [0.25, 0.5, 0.75];
/** Hann-windowed sinc kernels for 4x oversampling, one per fractional position. */
const TP_KERNELS = TP_PHASES.map((frac) => {
  const k = new Float64Array(TP_TAPS);
  for (let j = 0; j < TP_TAPS; j++) {
    const x = j - (TP_TAPS / 2 - 1) - frac;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (TP_TAPS / 2));
    k[j] = sinc * w;
  }
  return k;
});

/**
 * Estimated true (inter-sample) peak using 4x windowed-sinc oversampling, close to ITU-R BS.1770.
 * Keeps exports below the ceiling even after a DAC or a lossy encoder reconstructs the waveform.
 * Only samples near the sample peak are oversampled, since quiet regions cannot hold the true peak.
 */
export function truePeakOf(...channels: Float32Array[]): number {
  const samplePeak = peakOf(...channels);
  let peak = samplePeak;
  const gate = samplePeak * 0.5;
  const half = TP_TAPS / 2 - 1;
  for (const ch of channels) {
    for (let i = half; i + TP_TAPS - half < ch.length; i++) {
      if (Math.abs(ch[i]) < gate && Math.abs(ch[i + 1]) < gate) continue;
      for (const kernel of TP_KERNELS) {
        let v = 0;
        for (let j = 0; j < TP_TAPS; j++) v += ch[i - half + j] * kernel[j];
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
    }
  }
  return peak;
}

/**
 * Soft limiter: transparent below `threshold`, then a tanh knee that approaches but never reaches 1.0.
 */
export function softLimit(x: number, threshold = 0.6): number {
  const a = Math.abs(x);
  if (a <= threshold) return x;
  const knee = 1 - threshold;
  const y = threshold + knee * Math.tanh((a - threshold) / knee);
  return x < 0 ? -y : y;
}

export function peakOf(...channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export function rmsOf(...channels: Float32Array[]): number {
  let sum = 0;
  let n = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    n += ch.length;
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

export function applyGain(gain: number, ...channels: Float32Array[]): void {
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
}

/** Raised-cosine fade in over `fadeSec` and fade out over the last `fadeOutSec`. */
export function applyFades(channels: Float32Array[], sampleRate: number, fadeInSec: number, fadeOutSec: number): void {
  const length = channels[0]?.length ?? 0;
  const inN = Math.min(length, Math.round(fadeInSec * sampleRate));
  const outN = Math.min(length, Math.round(fadeOutSec * sampleRate));
  for (const ch of channels) {
    for (let i = 0; i < inN; i++) ch[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / inN);
    for (let i = 0; i < outN; i++) {
      const idx = length - 1 - i;
      ch[idx] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / outN);
    }
  }
}

export interface MasterOptions {
  sampleRate: number;
  fadeInSec: number;
  fadeOutSec: number;
  /** Final peak ceiling in dBFS (negative). */
  ceilingDb: number;
  /** How far the loudest peak is pushed into the limiter before normalization, in dB. */
  driveDb: number;
  /** Output low-pass cutoff in Hz. */
  lowpassHz: number;
  /** Treat the audio as a loop: filters are warmed with the end so the wrap point stays seamless. */
  circular?: boolean;
}

export const DEFAULT_MASTER: MasterOptions = {
  sampleRate: 44_100,
  fadeInSec: 0.08,
  fadeOutSec: 1.5,
  ceilingDb: -1,
  driveDb: 4,
  lowpassHz: 11_000,
};

/** Run the full master chain on a stereo pair, in place. Returns the final true peak (linear). */
export function master(left: Float32Array, right: Float32Array, options: MasterOptions = DEFAULT_MASTER): number {
  for (const ch of [left, right]) {
    if (options.circular) {
      // Run the filters over the last stretch first, so their state at sample 0 matches the loop's end.
      const warm = Math.min(ch.length, 16_384);
      const tmp = new Float32Array(warm + ch.length);
      tmp.set(ch.subarray(ch.length - warm), 0);
      tmp.set(ch, warm);
      dcBlock(tmp);
      lowpass(tmp, options.lowpassHz, options.sampleRate);
      ch.set(tmp.subarray(warm));
    } else {
      dcBlock(ch);
      lowpass(ch, options.lowpassHz, options.sampleRate);
    }
  }
  const rawPeak = peakOf(left, right);
  if (rawPeak === 0) return 0;
  const drive = dbToGain(options.driveDb) / rawPeak;
  for (const ch of [left, right]) {
    for (let i = 0; i < ch.length; i++) ch[i] = softLimit(ch[i] * drive);
  }
  applyFades([left, right], options.sampleRate, options.fadeInSec, options.fadeOutSec);
  const peak = truePeakOf(left, right);
  const target = dbToGain(options.ceilingDb);
  applyGain(target / peak, left, right);
  return target;
}
