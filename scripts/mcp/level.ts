import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { LocalDirector } from '../../src/director/local';
import { renderScore } from '../../src/engine/render';
import { arrange } from '../../src/score/arranger';
import { reconcilePlan } from '../../src/score/composer';
import { scoreFromRequest } from '../../src/score/pipeline';
import { formatZodError, MOODS, parseScorePlan, type Mood, type Score } from '../../src/score/schema';
import { encodeWav, parseWav } from '../../src/wav/wav';
import { checkNewDir } from './paths';
import { stingLandingSec } from './sting';

const Id = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const EventSchema = z.strictObject({ id: Id, scene: z.string().max(500).optional() });
const RoomSchema = z.strictObject({
  id: Id,
  mood: z.enum(MOODS),
  loopSec: z.number().min(4).max(60),
  events: z.array(EventSchema).max(8),
});

/** The arguments of `score_level`. `examples/godot/level.json` is exactly this object. */
export const ScoreLevelArgs = z.strictObject({
  rooms: z.array(RoomSchema).min(1).max(8),
  seed: z.number().int().min(0).max(0xffffffff).default(13),
  writeDir: z.string().min(1).optional(),
});

export interface LevelToolResult {
  structured: Record<string, unknown>;
  isError?: boolean;
}

const errorResult = (message: string): LevelToolResult => ({ structured: { error: message }, isError: true });

/** Length of a sting file and the second its hit sits at inside it. */
const STING_FILE_SEC = 5;
const STING_AT_SEC = 1;
/** The hit sounds this long after playback starts when the file is played from `hitSec - 0.6`. */
const HIT_AFTER_START_SEC = 0.6;

/**
 * One independent 32-bit seed per file, from the request seed, the room id and the part (`loop` or `sting:<event>`),
 * so a file does not change when other rooms or events are added, removed or reordered.
 */
export function fileSeed(seed: number, roomId: string, part: string): number {
  return createHash('sha256').update(`${seed}|${roomId}|${part}`).digest().readUInt32BE(0);
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

interface Rendered {
  file: string;
  bytes: Uint8Array;
}

interface LoopFacts {
  sha256: string;
  wavBytes: number;
  durationSec: number;
  loopStartSample: number;
  loopEndSample: number;
}

interface EventFacts {
  id: string;
  sha256: string;
  wavBytes: number;
  durationSec: number;
  hitSec: number;
  startFromSec: number;
  hitAfterStartSec: number;
}

interface RoomFacts {
  id: string;
  mood: Mood;
  loop: LoopFacts & Rendered;
  events: (EventFacts & Rendered)[];
}

/** Finds the first duplicate room id, or the first duplicate event id inside one room. */
function findDuplicate(rooms: z.infer<typeof ScoreLevelArgs>['rooms']): string | undefined {
  const roomIds = new Set<string>();
  for (const room of rooms) {
    if (roomIds.has(room.id)) return `Duplicate room id: ${room.id}`;
    roomIds.add(room.id);
    const eventIds = new Set<string>();
    for (const event of room.events) {
      if (eventIds.has(event.id)) return `Duplicate event id "${event.id}" in room "${room.id}"`;
      eventIds.add(event.id);
    }
  }
  return undefined;
}

async function renderLoop(seed: number, roomId: string, mood: Mood, loopSec: number): Promise<LoopFacts & Rendered> {
  const fileSeedValue = fileSeed(seed, roomId, 'loop');
  const score = await scoreFromRequest(new LocalDirector(), { seed: fileSeedValue, mood, durationSec: loopSec, loop: true });
  const bytes = encodeWav(renderScore(score), { ditherSeed: fileSeedValue ^ 0x5eed, loop: true });
  const info = parseWav(bytes);
  if (!info.loop) throw new Error(`The loop of room "${roomId}" has no loop points`);
  return {
    file: `${roomId}.loop.wav`,
    bytes,
    sha256: sha256(bytes),
    wavBytes: bytes.byteLength,
    durationSec: info.durationSec,
    loopStartSample: info.loop.startFrame,
    loopEndSample: info.loop.endFrame,
  };
}

/**
 * The score of a sting file: the local director's plan, reconciled with the request as `scoreFromRequest` does, with
 * everything before the hit cleared. `stingCues` adds its 0.6 s silence only to stings at 3 s or later, so for a hit
 * at 1.0 s this step adds a silence cue over the first second (and drops any hit cue in it). Played from
 * `startFromSec` (0.4 s), the file then gives 0.6 s of silence and the hit, as the Godot door scene expects.
 */
async function renderStingScore(request: { seed: number; mood: Mood; durationSec: number; stingAtSec: number[]; scene?: string }): Promise<Score> {
  const reconciled = reconcilePlan(await new LocalDirector().plan(request), request);
  const cues = [
    { atSec: 0, kind: 'silence' as const, lengthSec: STING_AT_SEC },
    ...reconciled.cues.filter((c) => !(c.kind === 'silence' && c.atSec < STING_AT_SEC) && !(c.kind === 'hit' && c.atSec < STING_AT_SEC)),
  ];
  return arrange(parseScorePlan({ ...reconciled, cues }), request.seed);
}

async function renderSting(seed: number, roomId: string, mood: Mood, event: { id: string; scene?: string }): Promise<EventFacts & Rendered> {
  const fileSeedValue = fileSeed(seed, roomId, `sting:${event.id}`);
  // stingAtSec is always set, so a sting time written inside the scene text cannot move the hit.
  const request = {
    seed: fileSeedValue,
    mood,
    durationSec: STING_FILE_SEC,
    stingAtSec: [STING_AT_SEC],
    ...(event.scene ? { scene: event.scene } : {}),
  };
  const score = await renderStingScore(request);
  const hitSec = stingLandingSec(score)[0];
  if (hitSec === undefined) throw new Error(`The sting "${event.id}" of room "${roomId}" has no landing time`);
  const bytes = encodeWav(renderScore(score), { ditherSeed: fileSeedValue ^ 0x5eed });
  return {
    file: `${roomId}.${event.id}.sting.wav`,
    bytes,
    id: event.id,
    sha256: sha256(bytes),
    wavBytes: bytes.byteLength,
    durationSec: parseWav(bytes).durationSec,
    hitSec,
    startFromSec: round3(hitSec - HIT_AFTER_START_SEC),
    hitAfterStartSec: HIT_AFTER_START_SEC,
  };
}

/** The rooms array of the result (`withFile` false) or of the manifest (`withFile` true), built from the same facts. */
function describeRooms(rooms: RoomFacts[], withFile: boolean): Record<string, unknown>[] {
  return rooms.map((room) => ({
    id: room.id,
    mood: room.mood,
    loop: {
      ...(withFile ? { file: room.loop.file } : {}),
      sha256: room.loop.sha256,
      wavBytes: room.loop.wavBytes,
      durationSec: room.loop.durationSec,
      loopStartSample: room.loop.loopStartSample,
      loopEndSample: room.loop.loopEndSample,
    },
    events: room.events.map((event) => ({
      id: event.id,
      ...(withFile ? { file: event.file } : {}),
      sha256: event.sha256,
      wavBytes: event.wavBytes,
      durationSec: event.durationSec,
      hitSec: event.hitSec,
      startFromSec: event.startFromSec,
      hitAfterStartSec: event.hitAfterStartSec,
    })),
  }));
}

/** Runs `score_level`. Never reads FRIGHT_DIRECTOR, AWS settings or the network. */
export async function scoreLevel(args: unknown): Promise<LevelToolResult> {
  const parsed = ScoreLevelArgs.safeParse(args ?? {});
  if (!parsed.success) return errorResult(formatZodError(parsed.error));
  const { rooms, seed, writeDir } = parsed.data;
  const duplicate = findDuplicate(rooms);
  if (duplicate) return errorResult(duplicate);
  let dir: string | undefined;
  if (writeDir !== undefined) {
    const checked = checkNewDir(writeDir);
    if ('error' in checked) return errorResult(checked.error);
    dir = checked.path;
  }
  let rendered: RoomFacts[];
  try {
    rendered = [];
    for (const room of rooms) {
      const loop = await renderLoop(seed, room.id, room.mood, room.loopSec);
      const events: RoomFacts['events'] = [];
      for (const event of room.events) events.push(await renderSting(seed, room.id, room.mood, event));
      rendered.push({ id: room.id, mood: room.mood, loop, events });
    }
  } catch (error) {
    return errorResult((error as Error).message);
  }
  const structured: Record<string, unknown> = { director: 'local', seed, rooms: describeRooms(rendered, false) };
  if (dir !== undefined) {
    const manifest = { schema: 1, director: 'local', seed, rooms: describeRooms(rendered, true) };
    const files: Rendered[] = [
      ...rendered.flatMap((room) => [room.loop, ...room.events]),
      { file: 'manifest.json', bytes: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    ];
    let current = dir;
    try {
      mkdirSync(dir, { recursive: true });
      for (const { file, bytes } of files) {
        current = join(dir, file);
        writeFileSync(current, bytes, { flag: 'wx' });
      }
    } catch (error) {
      return errorResult(`Could not write ${current}: ${(error as Error).message}`);
    }
    structured.writeDir = dir;
  }
  return { structured };
}
