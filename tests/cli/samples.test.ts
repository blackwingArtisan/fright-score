import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/score';
import { parseWav } from '../../src/wav/wav';

const dir = mkdtempSync(join(tmpdir(), 'fright-score-samples-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('committed samples', () => {
  it('the Genesis sample is exactly what the CLI exports today (scripts/make-samples.sh)', async () => {
    const vgm = join(dir, 'cellar.vgm');
    await runCli(
      ['--scene', 'Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10', '--seed', '13', '--out', join(dir, 'cellar.wav'), '--vgm', vgm, '--quiet'],
      {},
      () => {},
    );
    expect(readFileSync(vgm).equals(readFileSync(join(__dirname, '../../samples/cellar-dread-genesis.vgm')))).toBe(true);
  });

  it('the Godot example ships the exact loop and sting the CLI exports, with loop points in the loop', async () => {
    const loop = join(dir, 'loop.wav');
    const sting = join(dir, 'sting.wav');
    await runCli(['--mood', 'stalker', '--seconds', '8', '--loop', '--seed', '7', '--out', loop, '--quiet'], {}, () => {});
    await runCli(['--mood', 'chase', '--seconds', '5', '--sting', '0:01', '--seed', '3', '--out', sting, '--quiet'], {}, () => {});
    const shippedLoop = readFileSync(join(__dirname, '../../examples/godot/audio/stalker-loop.wav'));
    expect(readFileSync(loop).equals(shippedLoop)).toBe(true);
    expect(readFileSync(sting).equals(readFileSync(join(__dirname, '../../examples/godot/audio/door-slam-sting.wav')))).toBe(true);
    const info = parseWav(shippedLoop);
    expect(info.loop).toEqual({ startFrame: 0, endFrame: info.frameCount - 1 });
  });
});
