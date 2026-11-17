import { FEEDBACK_CYCLES, SAMPLE_RATE } from './constants';
import { Envelope, type EnvelopeParams } from './envelope';
import { sineCycles } from './sine';

/** Settings for one FM operator inside a patch. */
export interface OperatorParams {
  /** Frequency multiple of the note's pitch (the chip's MUL; fractional ratios allowed here). */
  ratio: number;
  /** Fine detune in cents (the chip's DT). */
  detuneCents: number;
  /** Output level 0..1 (the inverse of the chip's total level). For modulators this is the modulation index. */
  level: number;
  env: EnvelopeParams;
  /** Optional fixed frequency in Hz that ignores the note's pitch (useful for clicks and noise). */
  fixedHz?: number;
}

/** Frequency in Hz that an operator runs at for a given note frequency. */
export function operatorFrequency(params: OperatorParams, noteHz: number): number {
  const base = params.fixedHz ?? noteHz * params.ratio;
  return base * Math.pow(2, params.detuneCents / 1200);
}

/**
 * One sine operator: a phase accumulator, an envelope and an output level.
 * Input modulation is in cycles and is added to the phase (phase modulation, as on the real chip).
 */
export class Operator {
  readonly env: Envelope;
  private phase = 0;
  private baseIncrement = 0;
  private readonly level: number;
  private prev1 = 0;
  private prev2 = 0;
  private readonly feedbackDepth: number;
  /** Most recent output sample, read by the routing algorithm. */
  out = 0;

  constructor(params: OperatorParams, noteHz: number, feedback = 0, sampleRate = SAMPLE_RATE) {
    this.env = new Envelope(params.env, sampleRate);
    this.level = params.level;
    this.baseIncrement = operatorFrequency(params, noteHz) / sampleRate;
    const fb = Math.max(0, Math.min(7, Math.round(feedback)));
    this.feedbackDepth = FEEDBACK_CYCLES[fb];
  }

  noteOn(): void {
    this.env.noteOn();
  }

  /**
   * Advance one sample.
   * @param modCycles phase modulation from other operators, in cycles
   * @param pitchMul frequency multiplier from vibrato and pitch bend (1 = none)
   */
  tick(modCycles: number, pitchMul: number): number {
    const envLevel = this.env.next();
    let mod = modCycles;
    if (this.feedbackDepth > 0) mod += ((this.prev1 + this.prev2) * 0.5) * this.feedbackDepth;
    const sample = envLevel === 0 ? 0 : sineCycles(this.phase + mod) * envLevel * this.level;
    this.phase += this.baseIncrement * pitchMul;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    this.prev2 = this.prev1;
    this.prev1 = sample;
    this.out = sample;
    return sample;
  }
}
