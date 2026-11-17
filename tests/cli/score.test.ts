import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/score';
import { ScoreSchema } from '../../src/score/schema';
import { parseWav } from '../../src/wav/wav';

const dir = mkdtempSync(join(tmpdir(), 'fright-score-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('CLI: npm run score', () => {
  it('renders a WAV end to end through the real npm script', () => {
    const out = join(dir, 'cue.wav');
    const stdout = execFileSync(
      'npm',
      ['run', '--silent', 'score', '--', '--mood', 'dread', '--seconds', '12', '--seed', '7', '--sting', '9', '--out', out],
      { encoding: 'utf8', env: { ...process.env, FRIGHT_DIRECTOR: 'local' } },
    );
    expect(stdout).toMatch(/Wrote .*cue\.wav/);
    expect(stdout).toMatch(/cue: sting/);
    const info = parseWav(readFileSync(out));
    expect(info.sampleRate).toBe(44_100);
    expect(info.channels).toBe(2);
    expect(info.bitsPerSample).toBe(16);
    expect(info.frameCount).toBe(12 * 44_100);
    let peak = 0;
    for (const s of info.samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeLessThan(32767 * 0.9); // -1 dBTP ceiling leaves sample peaks below -0.9 dBFS
    expect(peak).toBeGreaterThan(32767 * 0.5);
    expect(Math.abs(info.samples[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(info.samples[info.samples.length - 1])).toBeLessThanOrEqual(2);
  });

  it('writes the same bytes for the same seed and a JSON score on request', async () => {
    const a = join(dir, 'a.wav');
    const b = join(dir, 'b.wav');
    const json = join(dir, 'a.json');
    const lines: string[] = [];
    await runCli(['--scene', 'cult chanting by candlelight, 8 seconds', '--seed', '3', '--out', a, '--json', json], {}, (l) => lines.push(l));
    await runCli(['--scene', 'cult chanting by candlelight, 8 seconds', '--seed', '3', '--out', b, '--quiet'], {}, () => {});
    expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
    expect(lines.join('\n')).toMatch(/ritual/);
    const score = ScoreSchema.parse(JSON.parse(readFileSync(json, 'utf8')));
    expect(score.plan.mood).toBe('ritual');
    expect(score.durationSec).toBe(8);
  });

  it('rejects bad arguments with clear messages', async () => {
    await expect(runCli(['--mood', 'cheerful'], {}, () => {})).rejects.toThrow(/Unknown mood/);
    await expect(runCli(['--seconds', '2'], {}, () => {})).rejects.toThrow(/between 5 and 300/);
    await expect(runCli(['--director', 'oracle', '--out', join(dir, 'x.wav')], {}, () => {})).rejects.toThrow(/Unknown director/);
  });

  it('prints help', async () => {
    const lines: string[] = [];
    await runCli(['--help'], {}, (l) => lines.push(l));
    expect(lines.join('\n')).toMatch(/--mood/);
  });
});

describe('CLI: loops', () => {
  it('renders a whole-bar loop with loop points', async () => {
    const out = join(dir, 'loop.wav');
    const lines: string[] = [];
    await runCli(['--mood', 'stalker', '--seconds', '10', '--loop', '--seed', '2', '--out', out], {}, (l) => lines.push(l));
    expect(lines.join('\n')).toMatch(/Seamless loop/);
    const info = parseWav(readFileSync(out));
    expect(info.loop).toEqual({ startFrame: 0, endFrame: info.frameCount - 1 });
  });
});
