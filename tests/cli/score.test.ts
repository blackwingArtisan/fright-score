import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    expect(peak).toBeLessThanOrEqual(Math.ceil(32767 * 10 ** (-3 / 20))); // -3 dBTP ceiling
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

/** Run the real `npm run score` script and keep its streams and exit code apart. */
function npmScore(args: string[]) {
  const result = spawnSync('npm', ['run', '--silent', 'score', '--', ...args], {
    encoding: 'utf8',
    env: { ...process.env, FRIGHT_DIRECTOR: 'local' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('CLI: render stats (Requirement 7.1b)', () => {
  it('prints the note count, voices, true peak and loudness after the plan', async () => {
    const out = join(dir, 'stats.wav');
    const json = join(dir, 'stats.json');
    const lines: string[] = [];
    await runCli(['--mood', 'stalker', '--seconds', '10', '--sting', '8', '--seed', '5', '--out', out, '--json', json], {}, (l) => lines.push(l));
    const text = lines.join('\n');
    const stats = text.match(/(\d+) notes, up to (\d+) voices, true peak (-?\d+\.\d) dBTP, (-?\d+\.\d) LUFS, rendered in \d+ ms/);
    expect(stats, text).not.toBeNull();
    const [, notes, voices, truePeakDb, lufs] = stats!;
    const score = ScoreSchema.parse(JSON.parse(readFileSync(json, 'utf8')));
    expect(Number(notes)).toBe(score.tracks.reduce((n, t) => n + t.notes.length, 0));
    expect(Number(voices)).toBeGreaterThan(1);
    expect(Number(truePeakDb)).toBeLessThanOrEqual(-3);
    expect(Number(lufs)).toBeLessThan(-10);
    expect(Number(lufs)).toBeGreaterThan(-30);
    // The plan comes first: the title line, the sections, the sting cue, then the stats, then the file.
    const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
    expect(at(/^\s+0:00(\.\d)?\s+\S.*intensity \d\.\d\d/)).toBe(2); // after the title and the mood line
    expect(at(/cue: sting/)).toBeGreaterThan(at(/intensity/));
    expect(at(/ notes, up to /)).toBeGreaterThan(at(/cue: sting/));
    expect(at(/^Wrote /)).toBeGreaterThan(at(/ notes, up to /));
  });

  it('prints the same stats through the npm script', () => {
    const run = npmScore(['--mood', 'dread', '--seconds', '6', '--out', join(dir, 'npm-stats.wav')]);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/\d+ notes, up to \d+ voices, true peak -?\d+\.\d dBTP, -?\d+\.\d LUFS/);
  });
});

describe('CLI: invalid arguments exit non-zero (Requirement 7.3)', () => {
  it.each([
    ['an unknown mood', ['--mood', 'cheerful'], /Unknown mood "cheerful"/],
    ['a length below 5 s', ['--seconds', '2'], /between 5 and 300/],
    ['a length above 300 s', ['--seconds', '301'], /between 5 and 300/],
    ['an unknown director', ['--director', 'oracle'], /Unknown director/],
    ['an unknown option', ['--volume', '11'], /volume/],
    ['a negative seed', ['--seed=-4'], /--seed must be a non-negative integer/],
  ])('%s', (_label, args, message) => {
    const out = join(dir, 'never-written.wav');
    const run = npmScore([...args, '--out', out]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/^fright-score: /);
    expect(run.stderr).toMatch(message);
    expect(run.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
  });

  it('exits zero for valid arguments', () => {
    expect(npmScore(['--help']).status).toBe(0);
  });
});

describe('CLI: --quiet and --help (Requirement 7.4)', () => {
  it('--quiet prints only the output path', () => {
    const out = join(dir, 'quiet.wav');
    const run = npmScore(['--mood', 'lullaby', '--seconds', '5', '--seed', '2', '--out', out, '--quiet']);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${out}\n`);
    expect(run.stderr).toBe('');
    expect(existsSync(out)).toBe(true);
  });

  it('--quiet also keeps the extra files quiet', async () => {
    const lines: string[] = [];
    const out = join(dir, 'quiet-extra.wav');
    await runCli(['--mood', 'dread', '--seconds', '5', '--out', out, '--json', join(dir, 'q.json'), '--vgm', join(dir, 'q.vgm'), '--quiet'], {}, (l) => lines.push(l));
    expect(lines).toEqual([out]);
  });

  it('--help prints the usage text and renders nothing', () => {
    const out = join(dir, 'help.wav');
    const run = npmScore(['--help', '--out', out]);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^Fright Score: render an original, royalty-free horror cue/);
    expect(run.stdout).toMatch(/Usage:\n\s+npm run score -- \[options\]/);
    for (const flag of ['--mood', '--scene', '--seconds', '--sting', '--seed', '--out', '--loop', '--json', '--vgm', '--director', '--quiet', '--help']) {
      expect(run.stdout, flag).toContain(flag);
    }
    expect(existsSync(out)).toBe(false);
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

describe('CLI: Sega Genesis export', () => {
  it('writes a VGM beside the WAV with --vgm', async () => {
    const { parseVgm } = await import('../../src/export/vgm');
    const out = join(dir, 'genesis.wav');
    const vgmPath = join(dir, 'genesis.vgm');
    const lines: string[] = [];
    await runCli(['--mood', 'chase', '--seconds', '8', '--sting', '6', '--seed', '4', '--out', out, '--vgm', vgmPath], {}, (l) => lines.push(l));
    expect(lines.join('\n')).toMatch(/for the Sega Genesis: \d+ YM2612 register writes/);
    const vgm = parseVgm(readFileSync(vgmPath));
    expect(vgm.totalSamples).toBe(8 * 44_100);
    expect(vgm.waitedSamples).toBe(vgm.totalSamples);
  });
});
