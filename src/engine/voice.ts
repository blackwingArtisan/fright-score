import { CONTROL_BLOCK, MOD_SCALE_CYCLES, SAMPLE_RATE } from './constants';
import { getAlgorithm, type Algorithm } from './algorithms';
import { Operator } from './operator';
import type { Patch } from './patches';
import { sineCycles } from './sine';

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface VoiceNote {
  midi: number;
  velocity: number;
  /** Pitch glide target in semitones relative to `midi` (negative = down). */
  bendSemis?: number;
  /** Time the glide takes, in seconds. */
  bendSec?: number;
}

/**
 * One sounding note: four operators wired by the patch's algorithm, plus a patch LFO
 * (vibrato and tremolo) and an optional pitch glide, updated at control rate.
 */
export class Voice {
  readonly ops: Operator[];
  private readonly algo: Algorithm;
  private readonly modScale: number[];
  private readonly carrierGain: number;
  private readonly lfoInc: number;
  private lfoPhase: number;
  private readonly vibratoCents: number;
  private readonly tremolo: number;
  private readonly bendCents: number;
  private readonly bendSamples: number;
  private age = 0;
  private pitchMul = 1;
  private ampMul = 1;
  private released = false;

  constructor(patch: Patch, note: VoiceNote, sampleRate = SAMPLE_RATE, lfoStartPhase = 0) {
    const noteHz = midiToHz(note.midi);
    this.algo = getAlgorithm(patch.algorithm);
    this.ops = patch.ops.map((p, i) => new Operator(p, noteHz, i === 0 ? patch.feedback : 0, sampleRate));
    const vel = Math.max(0, Math.min(1, note.velocity));
    // Velocity brightens the tone (modulator depth) as well as the loudness (carrier level).
    const brightness = 0.55 + 0.45 * vel;
    this.modScale = [0, 1, 2, 3].map((i) =>
      this.algo.carriers.includes(i) ? 0 : MOD_SCALE_CYCLES * brightness,
    );
    this.carrierGain = vel * patch.gain;
    this.lfoInc = patch.lfo.rateHz / sampleRate;
    this.lfoPhase = lfoStartPhase;
    this.vibratoCents = patch.lfo.vibratoCents;
    this.tremolo = patch.lfo.tremolo;
    this.bendCents = (note.bendSemis ?? 0) * 100;
    this.bendSamples = Math.max(1, Math.round((note.bendSec ?? 0.1) * sampleRate));
    for (const op of this.ops) op.noteOn();
  }

  get active(): boolean {
    for (const c of this.algo.carriers) if (this.ops[c].env.active) return true;
    return false;
  }

  get isReleased(): boolean {
    return this.released;
  }

  noteOff(chokeSec?: number): void {
    this.released = true;
    for (const op of this.ops) op.env.noteOff(chokeSec);
  }

  private updateControl(): void {
    const lfo = sineCycles(this.lfoPhase);
    this.lfoPhase += this.lfoInc * CONTROL_BLOCK;
    let cents = this.vibratoCents * lfo;
    if (this.bendCents !== 0) {
      const t = Math.min(1, this.age / this.bendSamples);
      // Ease-out glide: fast at first, settling at the target, like a dropping heartbeat or a falling tom.
      cents += this.bendCents * (1 - (1 - t) * (1 - t));
    }
    this.pitchMul = Math.pow(2, cents / 1200);
    this.ampMul = 1 - this.tremolo * (0.5 + 0.5 * lfo);
  }

  /** Advance one sample and return the mono output. */
  tick(): number {
    if (this.age % CONTROL_BLOCK === 0) this.updateControl();
    this.age++;
    const ops = this.ops;
    const inputs = this.algo.inputs;
    const pm = this.pitchMul;
    for (let i = 0; i < 4; i++) {
      const src = inputs[i];
      let mod = 0;
      for (let j = 0; j < src.length; j++) mod += ops[src[j]].out * this.modScale[src[j]];
      ops[i].tick(mod, pm);
    }
    let sum = 0;
    const carriers = this.algo.carriers;
    for (let i = 0; i < carriers.length; i++) sum += ops[carriers[i]].out;
    return sum * this.carrierGain * this.ampMul;
  }
}
