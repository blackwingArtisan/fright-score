import { describe, expect, it } from 'vitest';
import { PATCHES, PATCH_IDS } from '../../src/engine/patches';
import {
  YM2612_CLOCK_HZ,
  arFor,
  attackTime,
  describeWrite,
  dtFor,
  envelopeTime96,
  fnumBlock,
  hzOf,
  mulFor,
  parseVgm,
  scoreToVgm,
  tlFor,
  ymPatch,
} from '../../src/export/vgm';
import { arrange } from '../../src/score/arranger';
import { composePlan } from '../../src/score/composer';

const plan = composePlan({ seed: 7, scene: 'creeping dread, 90 seconds, builds to a sting at 1:10' });
const score = arrange(plan, 7);

/** Key-on writes (register 0x28 with operator bits set) as [sample, channel 0-5]. */
function keyOns(writes: ReturnType<typeof parseVgm>['writes']): [number, number][] {
  return writes
    .filter((w) => w.port === 0 && w.reg === 0x28 && (w.value & 0xf0) !== 0)
    .map((w) => [w.at, (w.value & 7) < 3 ? w.value & 7 : (w.value & 7) - 1]);
}

describe('YM2612 register mapping', () => {
  it('tunes A4 to 440 Hz within one cent, in every octave the chip covers', () => {
    for (const hz of [55, 110, 220, 440, 880, 1760, 3520]) {
      const { block, fnum } = fnumBlock(hz);
      expect(fnum).toBeLessThan(2048);
      expect(Math.abs(1200 * Math.log2(hzOf(block, fnum) / hz))).toBeLessThan(1);
    }
    expect(fnumBlock(440)).toEqual({ block: 4, fnum: 1083 });
  });

  it('maps operator levels, ratios and detune onto register steps', () => {
    expect(tlFor(1)).toBe(0);
    expect(tlFor(0.5)).toBe(8); // -6.02 dB at 0.75 dB per step
    expect(tlFor(0)).toBe(127);
    expect(mulFor(0.5)).toBe(0);
    expect(mulFor(1)).toBe(1);
    expect(mulFor(2.003)).toBe(2);
    expect(mulFor(40)).toBe(15);
    expect(dtFor(0)).toBe(0);
    expect(dtFor(7)).toBe(2);
    expect(dtFor(-9)).toBe(7);
  });

  it('models the envelope generator: slower rates take longer, the fastest attack is instant', () => {
    for (let r = 4; r < 63; r++) expect(envelopeTime96(r + 1)).toBeLessThanOrEqual(envelopeTime96(r));
    expect(envelopeTime96(0)).toBe(Infinity);
    expect(envelopeTime96(63) * 1000).toBeCloseTo(7.2, 0);
    expect(attackTime(62)).toBe(0);
    expect(arFor(0.001)).toBe(31);
    expect(arFor(2)).toBeLessThan(arFor(0.05));
  });

  it('translates every FS-666 patch into valid register values', () => {
    for (const id of PATCH_IDS) {
      const p = ymPatch(PATCHES[id]);
      expect(p.algorithm).toBe(PATCHES[id].algorithm);
      expect(p.feedback).toBe(PATCHES[id].feedback);
      expect(p.fms).toBeGreaterThanOrEqual(0);
      expect(p.fms).toBeLessThanOrEqual(7);
      for (const op of p.ops) {
        expect(op.mul).toBeGreaterThanOrEqual(0);
        expect(op.mul).toBeLessThanOrEqual(15);
        expect(op.tl).toBeGreaterThanOrEqual(0);
        expect(op.tl).toBeLessThanOrEqual(127);
        expect(op.ar).toBeGreaterThanOrEqual(1);
        expect(op.ar).toBeLessThanOrEqual(31);
        expect(op.d1l).toBeLessThanOrEqual(15);
        expect(op.rr).toBeGreaterThanOrEqual(1);
        expect(op.rr).toBeLessThanOrEqual(15);
      }
    }
    // A slow pad attacks slowly, a percussive bell instantly.
    expect(ymPatch(PATCHES['wraith-pad']).ops[1].ar).toBeLessThan(15);
    expect(ymPatch(PATCHES['glass-bell']).ops[1].ar).toBe(31);
    // The theremin lead is in the library, maps with a vibrato depth step, and attacks softly.
    expect(PATCH_IDS).toContain('theremin-lead');
    const theremin = ymPatch(PATCHES['theremin-lead']);
    expect(theremin.fms).toBe(6);
    expect(theremin.ops[1].ar).toBeLessThan(15);
  });
});

describe('VGM export', () => {
  const { bytes, stats } = scoreToVgm(score);
  const vgm = parseVgm(bytes);

  it('writes a VGM 1.50 file for an NTSC YM2612 that runs exactly as long as the cue', () => {
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('Vgm ');
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 4);
    expect(vgm.version).toBe(0x150);
    expect(vgm.ym2612ClockHz).toBe(YM2612_CLOCK_HZ);
    expect(vgm.totalSamples).toBe(90 * 44_100);
    expect(vgm.waitedSamples).toBe(vgm.totalSamples);
    expect(vgm.loopOffset).toBeUndefined();
    expect(vgm.title).toBe(score.plan.title);
    expect(stats.registerWrites).toBe(vgm.writes.length);
  });

  it('is deterministic: the same score gives the same bytes', () => {
    expect(Buffer.from(scoreToVgm(score).bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it('only uses the six FM channels and valid registers', () => {
    for (const w of vgm.writes) {
      expect(w.value).toBeGreaterThanOrEqual(0);
      expect(w.value).toBeLessThanOrEqual(255);
      if (w.reg >= 0x30) expect(w.reg & 3).not.toBe(3); // slot 3 of a bank does not exist
    }
    for (const [, ch] of keyOns(vgm.writes)) expect(ch).toBeGreaterThanOrEqual(0);
    // The DAC stays off, so channel 6 is FM.
    expect(vgm.writes.find((w) => w.reg === 0x2b)?.value).toBe(0);
  });

  it('lands the sting on its sample and gives it every channel', () => {
    const stingAt = 70 * 44_100;
    const atSting = keyOns(vgm.writes).filter(([at]) => at === stingAt);
    const stingNotes = score.tracks.filter((t) => t.role === 'stinger').reduce((n, t) => n + t.notes.filter((x) => x.atSec === 70).length, 0);
    expect(atSting.length).toBe(Math.min(6, stingNotes));
    expect(stats.notes).toBeGreaterThan(100);
    // A reduction, not a mute: most notes still play.
    expect(stats.dropped).toBeLessThan(stats.notes * 0.25);
  });

  it('writes loop points for a seamless loop', () => {
    const loopPlan = composePlan({ seed: 3, mood: 'chase', durationSec: 16, loop: true });
    const loopScore = arrange(loopPlan, 3);
    const loop = parseVgm(scoreToVgm(loopScore).bytes);
    expect(loop.loopOffset).toBeGreaterThanOrEqual(0x40);
    expect(loop.loopSamples).toBe(loop.totalSamples);
  });
});

describe('register labels for the stitch panel', () => {
  it('names writes the way the YM2612 datasheet does', () => {
    expect(describeWrite({ port: 0, reg: 0x28, value: 0xf4 })).toEqual({ channel: 4, op: undefined, name: 'KEY ON', detail: 'ops 1234' });
    expect(describeWrite({ port: 0, reg: 0x28, value: 0x02 }).name).toBe('KEY OFF');
    // Register 0x48 is channel 1, slot offset 8, which is operator 2.
    expect(describeWrite({ port: 0, reg: 0x48, value: 8 })).toEqual({ channel: 1, op: 2, name: 'TL', detail: '8 (-6.0 dB)' });
    expect(describeWrite({ port: 1, reg: 0xb2, value: (3 << 3) | 4 })).toEqual({ channel: 6, op: undefined, name: 'FB/ALG', detail: 'alg 4 fb 3' });
    expect(describeWrite({ port: 0, reg: 0x22, value: 9 }).name).toBe('LFO');
  });
});
