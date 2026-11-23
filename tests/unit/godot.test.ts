import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalDirector } from '../../src/director/local';
import { renderScore } from '../../src/engine/render';
import {
  GODOT_ADDON_FILES,
  GODOT_STING_FILE_SEC,
  GODOT_STING_HIT_SEC,
  buildGodotZip,
  godotHitSec,
  godotLoopRequest,
  godotReadme,
  godotStingScore,
  godotZipName,
} from '../../src/export/godot';
import { readZip } from '../../src/export/zip';
import { scoreFromRequest } from '../../src/score/pipeline';
import { encodeWav, parseWav } from '../../src/wav/wav';

const director = new LocalDirector();
const cue = () => scoreFromRequest(director, { seed: 21, mood: 'stalker', durationSec: 12, stingAtSec: [9] });

async function pack() {
  const score = await cue();
  const loopRequest = godotLoopRequest(score);
  const loopScore = await scoreFromRequest(director, loopRequest);
  const loopWav = encodeWav(renderScore(loopScore), { ditherSeed: loopScore.seed ^ 0x5eed, loop: true });
  const stingScore = await godotStingScore(director, score);
  const stingWav = encodeWav(renderScore(stingScore), { ditherSeed: stingScore.seed ^ 0x5eed });
  return { score, loopScore, stingScore, loopWav, stingWav, zip: buildGodotZip({ score, loopWav, stingWav, loopSec: loopScore.durationSec }) };
}

describe('the Godot pack', () => {
  it('seeds the loop and the sting from the cue, and keeps them apart', async () => {
    const score = await cue();
    const loop = godotLoopRequest(score);
    expect(loop.loop).toBe(true);
    expect(loop.mood).toBe('stalker');
    expect(loop.durationSec).toBeGreaterThanOrEqual(8);
    expect(loop.durationSec).toBeLessThanOrEqual(16);
    expect(godotLoopRequest(score)).toEqual(loop);
    expect(loop.seed).not.toBe(score.seed);
    const sting = await godotStingScore(director, score);
    expect(sting.seed).not.toBe(loop.seed);
    expect(sting.durationSec).toBe(GODOT_STING_FILE_SEC);
  });

  it('lands the sting at 1.0 s with silence before it', async () => {
    const score = await cue();
    const sting = await godotStingScore(director, score);
    expect(godotHitSec(sting)).toBeCloseTo(GODOT_STING_HIT_SEC, 2);
    const result = renderScore(sting);
    const quiet = Math.floor(0.9 * 44_100);
    let peak = 0;
    for (let i = Math.floor(0.4 * 44_100); i < quiet; i++) peak = Math.max(peak, Math.abs(result.left[i]), Math.abs(result.right[i]));
    expect(peak).toBeLessThan(0.01);
  });

  it('zips the add-on, both WAVs and README.txt, with valid CRC-32s', async () => {
    const { score, zip, loopWav, stingWav } = await pack();
    const files = readZip(zip);
    const names = files.map((f) => f.name);
    for (const name of ['fright_score_cue.gd', 'plugin.cfg', 'plugin.gd']) expect(names).toContain(`addons/fright_score/${name}`);
    expect(names).toContain('README.txt');
    const wavs = names.filter((n) => n.endsWith('.wav'));
    expect(wavs).toHaveLength(2);
    expect(wavs.some((n) => n.endsWith('-loop.wav'))).toBe(true);
    expect(wavs.some((n) => n.endsWith('-sting.wav'))).toBe(true);
    const byName = new Map(files.map((f) => [f.name, f.data]));
    expect(byName.get(wavs.find((n) => n.endsWith('-loop.wav'))!)).toEqual(loopWav);
    expect(byName.get(wavs.find((n) => n.endsWith('-sting.wav'))!)).toEqual(stingWav);
    expect(godotZipName(score)).toMatch(/^fright-score-godot-.*-seed21\.zip$/);
  });

  it('ships the add-on exactly as the repository has it', () => {
    expect(GODOT_ADDON_FILES.length).toBe(5);
    for (const file of GODOT_ADDON_FILES) {
      const onDisk = readFileSync(new URL(`../../examples/godot/${file.name}`, import.meta.url), 'utf8');
      expect(file.data).toBe(onDisk);
    }
  });

  it('writes a loop with loop points and a sting without, as 44.1 kHz 16-bit stereo', async () => {
    const { loopWav, stingWav } = await pack();
    const loop = parseWav(loopWav);
    const sting = parseWav(stingWav);
    expect(loop.loop).toBeDefined();
    expect(sting.loop).toBeUndefined();
    for (const info of [loop, sting]) {
      expect(info.sampleRate).toBe(44_100);
      expect(info.channels).toBe(2);
      expect(info.bitsPerSample).toBe(16);
    }
  });

  it('gives the same zip for the same cue, byte for byte', async () => {
    const a = await pack();
    const b = await pack();
    expect(Array.from(a.zip)).toEqual(Array.from(b.zip));
  });

  it('puts the two-line setup and the price line in README.txt', async () => {
    const score = await cue();
    const readme = godotReadme(score, { loop: 'fright_score/x-loop.wav', sting: 'fright_score/x-sting.wav', loopSec: 12 });
    expect(readme).toContain('A stock site charges about $18-48 for this. Yours, royalty-free.');
    expect(readme).toMatch(/^1\. Unzip/m);
    expect(readme).toMatch(/^2\. Add a FrightScoreCue node/m);
  });
});
