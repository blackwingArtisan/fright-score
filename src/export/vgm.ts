import type { EnvelopeParams } from '../engine/envelope';
import type { OperatorParams } from '../engine/operator';
import { getPatch, type Patch, type PatchId } from '../engine/patches';
import type { Note, Score, Track } from '../score/schema';

/**
 * Sega Genesis / Mega Drive export.
 *
 * Maps every FS-666 patch onto the Yamaha YM2612 (the Genesis sound chip the FS-666 is modelled on),
 * arranges the score for its six FM channels, and writes the result as a VGM file: the register writes a
 * Genesis would make, with sample-accurate waits between them. Any VGM player or Genesis emulator plays it.
 *
 * The export is a reduction, the way Genesis composers worked: up to six notes at once, chosen by role
 * (the sting always wins), envelopes and levels quantized to the chip's register steps, one global LFO.
 */

/** Master clock of an NTSC Genesis; the YM2612 runs at this divided by 144 (about 53.3 kHz). */
export const YM2612_CLOCK_HZ = 7_670_453;
/** VGM timing is always in 44.1 kHz samples. */
export const VGM_SAMPLE_RATE = 44_100;
/** FM channels on the chip. */
export const YM2612_CHANNELS = 6;

const CHIP_RATE_HZ = YM2612_CLOCK_HZ / 144;
/** The envelope generator steps once every three chip samples. */
const EG_CLOCK_HZ = CHIP_RATE_HZ / 3;
/** Total level: 0.75 dB per step. Sustain level: 3 dB per step. */
const TL_STEP_DB = 0.75;
const SL_STEP_DB = 3;
/** The envelope spans 96 dB in 1024 steps. */
const EG_RANGE_DB = 96;
/** Our envelopes give decay, sustain-decay and release as the time to fall 60 dB. */
const ENGINE_DECAY_DB = 60;
/** Headroom so six full channels summed on the chip do not clip. */
const MIX_HEADROOM_DB = 4.5;

/** Operator register offsets inside a channel block. The chip orders its slots OP1, OP3, OP2, OP4. */
const OP_OFFSET = [0x0, 0x8, 0x4, 0xc] as const;
/** Key-on register (0x28) slot bits for OP1..OP4. */
const ALL_SLOTS = 0xf0;

/** Average envelope increment per update for rates below 48, by the low two bits of the rate. */
const EG_INC_LOW = [0.5, 0.625, 0.75, 0.875] as const;
/** Envelope increment per EG clock for rates 48..63. */
const EG_INC_HIGH = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 8, 8, 8] as const;

/** One YM2612 operator, in register units. */
export interface YmOperator {
  /** Detune, 0-7 (1-3 sharp, 5-7 flat). */
  dt: number;
  /** Frequency multiple, 0-15 (0 means one half). */
  mul: number;
  /** Total level (attenuation), 0-127, 0.75 dB per step. */
  tl: number;
  /** Attack rate, 0-31. */
  ar: number;
  /** First decay rate, 0-31. */
  d1r: number;
  /** Second (sustain) decay rate, 0-31. */
  d2r: number;
  /** Sustain level, 0-15, 3 dB per step. */
  d1l: number;
  /** Release rate, 0-15. */
  rr: number;
}

/** An FS-666 patch translated into YM2612 registers. */
export interface YmPatch {
  id: PatchId;
  algorithm: number;
  feedback: number;
  ops: [YmOperator, YmOperator, YmOperator, YmOperator];
  /** Frequency modulation sensitivity (vibrato depth), 0-7. */
  fms: number;
  /** Which operators reach the output in this algorithm. */
  carriers: readonly number[];
}

/** Carriers of each of the eight algorithms (the same routing table the FS-666 uses). */
const CARRIERS: readonly (readonly number[])[] = [[3], [3], [3], [3], [1, 3], [1, 2, 3], [1, 2, 3], [0, 1, 2, 3]];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dbOf = (gain: number) => (gain <= 0 ? Infinity : -20 * Math.log10(gain));

/** Seconds for the envelope to travel its full 96 dB at an effective rate 0-63 (Infinity when frozen). */
export function envelopeTime96(effectiveRate: number): number {
  const r = clamp(Math.round(effectiveRate), 0, 63);
  if (r < 4) return Infinity;
  const perClock = r < 48 ? EG_INC_LOW[r & 3] / 2 ** (11 - (r >> 2)) : EG_INC_HIGH[r - 48];
  return 1024 / perClock / EG_CLOCK_HZ;
}

/**
 * Attack takes roughly a ninth of the decay time at the same rate, because the chip's attack is a
 * curve that closes a fixed fraction of the remaining distance per step. Rates 62 and 63 are instant.
 */
export function attackTime(effectiveRate: number): number {
  return effectiveRate >= 62 ? 0 : envelopeTime96(effectiveRate) * 0.108;
}

/** Frequency multiple for an operator ratio (0.5 is register value 0). */
export function mulFor(ratio: number): number {
  return ratio < 0.75 ? 0 : clamp(Math.round(ratio), 1, 15);
}

/** Detune register for a detune in cents: the chip only offers a few small steps either way. */
export function dtFor(cents: number): number {
  if (Math.abs(cents) < 1.5) return 0;
  const steps = clamp(Math.ceil(Math.abs(cents) / 4), 1, 3);
  return cents > 0 ? steps : 4 + steps;
}

/** Total level (attenuation) for a linear operator level 0..1, plus extra attenuation in dB. */
export function tlFor(level: number, extraDb = 0): number {
  return clamp(Math.round((dbOf(level) + extraDb) / TL_STEP_DB), 0, 127);
}

/** The register value whose slope best matches falling 60 dB in `seconds` (0 when the level holds). */
function rateFor(seconds: number, maxReg: number, effectiveOf: (reg: number) => number): number {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return 0;
  const wanted = Math.log((seconds * EG_RANGE_DB) / ENGINE_DECAY_DB);
  let best = 1;
  let bestErr = Infinity;
  for (let reg = 1; reg <= maxReg; reg++) {
    const err = Math.abs(Math.log(envelopeTime96(effectiveOf(reg))) - wanted);
    if (err < bestErr) {
      bestErr = err;
      best = reg;
    }
  }
  return best;
}

/** Attack register for a linear attack lasting `seconds`. */
export function arFor(seconds: number): number {
  if (seconds <= 0.0015) return 31;
  let best = 31;
  let bestErr = Infinity;
  for (let reg = 1; reg <= 31; reg++) {
    const t = attackTime(reg * 2);
    const err = Math.abs(Math.log(Math.max(t, 1e-4)) - Math.log(seconds));
    if (err < bestErr) {
      bestErr = err;
      best = reg;
    }
  }
  return best;
}

/** Envelope registers for an FS-666 envelope. */
export function envelopeRegisters(env: EnvelopeParams): Pick<YmOperator, 'ar' | 'd1r' | 'd2r' | 'd1l' | 'rr'> {
  const d1l = env.sustain <= 0 ? 15 : clamp(Math.round(dbOf(env.sustain) / SL_STEP_DB), 0, 15);
  return {
    ar: arFor(env.attackSec),
    d1r: env.sustain >= 1 ? 0 : rateFor(env.decaySec, 31, (reg) => reg * 2),
    d2r: rateFor(env.sustainDecaySec, 31, (reg) => reg * 2),
    d1l,
    rr: rateFor(Math.max(env.releaseSec, 0.01), 15, (reg) => reg * 2 + 1),
  };
}

/** Frequency multiple used for a fixed-frequency operator (the drum's stick noise), against a low tom. */
const FIXED_REFERENCE_HZ = 110;

function ymOperator(op: OperatorParams): YmOperator {
  return {
    dt: dtFor(op.detuneCents),
    mul: mulFor(op.fixedHz !== undefined ? op.fixedHz / FIXED_REFERENCE_HZ : op.ratio),
    tl: tlFor(op.level),
    ...envelopeRegisters(op.env),
  };
}

/** Vibrato depth steps (cents) the chip offers for FMS 0-7. */
const FMS_CENTS = [0, 3.4, 6.7, 10, 14, 20, 40, 80] as const;

/** Translate an FS-666 patch into YM2612 registers. */
export function ymPatch(patch: Patch): YmPatch {
  // The chip has one LFO for every channel; only patches with a real vibrato (not a slow drift) use it.
  const vibrato = patch.lfo.rateHz >= 3 ? patch.lfo.vibratoCents : 0;
  let fms = 0;
  for (let i = 0; i < FMS_CENTS.length; i++) if (Math.abs(FMS_CENTS[i] - vibrato) < Math.abs(FMS_CENTS[fms] - vibrato)) fms = i;
  return {
    id: patch.id,
    algorithm: patch.algorithm,
    feedback: clamp(Math.round(patch.feedback), 0, 7),
    ops: patch.ops.map(ymOperator) as YmPatch['ops'],
    fms,
    carriers: CARRIERS[patch.algorithm],
  };
}

/** Block and 11-bit frequency number for a pitch in Hz. */
export function fnumBlock(hz: number): { block: number; fnum: number } {
  for (let block = 0; block < 8; block++) {
    const fnum = Math.round((hz * 2 ** (21 - block)) / CHIP_RATE_HZ);
    if (fnum < 2048) return { block, fnum: Math.max(1, fnum) };
  }
  return { block: 7, fnum: 2047 };
}

/** The pitch in Hz that a block and frequency number play. */
export function hzOf(block: number, fnum: number): number {
  return (fnum * CHIP_RATE_HZ) / 2 ** (21 - block);
}

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** How much each role matters when six channels are not enough: the sting always wins. */
const ROLE_PRIORITY: Record<string, number> = {
  stinger: 7,
  bass: 5,
  pulse: 5,
  percussion: 5,
  motif: 5,
  drone: 4,
  choir: 2,
  texture: 1,
};
/** Riser notes build the scare, so they outrank the pad they rise out of. */
const TRACK_PRIORITY: Record<string, number> = { riser: 6, boom: 7 };

interface NoteEvent {
  start: number;
  off: number;
  track: Track;
  note: Note;
  patch: YmPatch;
  priority: number;
  order: number;
  /** Channel the note was given, and the sample at which it lost that channel (cut or died away). */
  channel?: number;
  endAt?: number;
}

interface ChannelState {
  owner: NoteEvent | undefined;
  /** Sample at which the note was keyed off, or will be. */
  offAt: number;
  /** Sample by which its release has died away. */
  freeAt: number;
  patch: PatchId | undefined;
  /** The last note to play here, kept after key-off so its bend steps stop when the channel is reused. */
  lastOwner?: NoteEvent;
}

/** Statistics about how the score was arranged for the chip. */
export interface VgmStats {
  notes: number;
  /** Notes that found no channel (all six were busy with more important notes). */
  dropped: number;
  /** Notes cut short to make room for a more important one. */
  stolen: number;
  registerWrites: number;
  totalSamples: number;
}

export interface VgmResult {
  bytes: Uint8Array;
  stats: VgmStats;
}

/** A timestamped register write. Port 0 drives channels 1-3, port 1 channels 4-6. */
interface Write {
  at: number;
  seq: number;
  port: 0 | 1;
  reg: number;
  value: number;
}

class RegisterLog {
  readonly writes: Write[] = [];
  private seq = 0;
  /** Shadow registers so unchanged values are not written again. */
  private readonly shadow = new Map<number, number>();

  write(at: number, port: 0 | 1, reg: number, value: number, force = false): void {
    const key = (port << 8) | reg;
    if (!force && this.shadow.get(key) === value) return;
    this.shadow.set(key, value);
    this.writes.push({ at, seq: this.seq++, port, reg, value: value & 0xff });
  }
}

const portOf = (ch: number): 0 | 1 => (ch < 3 ? 0 : 1);
const slotOf = (ch: number) => ch % 3;
/** Channel code for the key-on register: 0-2, then 4-6. */
const keyCode = (ch: number) => (ch < 3 ? ch : ch + 1);

function writePatch(log: RegisterLog, at: number, ch: number, patch: YmPatch, carrierExtraDb: number): void {
  const port = portOf(ch);
  const c = slotOf(ch);
  patch.ops.forEach((op, i) => {
    const o = OP_OFFSET[i] + c;
    const tl = patch.carriers.includes(i) ? clamp(op.tl + Math.round(carrierExtraDb / TL_STEP_DB), 0, 127) : op.tl;
    log.write(at, port, 0x30 + o, ((op.dt & 7) << 4) | (op.mul & 15));
    log.write(at, port, 0x40 + o, tl & 127);
    log.write(at, port, 0x50 + o, op.ar & 31);
    log.write(at, port, 0x60 + o, op.d1r & 31);
    log.write(at, port, 0x70 + o, op.d2r & 31);
    log.write(at, port, 0x80 + o, ((op.d1l & 15) << 4) | (op.rr & 15));
    log.write(at, port, 0x90 + o, 0);
  });
  log.write(at, port, 0xb0 + c, ((patch.feedback & 7) << 3) | (patch.algorithm & 7));
}

function writePitch(log: RegisterLog, at: number, ch: number, hz: number): void {
  const { block, fnum } = fnumBlock(hz);
  const port = portOf(ch);
  const c = slotOf(ch);
  // The high byte latches until the low byte is written, so it always goes first.
  log.write(at, port, 0xa4 + c, ((block & 7) << 3) | ((fnum >> 8) & 7), true);
  log.write(at, port, 0xa0 + c, fnum & 0xff, true);
}

function writePan(log: RegisterLog, at: number, ch: number, pan: number, fms: number): void {
  const lr = pan < -0.5 ? 0x80 : pan > 0.5 ? 0x40 : 0xc0;
  log.write(at, portOf(ch), 0xb4 + slotOf(ch), lr | (fms & 7));
}

/** Pitch updates per second while a note bends (a typical sound driver ran at the 60 Hz frame rate). */
const BEND_UPDATE_HZ = 60;
/** A choked note releases this fast (fastest release register). */
const CHOKE_RR = 15;

/** Arrange a score for the YM2612 and return its register writes in time order. */
function arrange(score: Score): { log: RegisterLog; stats: Omit<VgmStats, 'registerWrites'> } {
  const sr = VGM_SAMPLE_RATE;
  const totalSamples = Math.ceil(score.durationSec * sr);
  const patches = new Map<PatchId, YmPatch>();
  const ymOf = (id: PatchId) => {
    let p = patches.get(id);
    if (!p) patches.set(id, (p = ymPatch(getPatch(id))));
    return p;
  };

  const events: NoteEvent[] = [];
  let order = 0;
  for (const track of score.tracks) {
    const base = TRACK_PRIORITY[track.id] ?? ROLE_PRIORITY[track.role] ?? 3;
    for (const note of track.notes) {
      const start = Math.round(note.atSec * sr);
      if (start >= totalSamples) continue;
      events.push({
        start,
        off: Math.min(totalSamples, Math.round((note.atSec + note.durSec) * sr)),
        track,
        note,
        patch: ymOf(track.patchId),
        priority: base + note.velocity * 0.5,
        order: order++,
      });
    }
  }
  events.sort((a, b) => a.start - b.start || b.priority - a.priority || a.order - b.order);

  const log = new RegisterLog();
  // Global setup: LFO on at 5.56 Hz for vibrato patches, channel 3 in normal mode, DAC off.
  log.write(0, 0, 0x22, 0x08 | 1, true);
  log.write(0, 0, 0x27, 0x00, true);
  log.write(0, 0, 0x2b, 0x00, true);
  for (let ch = 0; ch < YM2612_CHANNELS; ch++) log.write(0, 0, 0x28, keyCode(ch), true);

  const channels: ChannelState[] = Array.from({ length: YM2612_CHANNELS }, () => ({ owner: undefined, offAt: 0, freeAt: 0, patch: undefined }));
  const pendingOffs: { at: number; ch: number; owner: NoteEvent; choke: boolean }[] = [];
  let dropped = 0;
  let stolen = 0;

  const flushOffs = (until: number) => {
    pendingOffs.sort((a, b) => a.at - b.at);
    while (pendingOffs.length > 0 && pendingOffs[0].at <= until) {
      const off = pendingOffs.shift()!;
      if (channels[off.ch].owner !== off.owner) continue;
      if (off.choke) {
        const port = portOf(off.ch);
        off.owner.patch.ops.forEach((op, i) => log.write(off.at, port, 0x80 + OP_OFFSET[i] + slotOf(off.ch), ((op.d1l & 15) << 4) | CHOKE_RR));
      }
      log.write(off.at, 0, 0x28, keyCode(off.ch), true);
      channels[off.ch].owner = undefined;
    }
  };

  for (const ev of events) {
    flushOffs(ev.start);
    const t = ev.start;
    const sounding = (c: ChannelState) => c.owner !== undefined && c.offAt > t;
    // 1. A silent channel, preferring one that already holds this patch.
    let ch = pick(channels, (c) => c.freeAt <= t && !sounding(c), (c) => (c.patch === ev.patch.id ? 0 : 1) * 1e9 + c.freeAt);
    // 2. A channel whose note is only ringing out.
    if (ch < 0) ch = pick(channels, (c) => !sounding(c), (c) => (c.patch === ev.patch.id ? 0 : 1) * 1e9 + c.offAt);
    // 3. Steal the least important sounding note, if this one matters more.
    if (ch < 0) {
      ch = pick(channels, (c) => c.owner !== undefined && c.owner.priority < ev.priority, (c) => c.owner!.priority * 1e9 + c.owner!.start);
      if (ch >= 0) stolen++;
    }
    if (ch < 0) {
      dropped++;
      continue;
    }

    const state = channels[ch];
    if (state.owner?.endAt !== undefined && state.owner.endAt > t) state.owner.endAt = t;
    if (state.lastOwner?.endAt !== undefined && state.lastOwner.endAt > t) state.lastOwner.endAt = t;
    const releaseSec = Math.max(...getPatch(ev.patch.id).ops.map((o) => o.env.releaseSec));
    log.write(t, 0, 0x28, keyCode(ch), true);
    const extraDb = MIX_HEADROOM_DB + dbOf(Math.max(0.02, ev.note.velocity)) + dbOf(getPatch(ev.patch.id).gain) - ev.track.gainDb;
    writePatch(log, t, ch, ev.patch, extraDb);
    writePan(log, t, ch, ev.note.pan ?? ev.track.pan, ev.patch.fms);
    writePitch(log, t, ch, midiHz(ev.note.midi));
    log.write(t, 0, 0x28, ALL_SLOTS | keyCode(ch), true);

    state.owner = ev;
    state.lastOwner = ev;
    state.patch = ev.patch.id;
    state.offAt = ev.off;
    state.freeAt = ev.off + Math.round((ev.note.choke ? 0.05 : releaseSec) * sr);
    ev.channel = ch;
    ev.endAt = state.freeAt;
    pendingOffs.push({ at: ev.off, ch, owner: ev, choke: ev.note.choke === true });
  }
  flushOffs(Infinity);

  // Pitch bends: the same ease-out curve as the FS-666 voice, stepped at a sound driver's 60 Hz frame
  // rate, and only while the note still holds its channel.
  const step = Math.round(sr / BEND_UPDATE_HZ);
  for (const ev of events) {
    if (!ev.note.bendSemis || ev.channel === undefined || ev.endAt === undefined) continue;
    const bendSamples = Math.max(1, Math.round((ev.note.bendSec ?? 0.1) * sr));
    const until = Math.min(ev.endAt - 1, ev.start + bendSamples, totalSamples - 1);
    const hz = midiHz(ev.note.midi);
    for (let at = ev.start + step; at <= until; at += step) {
      const x = Math.min(1, (at - ev.start) / bendSamples);
      const cents = ev.note.bendSemis * 100 * (1 - (1 - x) * (1 - x));
      writePitch(log, at, ev.channel, hz * 2 ** (cents / 1200));
    }
  }
  return { log, stats: { notes: events.length, dropped, stolen, totalSamples } };
}

function pick(channels: ChannelState[], ok: (c: ChannelState) => boolean, cost: (c: ChannelState) => number): number {
  let best = -1;
  let bestCost = Infinity;
  channels.forEach((c, i) => {
    if (!ok(c)) return;
    const k = cost(c);
    if (k < bestCost) {
      bestCost = k;
      best = i;
    }
  });
  return best;
}

const GD3_FIELDS = 11;

function gd3(title: string, notes: string): Uint8Array {
  // Track, track (JP), game, game (JP), system, system (JP), author, author (JP), date, ripper, notes.
  const fields = [title, '', 'Fright Score', '', 'Sega Mega Drive / Genesis', '', 'Fright Score FS-666 director', '', '', 'Fright Score', notes];
  if (fields.length !== GD3_FIELDS) throw new Error('GD3 needs 11 fields');
  const body = fields.map((f) => `${f}\0`).join('');
  const out = new Uint8Array(12 + body.length * 2);
  const view = new DataView(out.buffer);
  out.set([0x47, 0x64, 0x33, 0x20], 0); // "Gd3 "
  view.setUint32(4, 0x100, true);
  view.setUint32(8, body.length * 2, true);
  for (let i = 0; i < body.length; i++) view.setUint16(12 + i * 2, body.charCodeAt(i), true);
  return out;
}

const HEADER_BYTES = 0x40;

/** Render a score as a VGM file for the YM2612. Same score, same bytes. */
export function scoreToVgm(score: Score): VgmResult {
  const { log, stats } = arrange(score);
  const writes = log.writes.sort((a, b) => a.at - b.at || a.seq - b.seq);

  const data: number[] = [];
  const loop = score.plan.loop === true;
  let now = 0;
  const wait = (samples: number) => {
    let left = samples;
    while (left > 0) {
      if (left <= 16) {
        data.push(0x70 + left - 1);
        left = 0;
      } else {
        const n = Math.min(65_535, left);
        data.push(0x61, n & 0xff, n >> 8);
        left -= n;
      }
    }
  };
  // Setup writes happen at sample 0; a loop restarts just after them.
  let loopStart = -1;
  for (const w of writes) {
    if (loop && loopStart < 0 && (w.at > 0 || !isSetup(w))) loopStart = data.length;
    if (w.at > now) {
      wait(w.at - now);
      now = w.at;
    }
    data.push(w.port === 0 ? 0x52 : 0x53, w.reg, w.value);
  }
  if (loop && loopStart < 0) loopStart = data.length;
  if (stats.totalSamples > now) wait(stats.totalSamples - now);
  data.push(0x66);

  const tag = gd3(score.plan.title, `Seed ${score.seed}. Arranged for the YM2612 from a Fright Score cue.`);
  const total = HEADER_BYTES + data.length + tag.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x56, 0x67, 0x6d, 0x20], 0); // "Vgm "
  view.setUint32(0x04, total - 0x04, true);
  view.setUint32(0x08, 0x150, true);
  view.setUint32(0x14, HEADER_BYTES + data.length - 0x14, true);
  view.setUint32(0x18, stats.totalSamples, true);
  if (loop) {
    view.setUint32(0x1c, HEADER_BYTES + loopStart - 0x1c, true);
    view.setUint32(0x20, stats.totalSamples, true);
  }
  view.setUint32(0x24, 60, true);
  view.setUint32(0x2c, YM2612_CLOCK_HZ, true);
  view.setUint32(0x34, HEADER_BYTES - 0x34, true);
  out.set(data, HEADER_BYTES);
  out.set(tag, HEADER_BYTES + data.length);
  return { bytes: out, stats: { ...stats, registerWrites: writes.length } };
}

const isSetup = (w: Write) => w.at === 0 && w.port === 0 && (w.reg === 0x22 || w.reg === 0x27 || w.reg === 0x2b || (w.reg === 0x28 && (w.value & 0xf0) === 0));

/** A register write read back from a VGM file, with its time in 44.1 kHz samples. */
export interface VgmWrite {
  at: number;
  port: 0 | 1;
  reg: number;
  value: number;
}

export interface ParsedVgm {
  version: number;
  ym2612ClockHz: number;
  totalSamples: number;
  /** Byte offset where playback restarts, or undefined when the file does not loop. */
  loopOffset: number | undefined;
  loopSamples: number;
  writes: VgmWrite[];
  /** Sum of every wait command, which must equal `totalSamples`. */
  waitedSamples: number;
  title: string;
}

/** Read a VGM file written by `scoreToVgm` (YM2612 writes, waits and the end marker). */
export function parseVgm(bytes: Uint8Array): ParsedVgm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'Vgm ') throw new Error('Not a VGM file');
  const version = view.getUint32(0x08, true);
  const dataStart = version >= 0x150 ? 0x34 + view.getUint32(0x34, true) : 0x40;
  const loopRel = view.getUint32(0x1c, true);
  const writes: VgmWrite[] = [];
  let at = 0;
  let i = dataStart;
  for (;;) {
    if (i >= bytes.length) throw new Error('VGM data ends without an end marker');
    const cmd = bytes[i];
    if (cmd === 0x52 || cmd === 0x53) {
      writes.push({ at, port: cmd === 0x52 ? 0 : 1, reg: bytes[i + 1], value: bytes[i + 2] });
      i += 3;
    } else if (cmd === 0x61) {
      at += view.getUint16(i + 1, true);
      i += 3;
    } else if (cmd === 0x62) {
      at += 735;
      i += 1;
    } else if (cmd === 0x63) {
      at += 882;
      i += 1;
    } else if (cmd >= 0x70 && cmd <= 0x7f) {
      at += (cmd & 0x0f) + 1;
      i += 1;
    } else if (cmd === 0x66) {
      break;
    } else {
      throw new Error(`Unexpected VGM command 0x${cmd.toString(16)} at byte ${i}`);
    }
  }
  const gd3Rel = view.getUint32(0x14, true);
  let title = '';
  if (gd3Rel) {
    const g = 0x14 + gd3Rel + 12;
    for (let k = g; k + 1 < bytes.length; k += 2) {
      const c = view.getUint16(k, true);
      if (c === 0) break;
      title += String.fromCharCode(c);
    }
  }
  return {
    version,
    ym2612ClockHz: view.getUint32(0x2c, true),
    totalSamples: view.getUint32(0x18, true),
    loopOffset: loopRel ? 0x1c + loopRel : undefined,
    loopSamples: view.getUint32(0x20, true),
    writes,
    waitedSamples: at,
    title,
  };
}

/** Operator number (1-4) for a register's slot offset; the chip orders slots OP1, OP3, OP2, OP4. */
const SLOT_TO_OP = [1, 3, 2, 4] as const;

/** A register write in datasheet terms, for showing what the chip receives. */
export interface WriteLabel {
  /** Channel 1-6, or undefined for global registers. */
  channel: number | undefined;
  /** Operator 1-4, or undefined for channel and global registers. */
  op: number | undefined;
  /** Register mnemonic, such as "TL" or "KEY ON". */
  name: string;
  /** The value, decoded where it helps ("ops 1234", "alg 4 fb 3"). */
  detail: string;
}

const hexByte = (v: number) => `0x${v.toString(16).padStart(2, '0').toUpperCase()}`;

/** Describe a YM2612 register write the way the datasheet names it. */
export function describeWrite(w: Pick<VgmWrite, 'port' | 'reg' | 'value'>): WriteLabel {
  const hex = hexByte(w.value);
  if (w.reg === 0x28) {
    const code = w.value & 7;
    const channel = (code < 4 ? code : code - 1) + 1;
    const ops = [0, 1, 2, 3].filter((i) => w.value & (0x10 << i)).map((i) => i + 1);
    return ops.length ? { channel, op: undefined, name: 'KEY ON', detail: `ops ${ops.join('')}` } : { channel, op: undefined, name: 'KEY OFF', detail: hex };
  }
  if (w.reg < 0x30) {
    const names: Record<number, string> = { 0x22: 'LFO', 0x27: 'CH3 MODE', 0x2b: 'DAC' };
    return { channel: undefined, op: undefined, name: names[w.reg] ?? `REG ${hexByte(w.reg)}`, detail: hex };
  }
  const channel = w.port * 3 + (w.reg & 3) + 1;
  if (w.reg >= 0xa0) {
    const group = w.reg & 0xfc;
    if (group === 0xa0) return { channel, op: undefined, name: 'FNUM LO', detail: hex };
    if (group === 0xa4) return { channel, op: undefined, name: 'BLOCK/FNUM HI', detail: `block ${(w.value >> 3) & 7}` };
    if (group === 0xb0) return { channel, op: undefined, name: 'FB/ALG', detail: `alg ${w.value & 7} fb ${(w.value >> 3) & 7}` };
    if (group === 0xb4) return { channel, op: undefined, name: 'PAN/FMS', detail: `${['--', 'R', 'L', 'LR'][w.value >> 6]} fms ${w.value & 7}` };
    return { channel, op: undefined, name: `REG ${hexByte(w.reg)}`, detail: hex };
  }
  const op = SLOT_TO_OP[(w.reg >> 2) & 3];
  switch (w.reg & 0xf0) {
    case 0x30:
      return { channel, op, name: 'DT/MUL', detail: `mul ${w.value & 15} dt ${(w.value >> 4) & 7}` };
    case 0x40:
      return { channel, op, name: 'TL', detail: `${w.value & 127} (-${((w.value & 127) * TL_STEP_DB).toFixed(1)} dB)` };
    case 0x50:
      return { channel, op, name: 'AR', detail: String(w.value & 31) };
    case 0x60:
      return { channel, op, name: 'D1R', detail: String(w.value & 31) };
    case 0x70:
      return { channel, op, name: 'D2R', detail: String(w.value & 31) };
    case 0x80:
      return { channel, op, name: 'D1L/RR', detail: `sl ${w.value >> 4} rr ${w.value & 15}` };
    case 0x90:
      return { channel, op, name: 'SSG-EG', detail: hex };
    default:
      return { channel, op, name: `REG ${hexByte(w.reg)}`, detail: hex };
  }
}
