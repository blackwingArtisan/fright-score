import { readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { encodeWav } from '../../src/wav/wav';
import { Client, makeTempDir, type Reply } from './mcp-client';

const work = makeTempDir('fright-score-verify-');
const outside = makeTempDir('fright-score-verify-out-');
let client: Client;

beforeAll(async () => {
  client = new Client(work);
  await client.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  client.notify('notifications/initialized');
});
afterAll(async () => {
  await client.close();
  rmSync(work, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const structured = (reply: Reply) => reply.result!.structuredContent as Record<string, any>;
const verify = (args: unknown) => client.call('verify_cue', args);

/** The golden cue of the README. */
const GOLDEN_SHA256 = '3e289fecc70aa4e968ef6ebf59ed8683fe41d2c40749af73aa63e98900d6908d';
const golden = { mood: 'chase', durationSec: 30, stingAtSec: [24], seed: 3 };

/** A 5 s sting file written by score_level, shared by the tests below. */
let stingPath: string;
let stingHitSec: number;
beforeAll(async () => {
  const reply = await client.call('score_level', {
    rooms: [{ id: 'hallway', mood: 'stalker', loopSec: 4, events: [{ id: 'door_opened' }] }],
    seed: 5,
    writeDir: 'level',
  });
  const result = structured(reply);
  stingPath = join(result.writeDir, 'hallway.door_opened.sting.wav');
  stingHitSec = result.rooms[0].events[0].hitSec;
});

afterEach(() => {
  for (const name of readdirSync(work)) {
    if (name !== 'level') rmSync(join(work, name), { recursive: true, force: true });
  }
});

describe('verify_cue on rendered cues', () => {
  it('measures the sting of a score_level file at 1.0 s within 10 ms', async () => {
    const reply = await verify({ wavPath: stingPath, expectedHitSec: [stingHitSec] });
    expect(reply.result!.isError).toBeUndefined();
    const result = structured(reply);
    expect(result).toMatchObject({ wavPath: stingPath, durationSec: 5, toleranceMs: 50, pass: true });
    expect(Object.keys(result.results[0])).toEqual(['expectedHitSec', 'measuredSec', 'errorMs', 'pass']);
    expect(Math.abs(result.results[0].errorMs)).toBeLessThanOrEqual(10);
    expect(result.results[0].measuredSec).toBe(Math.round(result.results[0].measuredSec * 1000) / 1000);
  });

  it('renders the golden cue with the README hash, then measures its sting at 24 s', async () => {
    const written = await client.call('score_cue', { ...golden, writeWavTo: 'golden.wav' });
    expect(structured(written).sha256).toBe(GOLDEN_SHA256);
    const reply = await verify({ wavPath: 'golden.wav', expectedHitSec: [24] });
    const result = structured(reply);
    expect(result.pass).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(Math.abs(result.results[0].errorMs)).toBeLessThan(50);
    expect(Math.abs(result.results[0].measuredSec - 24)).toBeLessThan(0.05);
  });

  it('fails a wrong expected time and reports the error in milliseconds', async () => {
    const reply = await verify({ wavPath: stingPath, expectedHitSec: [stingHitSec - 0.1] });
    const result = structured(reply);
    expect(result.pass).toBe(false);
    expect(result.results[0].pass).toBe(false);
    expect(result.results[0].errorMs).toBeGreaterThan(90);
    expect(result.results[0].errorMs).toBeLessThan(110);
  });

  it('still reports the real error with a 1 ms tolerance', async () => {
    const result = structured(await verify({ wavPath: stingPath, expectedHitSec: [stingHitSec + 0.02], toleranceMs: 1 }));
    expect(result.toleranceMs).toBe(1);
    expect(result.results[0].errorMs).toBeLessThan(-15);
    expect(result.results[0].errorMs).toBeGreaterThan(-25);
    expect(result.pass).toBe(false);
  });

  it('gives null for an expected time with no onset, and a failing top-level pass', async () => {
    const result = structured(await verify({ wavPath: stingPath, expectedHitSec: [stingHitSec, 4] }));
    expect(result.results).toEqual([
      expect.objectContaining({ expectedHitSec: stingHitSec, pass: true }),
      { expectedHitSec: 4, measuredSec: null, errorMs: null, pass: false },
    ]);
    expect(result.pass).toBe(false);
  });

  it('writes no file', async () => {
    const before = readdirSync(join(work, 'level')).length;
    await verify({ wavPath: stingPath, expectedHitSec: [1] });
    expect(readdirSync(join(work, 'level'))).toHaveLength(before);
  });
});

describe('verify_cue refusals', () => {
  const silent = () => {
    const frames = 44_100 * 2;
    return encodeWav({ sampleRate: 44_100, left: new Float32Array(frames), right: new Float32Array(frames) });
  };

  /** A 24-bit PCM WAV header with a few samples. */
  const wav24 = () => {
    const data = new Uint8Array(12);
    const out = new DataView(new ArrayBuffer(44 + data.length));
    const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF');
    out.setUint32(4, 36 + data.length, true);
    text(8, 'WAVEfmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, 44_100, true);
    out.setUint32(28, 44_100 * 6, true);
    out.setUint16(32, 6, true);
    out.setUint16(34, 24, true);
    text(36, 'data');
    out.setUint32(40, data.length, true);
    return new Uint8Array(out.buffer);
  };

  const refused: [string, () => unknown, RegExp][] = [
    ['a path outside the working folder', () => ({ wavPath: join(outside, 'x.wav') }), /inside the server working directory|does not exist/],
    ['a name without .wav', () => ({ wavPath: 'level/hallway.loop.mp3' }), /\.wav/],
    ['a missing file', () => ({ wavPath: 'missing.wav' }), /does not exist/],
    [
      'a text file named .wav',
      () => {
        writeFileSync(join(work, 'text.wav'), 'this is not audio at all');
        return { wavPath: 'text.wav' };
      },
      /not a 16-bit PCM WAV.*RIFF/,
    ],
    [
      'a 24-bit WAV',
      () => {
        writeFileSync(join(work, 'deep.wav'), wav24());
        return { wavPath: 'deep.wav' };
      },
      /24/,
    ],
    [
      'a file over 64 MB',
      () => {
        writeFileSync(join(work, 'huge.wav'), '');
        truncateSync(join(work, 'huge.wav'), 64 * 1024 * 1024 + 1);
        return { wavPath: 'huge.wav' };
      },
      /64 MB/,
    ],
    [
      'a symbolic link that leads out of the folder',
      () => {
        writeFileSync(join(outside, 'secret.wav'), silent());
        symlinkSync(join(outside, 'secret.wav'), join(work, 'link.wav'));
        return { wavPath: 'link.wav' };
      },
      /inside the server working directory/,
    ],
    ['a directory named .wav', () => ({ wavPath: '.' }), /\.wav/],
  ];

  it.each(refused)('returns isError for %s and keeps answering', async (_name, make, message) => {
    const args = { ...(make() as object), expectedHitSec: [1] };
    const reply = await verify(args);
    expect(reply.error).toBeUndefined();
    expect(reply.result!.isError).toBe(true);
    expect(structured(reply).error).toMatch(message);
    expect((await client.request('ping')).result).toEqual({});
  });

  it('returns isError for bad arguments', async () => {
    for (const args of [{}, { wavPath: stingPath }, { wavPath: stingPath, expectedHitSec: [] }, { wavPath: stingPath, expectedHitSec: [301] }, { wavPath: stingPath, expectedHitSec: [1], toleranceMs: 0 }]) {
      const reply = await verify(args);
      expect(reply.result!.isError).toBe(true);
    }
  });

  it('gives an empty onset list and failing entries for a silent file', async () => {
    writeFileSync(join(work, 'quiet.wav'), silent());
    const result = structured(await verify({ wavPath: 'quiet.wav', expectedHitSec: [1, 1.5] }));
    expect(result.pass).toBe(false);
    expect(result.results).toEqual([
      { expectedHitSec: 1, measuredSec: null, errorMs: null, pass: false },
      { expectedHitSec: 1.5, measuredSec: null, errorMs: null, pass: false },
    ]);
  });
});
