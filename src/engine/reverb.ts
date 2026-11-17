import { SAMPLE_RATE } from './constants';

/** Classic Schroeder/Moorer reverb (the Freeverb topology): 8 damped combs and 4 allpasses per side. */
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];
const STEREO_SPREAD = 23;

class Comb {
  private readonly buffer: Float32Array;
  private index = 0;
  private store = 0;
  constructor(size: number, private readonly feedback: number, private readonly damp: number) {
    this.buffer = new Float32Array(size);
  }
  process(input: number): number {
    const out = this.buffer[this.index];
    this.store = out * (1 - this.damp) + this.store * this.damp;
    this.buffer[this.index] = input + this.store * this.feedback;
    if (++this.index >= this.buffer.length) this.index = 0;
    return out;
  }
}

class Allpass {
  private readonly buffer: Float32Array;
  private index = 0;
  constructor(size: number) {
    this.buffer = new Float32Array(size);
  }
  process(input: number): number {
    const buffered = this.buffer[this.index];
    this.buffer[this.index] = input + buffered * 0.5;
    if (++this.index >= this.buffer.length) this.index = 0;
    return buffered - input;
  }
}

export interface ReverbOptions {
  /** 0..1, larger is a longer tail. */
  roomSize: number;
  /** 0..1, larger darkens the tail. */
  damping: number;
}

export const CRYPT_REVERB: ReverbOptions = { roomSize: 0.88, damping: 0.35 };

/**
 * Run a mono send buffer through the stereo reverb and add the wet signal into left/right.
 */
export function applyReverb(
  send: Float32Array,
  left: Float32Array,
  right: Float32Array,
  options: ReverbOptions = CRYPT_REVERB,
  sampleRate = SAMPLE_RATE,
): void {
  const scale = sampleRate / 44_100;
  const feedback = 0.7 + 0.28 * options.roomSize;
  const damp = 0.4 * options.damping;
  const make = (offset: number) => ({
    combs: COMB_TUNING.map((t) => new Comb(Math.round((t + offset) * scale), feedback, damp)),
    allpasses: ALLPASS_TUNING.map((t) => new Allpass(Math.round((t + offset) * scale))),
  });
  const l = make(0);
  const r = make(STEREO_SPREAD);
  const inputGain = 0.015;
  for (let i = 0; i < send.length; i++) {
    const x = send[i] * inputGain;
    let outL = 0;
    let outR = 0;
    for (let c = 0; c < 8; c++) {
      outL += l.combs[c].process(x);
      outR += r.combs[c].process(x);
    }
    for (let a = 0; a < 4; a++) {
      outL = l.allpasses[a].process(outL);
      outR = r.allpasses[a].process(outR);
    }
    left[i] += outL;
    right[i] += outR;
  }
}
