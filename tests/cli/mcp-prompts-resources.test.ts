import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOOD_LOUDNESS_LUFS } from '../../src/engine/loudness';
import { MOOD_PROFILES } from '../../src/score/moods';
import { MOODS } from '../../src/score/schema';
import { Client, makeTempDir } from './mcp-client';

const work = makeTempDir('fright-score-mcp-pr-');
let client: Client;

beforeAll(async () => {
  client = new Client(work);
  await client.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  client.notify('notifications/initialized');
});
afterAll(async () => {
  await client.close();
  rmSync(work, { recursive: true, force: true });
});

const promptText = async (args?: Record<string, unknown>): Promise<string> => {
  const reply = await client.request('prompts/get', { name: 'score_scene_for_game', ...(args ? { arguments: args } : {}) });
  expect(reply.error).toBeUndefined();
  const { messages } = reply.result as { messages: { role: string; content: { type: string; text: string } }[] };
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe('user');
  expect(messages[0].content.type).toBe('text');
  return messages[0].content.text;
};

describe('the score_scene_for_game prompt', () => {
  it('is listed with the optional game and writeDir arguments', async () => {
    const reply = await client.request('prompts/list');
    const { prompts } = reply.result as { prompts: { name: string; arguments: { name: string; required?: boolean }[] }[] };
    expect(prompts.map((p) => p.name)).toEqual(['score_scene_for_game']);
    expect(prompts[0].arguments.map((a) => a.name)).toEqual(['game', 'writeDir']);
    expect(prompts[0].arguments.every((a) => !a.required)).toBe(true);
  });

  it('returns one user text message that names the resource, score_level and verify_cue in that order', async () => {
    const text = await promptText();
    const at = ['fright-score://moods', 'score_level', 'verify_cue'].map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(text).not.toMatch(/AI model/i);
    expect(text).toMatch(/local rule-based director/);
  });

  it('includes the game line and the folder name when they are given', async () => {
    const text = await promptText({ game: 'A haunted lighthouse crawler', writeDir: 'lighthouse_audio' });
    expect(text).toContain('The game: A haunted lighthouse crawler');
    expect(text).toContain('writeDir "lighthouse_audio"');
  });

  it('answers an unknown name, a number argument and a 201-character argument with -32602', async () => {
    const unknown = await client.request('prompts/get', { name: 'nope' });
    expect(unknown.error?.code).toBe(-32602);
    const number = await client.request('prompts/get', { name: 'score_scene_for_game', arguments: { game: 5 } });
    expect(number.error?.code).toBe(-32602);
    const long = await client.request('prompts/get', { name: 'score_scene_for_game', arguments: { game: 'x'.repeat(201) } });
    expect(long.error?.code).toBe(-32602);
    const edge = await client.request('prompts/get', { name: 'score_scene_for_game', arguments: { game: 'x'.repeat(200) } });
    expect(edge.error).toBeUndefined();
  });
});

describe('the fright-score://moods resource', () => {
  it('is listed as application/json', async () => {
    const reply = await client.request('resources/list');
    const { resources } = reply.result as { resources: { uri: string; mimeType: string }[] };
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ uri: 'fright-score://moods', mimeType: 'application/json' });
  });

  it('reads as one entry per mood in MOODS order, equal to the code', async () => {
    const reply = await client.request('resources/read', { uri: 'fright-score://moods' });
    const { contents } = reply.result as { contents: { uri: string; mimeType: string; text: string }[] };
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ uri: 'fright-score://moods', mimeType: 'application/json' });
    const moods = JSON.parse(contents[0].text) as { id: string; tempoBpm: { min: number; max: number }; loudnessCeilingLufs: number }[];
    expect(moods.map((m) => m.id)).toEqual([...MOODS]);
    for (const mood of moods) {
      const id = mood.id as (typeof MOODS)[number];
      expect(mood.tempoBpm).toEqual({ min: MOOD_PROFILES[id].tempoBpm[0], max: MOOD_PROFILES[id].tempoBpm[1] });
      expect(mood.loudnessCeilingLufs).toBe(MOOD_LOUDNESS_LUFS[id]);
    }
  });

  it('answers an unknown uri with -32002 and the uri in data', async () => {
    const reply = await client.request('resources/read', { uri: 'fright-score://nothing' });
    expect(reply.error?.code).toBe(-32002);
    expect((reply.error as { data?: unknown }).data).toEqual({ uri: 'fright-score://nothing' });
  });

  it('lists no resource templates', async () => {
    const reply = await client.request('resources/templates/list');
    expect(reply.result).toEqual({ resourceTemplates: [] });
  });
});
