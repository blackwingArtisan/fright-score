import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderScore } from '../../src/engine/render';
import { GHOST_NOTE_LABEL, gd3Notes, parseVgm, scoreToVgm } from '../../src/export/vgm';
import { createDirector } from '../../src/director';
import { scoreFromRequest } from '../../src/score/pipeline';
import { encodeWav } from '../../src/wav/wav';
import { DEMO_SCENE, DEMO_SEED, DEMO_WAV_SHA256, sha256Hex } from '../../src/web/demo';
import { GHOST_MESSAGES, ghostAnnouncement, ghostHex, ghostMessage } from '../../src/web/views/ghost';
import { progressLabelBox } from '../../src/web/views/timeline';

/** sha256 of the demo cue's Genesis file now that its GD3 notes carry the scene as a ghost note. */
const DEMO_VGM_SHA256 = '0a3227ecb700af623326a5893b0d440e594fd2f0882c473e8a0f3e6f0b440740';

describe('the possessed chip: the hidden message', () => {
  it('is spelled from the seed alone: the same seed gives the same three words', () => {
    for (const seed of [0, 13, 666, 4_294_967_295]) {
      expect(ghostMessage(seed)).toEqual(ghostMessage(seed));
      expect(GHOST_MESSAGES).toContainEqual(ghostMessage(seed));
    }
  });

  it('uses more than one message across seeds, so a cue is not always haunted the same way', () => {
    const seen = new Set(Array.from({ length: 64 }, (_, seed) => ghostMessage(seed).join(' ')));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('shows each word beside its ASCII bytes and announces the message once, in lower case', () => {
    expect(ghostHex('IT')).toBe('49 54');
    const words = ghostMessage(13);
    expect(ghostAnnouncement(13)).toBe(`The chip is possessed. It writes: ${words.join(' ').toLowerCase()}.`);
  });
});

describe('the timeline render label', () => {
  it('sits in the top right corner at any width, inside the canvas', () => {
    for (const width of [320, 412, 800, 1100]) {
      const box = progressLabelBox(width, 190);
      expect(box.x + box.w).toBe(width - 8);
      expect(box.y).toBeLessThan(12);
      expect(box.x).toBeGreaterThanOrEqual(0);
    }
    // A canvas narrower than the label shrinks the label instead of pushing it out of view.
    const narrow = progressLabelBox(150, 190);
    expect(narrow.x).toBeGreaterThanOrEqual(8);
    expect(narrow.x + narrow.w).toBe(142);
  });
});

describe('the GD3 ghost note in the Genesis export', () => {
  it('carries the scene text in the notes field, after the seed', async () => {
    const score = await scoreFromRequest(createDirector('local', {}), { seed: DEMO_SEED, scene: DEMO_SCENE });
    const notes = parseVgm(scoreToVgm(score).bytes).notes;
    expect(notes).toBe(`Seed 13. Arranged for the YM2612 from a Fright Score cue. ${GHOST_NOTE_LABEL}${DEMO_SCENE}`);
    expect(notes).toBe(gd3Notes(score));
  });

  it('adds no ghost note to a cue that was asked for by mood alone', async () => {
    const score = await scoreFromRequest(createDirector('local', {}), { seed: 5, mood: 'dread', durationSec: 8 });
    expect(parseVgm(scoreToVgm(score).bytes).notes).toBe('Seed 5. Arranged for the YM2612 from a Fright Score cue.');
  });

  it('pins the committed demo Genesis file, and the demo WAV bytes do not change', async () => {
    const score = await scoreFromRequest(createDirector('local', {}), { seed: DEMO_SEED, scene: DEMO_SCENE });
    const vgm = scoreToVgm(score).bytes;
    expect(await sha256Hex(vgm)).toBe(DEMO_VGM_SHA256);
    expect(await sha256Hex(readFileSync(join(__dirname, '../../samples/cellar-dread-genesis.vgm')))).toBe(DEMO_VGM_SHA256);
    // The ghost note lives only in the Genesis file: the audio is the published demo, byte for byte.
    const wav = encodeWav(renderScore(score), { ditherSeed: DEMO_SEED ^ 0x5eed, loop: false });
    expect(await sha256Hex(wav)).toBe(DEMO_WAV_SHA256);
  });
});
