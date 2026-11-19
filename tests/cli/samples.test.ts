import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/score';
import { parseWav } from '../../src/wav/wav';
import { DEMO_SCENE, DEMO_SEED, DEMO_WAV_SHA256, sha256Hex } from '../../src/web/demo';

const dir = mkdtempSync(join(tmpdir(), 'fright-score-samples-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('committed samples', () => {
  it('the Genesis sample and the demo hash are exactly what the CLI exports today (scripts/make-samples.sh)', async () => {
    const vgm = join(dir, 'cellar.vgm');
    await runCli(
      ['--scene', 'Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10', '--seed', '13', '--out', join(dir, 'cellar.wav'), '--vgm', vgm, '--quiet'],
      {},
      () => {},
    );
    expect(readFileSync(vgm).equals(readFileSync(join(__dirname, '../../samples/cellar-dread-genesis.vgm')))).toBe(true);
    // The page checks its live render of the demo against this published hash.
    expect(DEMO_SCENE).toBe('Creeping dread in the cellar, 90 seconds, builds to a sting at 1:10');
    expect(DEMO_SEED).toBe(13);
    expect(await sha256Hex(readFileSync(join(dir, 'cellar.wav')))).toBe(DEMO_WAV_SHA256);
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

  it('the starter-pack manifest lists 5 loops and 20 stings, and its chase sting is the Godot sting', async () => {
    const rows = readFileSync(join(__dirname, '../../samples/starter-pack-manifest.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
    expect(rows.filter((r) => r[1] === 'loop')).toHaveLength(5);
    expect(rows.filter((r) => r[1] === 'sting')).toHaveLength(20);
    expect(new Set(rows.map((r) => r[6])).size).toBe(25);
    // scripts/make-starter-pack.sh renders chase, 5 s, sting at 0:01, seed 3: the request behind the Godot sting.
    const chase = rows.find((r) => r[0] === 'stings/chase-sting-seed3.wav')!;
    const godot = readFileSync(join(__dirname, '../../examples/godot/audio/door-slam-sting.wav'));
    expect(chase[6]).toBe(await sha256Hex(new Uint8Array(godot)));
  });
});
