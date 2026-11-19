import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/score';

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
});
