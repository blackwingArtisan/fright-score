import { SAMPLE_RATE } from './constants';

/**
 * Five-stage FM envelope, after the YM2612's AR / D1R / SL / D2R / RR, expressed in seconds.
 * - attack: linear rise from the current level to full scale.
 * - decay: exponential fall to the sustain level.
 * - sustain: hold at `sustain`, or keep falling slowly when `sustainDecaySec` > 0.
 * - release: exponential fall to silence after note-off.
 */
export interface EnvelopeParams {
  attackSec: number;
  decaySec: number;
  /** Sustain level, 0..1 of full scale. */
  sustain: number;
  /** Time for the sustain stage to fall by 60 dB. 0 holds the level. */
  sustainDecaySec: number;
  /** Time for the release stage to fall by 60 dB. */
  releaseSec: number;
}

export type EnvelopeStage = 'attack' | 'decay' | 'sustain' | 'release' | 'off';

/** Level below which the envelope is considered silent (-80 dB). */
export const ENVELOPE_FLOOR = 1e-4;
const LN_1000 = Math.log(1000);

/** Per-sample multiplier that falls by 60 dB in `seconds`. */
export function decayCoefficient(seconds: number, sampleRate = SAMPLE_RATE): number {
  if (seconds <= 0) return 0;
  return Math.exp(-LN_1000 / (seconds * sampleRate));
}

export class Envelope {
  stage: EnvelopeStage = 'off';
  level = 0;
  private readonly attackStep: number;
  private readonly decayCoef: number;
  private readonly sustainCoef: number;
  private releaseCoef: number;
  private readonly sustain: number;

  constructor(params: EnvelopeParams, sampleRate = SAMPLE_RATE) {
    this.attackStep = params.attackSec <= 0 ? 1 : 1 / (params.attackSec * sampleRate);
    this.decayCoef = decayCoefficient(params.decaySec, sampleRate);
    this.sustainCoef = params.sustainDecaySec > 0 ? decayCoefficient(params.sustainDecaySec, sampleRate) : 1;
    this.releaseCoef = decayCoefficient(Math.max(params.releaseSec, 0.001), sampleRate);
    this.sustain = Math.min(1, Math.max(0, params.sustain));
  }

  noteOn(): void {
    this.stage = 'attack';
  }

  /** Enter release. `chokeSec` forces a faster release, used to cut notes before a sting. */
  noteOff(chokeSec?: number, sampleRate = SAMPLE_RATE): void {
    if (this.stage === 'off') return;
    if (chokeSec !== undefined) this.releaseCoef = decayCoefficient(Math.max(chokeSec, 0.001), sampleRate);
    this.stage = 'release';
  }

  get active(): boolean {
    return this.stage !== 'off';
  }

  /** Advance one sample and return the new level (0..1). */
  next(): number {
    switch (this.stage) {
      case 'attack':
        this.level += this.attackStep;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = 'decay';
        }
        break;
      case 'decay':
        this.level = this.sustain + (this.level - this.sustain) * this.decayCoef;
        if (this.level - this.sustain < 1e-4) {
          this.level = this.sustain;
          this.stage = 'sustain';
        }
        break;
      case 'sustain':
        this.level *= this.sustainCoef;
        if (this.level < ENVELOPE_FLOOR) {
          this.level = 0;
          this.stage = 'off';
        }
        break;
      case 'release':
        this.level *= this.releaseCoef;
        if (this.level < ENVELOPE_FLOOR) {
          this.level = 0;
          this.stage = 'off';
        }
        break;
      case 'off':
        break;
    }
    return this.level;
  }
}
