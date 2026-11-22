import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ScoreLevelArgs } from '../../scripts/mcp/level';
import { parseWav } from '../../src/wav/wav';
import { Client, makeTempDir, root, type Reply } from './mcp-client';

const work = makeTempDir('fright-score-level-');
const outside = makeTempDir('fright-score-level-out-');
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
afterEach(() => {
  for (const name of readdirSync(work)) rmSync(join(work, name), { recursive: true, force: true });
});

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const structured = (reply: Reply) => reply.result!.structuredContent as Record<string, any>;
const level = (args: unknown) => client.call('score_level', args);

const hallway = { id: 'hallway', mood: 'stalker', loopSec: 4, events: [{ id: 'door_opened', scene: 'A door opens behind you' }] };
const cellar = { id: 'cellar', mood: 'dread', loopSec: 4, events: [{ id: 'lights_out' }] };
const small = { rooms: [hallway, cellar], seed: 5 };

describe('score_level validation', () => {
  const bad: [string, unknown, RegExp][] = [
    ['zero rooms', { rooms: [] }, /rooms/],
    ['nine rooms', { rooms: Array.from({ length: 9 }, (_, i) => ({ ...cellar, id: `room${i}` })) }, /rooms/],
    ['loopSec 3', { rooms: [{ ...cellar, loopSec: 3 }] }, /loopSec/],
    ['loopSec 61', { rooms: [{ ...cellar, loopSec: 61 }] }, /loopSec/],
    ['an unknown mood', { rooms: [{ ...cellar, mood: 'cheerful' }] }, /mood/],
    ['a bad room id', { rooms: [{ ...cellar, id: 'Cellar 1' }] }, /id/],
    ['a bad event id', { rooms: [{ ...cellar, events: [{ id: '../x' }] }] }, /id/],
    ['nine events', { rooms: [{ ...cellar, events: Array.from({ length: 9 }, (_, i) => ({ id: `e${i}` })) }] }, /events/],
    ['a duplicate room id', { rooms: [cellar, { ...hallway, id: 'cellar' }] }, /Duplicate room id: cellar/],
    ['a duplicate event id', { rooms: [{ ...cellar, events: [{ id: 'boo' }, { id: 'boo' }] }] }, /Duplicate event id "boo" in room "cellar"/],
    ['an unknown key', { rooms: [{ ...cellar, loopsec: 8 }] }, /loopsec/],
    ['a fractional seed', { rooms: [cellar], seed: 1.5 }, /seed/],
    ['a negative seed', { rooms: [cellar], seed: -1 }, /seed/],
    ['a seed above 32 bits', { rooms: [cellar], seed: 4_294_967_296 }, /seed/],
    ['arguments that are not an object', 'dread', /./],
  ];

  it.each(bad)('returns isError for %s, renders nothing and keeps answering', async (_name, args, message) => {
    const direct = await level(typeof args === 'object' ? { ...(args as object), writeDir: 'never' } : args);
    expect(direct.error).toBeUndefined();
    expect(direct.result!.isError).toBe(true);
    expect(structured(direct).error).toMatch(message);
    expect(readdirSync(work)).toEqual([]);
    expect((await client.request('ping')).result).toEqual({});
  });
});

describe('score_level result', () => {
  it('returns the documented fields, with the loop points spanning the whole file and the stings landing at 1 s', async () => {
    const reply = await level(small);
    expect(reply.result!.isError).toBeUndefined();
    const result = structured(reply);
    expect(result).toMatchObject({ director: 'local', seed: 5 });
    expect(Object.keys(result).sort()).toEqual(['director', 'rooms', 'seed']);
    expect(result.rooms.map((r: any) => [r.id, r.mood])).toEqual([['hallway', 'stalker'], ['cellar', 'dread']]);
    for (const room of result.rooms) {
      expect(Object.keys(room.loop)).toEqual(['sha256', 'wavBytes', 'durationSec', 'loopStartSample', 'loopEndSample']);
      expect(room.loop.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(room.loop.loopStartSample).toBe(0);
      // The smpl end point is the last frame (inclusive), as the Godot example's verify.gd shows: loop_end=396899, frames=396900.
      expect(room.loop.loopEndSample + 1).toBe(Math.round(room.loop.durationSec * 44_100));
      expect(room.loop.durationSec).toBeGreaterThan(2);
      expect(room.loop.durationSec).toBeLessThan(12);
      expect(room.events).toHaveLength(1);
      const [event] = room.events;
      expect(Object.keys(event)).toEqual(['id', 'sha256', 'wavBytes', 'durationSec', 'hitSec', 'startFromSec', 'hitAfterStartSec']);
      expect(event).toMatchObject({ durationSec: 5, hitSec: 1, startFromSec: 0.4, hitAfterStartSec: 0.6 });
    }
    expect(result.rooms[0].events[0].id).toBe('door_opened');
    expect(JSON.parse((reply.result!.content as { text: string }[])[0].text)).toEqual(result);
  });

  it('gives the same hashes for the same arguments and other hashes for another seed', async () => {
    const a = structured(await level(small));
    const b = structured(await level(small));
    const c = structured(await level({ ...small, seed: 6 }));
    expect(b).toEqual(a);
    expect(c.rooms[0].loop.sha256).not.toBe(a.rooms[0].loop.sha256);
    expect(c.rooms[0].events[0].sha256).not.toBe(a.rooms[0].events[0].sha256);
  });

  it('defaults the seed to 13', async () => {
    const one = { rooms: [{ ...cellar, events: [] }] };
    expect(structured(await level(one)).seed).toBe(13);
  });

  it('ignores a sting time written in the scene text', async () => {
    const withTime = { rooms: [{ ...cellar, events: [{ id: 'boo', scene: 'creeping dread, a sting at 0:03' }] }] };
    const result = structured(await level(withTime));
    expect(result.rooms[0].events[0]).toMatchObject({ hitSec: 1, startFromSec: 0.4, durationSec: 5 });
  });

  it('gives each room the same hashes alone as beside other rooms, and ignores other rooms events', async () => {
    const alone = structured(await level({ rooms: [hallway], seed: 5 })).rooms[0];
    const beside = structured(await level({ rooms: [cellar, hallway], seed: 5 })).rooms[1];
    expect(beside).toEqual(alone);
    const renamed = structured(await level({ rooms: [{ ...cellar, events: [{ id: 'other_event' }] }, hallway], seed: 5 })).rooms[1];
    expect(renamed).toEqual(alone);
  });

  it('uses the local director whatever FRIGHT_DIRECTOR and AWS settings say', async () => {
    // The spawned server runs with FRIGHT_DIRECTOR=bedrock and no AWS_* variable; compare with a plain environment.
    const { spawnSync } = await import('node:child_process');
    const { pathToFileURL } = await import('node:url');
    const loader = pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href;
    const probe = `import { scoreLevel } from ${JSON.stringify(pathToFileURL(join(root, 'scripts/mcp/level.ts')).href)};
      const r = await scoreLevel(${JSON.stringify({ rooms: [{ ...cellar, events: [] }], seed: 5 })});
      process.stdout.write(JSON.stringify(r.structured));`;
    const plain = spawnSync(process.execPath, ['--import', loader, '--input-type=module', '-e', probe], {
      cwd: work,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      encoding: 'utf8',
    });
    expect(plain.status, plain.stderr).toBe(0);
    const viaServer = structured(await level({ rooms: [{ ...cellar, events: [] }], seed: 5 }));
    expect(JSON.parse(plain.stdout)).toEqual(viaServer);
    expect(viaServer.director).toBe('local');
  });
});

describe('score_level writeDir', () => {
  it('writes no file without writeDir', async () => {
    await level(small);
    expect(readdirSync(work)).toEqual([]);
  });

  it('writes the named files, the hashes match, the loop points match and the manifest equals the result', async () => {
    const withoutDir = structured(await level(small));
    const result = structured(await level({ ...small, writeDir: 'out/level' }));
    expect(result.writeDir).toBe(join(work, 'out', 'level'));
    const { writeDir, ...rest } = result;
    expect(rest).toEqual(withoutDir);
    expect(readdirSync(writeDir).sort()).toEqual(
      ['cellar.lights_out.sting.wav', 'cellar.loop.wav', 'hallway.door_opened.sting.wav', 'hallway.loop.wav', 'manifest.json'],
    );
    const text = readFileSync(join(writeDir, 'manifest.json'), 'utf8');
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    expect(text).not.toContain(work);
    const manifest = JSON.parse(text);
    expect(Object.keys(manifest)).toEqual(['schema', 'director', 'seed', 'rooms']);
    expect(manifest.schema).toBe(1);
    for (const [i, room] of manifest.rooms.entries()) {
      const loopBytes = readFileSync(join(writeDir, `${room.id}.loop.wav`));
      expect(room.loop.file).toBe(`${room.id}.loop.wav`);
      expect(sha(loopBytes)).toBe(room.loop.sha256);
      expect(loopBytes.byteLength).toBe(room.loop.wavBytes);
      const info = parseWav(new Uint8Array(loopBytes));
      expect(info.loop).toEqual({ startFrame: room.loop.loopStartSample, endFrame: room.loop.loopEndSample });
      expect(info.frameCount).toBe(room.loop.loopEndSample + 1);
      const { file: _loopFile, ...loop } = room.loop;
      expect(loop).toEqual(withoutDir.rooms[i].loop);
      for (const [j, event] of room.events.entries()) {
        const bytes = readFileSync(join(writeDir, `${room.id}.${event.id}.sting.wav`));
        expect(event.file).toBe(`${room.id}.${event.id}.sting.wav`);
        expect(sha(bytes)).toBe(event.sha256);
        const { file: _file, ...plain } = event;
        expect(plain).toEqual(withoutDir.rooms[i].events[j]);
      }
    }
  });

  it('refuses a second call with the same folder and a folder that exists, and writes nothing more', async () => {
    const first = structured(await level({ ...small, writeDir: 'again' }));
    const before = readFileSync(join(first.writeDir, 'manifest.json'), 'utf8');
    const second = await level({ ...small, seed: 6, writeDir: 'again' });
    expect(second.result!.isError).toBe(true);
    expect(structured(second).error).toMatch(/already exists/);
    expect(readFileSync(join(first.writeDir, 'manifest.json'), 'utf8')).toBe(before);
    expect(readdirSync(first.writeDir)).toHaveLength(5);
  });

  it('refuses a path outside the working folder, a link that leads out, "." and the working folder itself', async () => {
    symlinkSync(outside, join(work, 'link'));
    for (const writeDir of [outside, '../escape', 'link/inner', '.', work]) {
      const reply = await level({ ...small, writeDir });
      expect(reply.result!.isError, writeDir).toBe(true);
      expect(structured(reply).error).toMatch(/writeDir/);
    }
    expect(readdirSync(outside)).toEqual([]);
    expect(existsSync(join(work, '..', 'escape'))).toBe(false);
    expect(readdirSync(work)).toEqual(['link']);
  });
});

describe('the Godot level', () => {
  it('level.json is accepted by the score_level schema as written', () => {
    const parsed = ScoreLevelArgs.safeParse(JSON.parse(readFileSync(join(root, 'examples/godot/level.json'), 'utf8')));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.rooms.map((r) => [r.id, r.mood, r.events.map((e) => e.id)])).toEqual([
      ['hallway', 'stalker', ['door_opened']],
      ['cellar', 'dread', ['lights_out']],
    ]);
  });

  it('level-manifest.json equals the manifest the tool writes for level.json, byte for byte, and pins the written WAVs', async () => {
    const args = JSON.parse(readFileSync(join(root, 'examples/godot/level.json'), 'utf8'));
    const result = structured(await level({ ...args, writeDir: 'godot-level' }));
    expect(result.writeDir, JSON.stringify(result)).toBeTruthy();
    const written = readFileSync(join(result.writeDir, 'manifest.json'), 'utf8');
    const committed = readFileSync(join(root, 'examples/godot/level-manifest.json'), 'utf8');
    expect(
      written,
      'The sound changed. If that was intended, regenerate examples/godot/level-manifest.json with score_level (writeDir) from level.json, then review the diff.',
    ).toBe(committed);
    const manifest = JSON.parse(committed);
    for (const room of manifest.rooms) {
      expect(sha(readFileSync(join(result.writeDir, room.loop.file)))).toBe(room.loop.sha256);
      for (const event of room.events) expect(sha(readFileSync(join(result.writeDir, event.file)))).toBe(event.sha256);
    }
  });

  it('commits no WAV generated by score_level', () => {
    const found = readdirSync(join(root, 'examples/godot'), { recursive: true, encoding: 'utf8' }).filter((n) => /^(hallway|cellar)\..*\.wav$/.test(basename(n)));
    expect(found).toEqual([]);
  });
});
