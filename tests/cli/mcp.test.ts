import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/score';
import { PATCHES, PATCH_IDS } from '../../src/engine/patches';
import { Client, makeTempDir, root, type Reply } from './mcp-client';

// The server's working folder (writeWavTo is relative to it) and a second folder for the CLI's file.
const work = makeTempDir('fright-score-mcp-');
const cliDir = makeTempDir('fright-score-mcp-cli-');
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(cliDir, { recursive: true, force: true });
});

let client: Client;
beforeAll(async () => {
  client = new Client(work);
  await client.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  client.notify('notifications/initialized');
});
afterAll(async () => {
  await client.close();
});

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const cue = { mood: 'chase', durationSec: 5, stingAtSec: [3], seed: 3 };

describe('MCP server protocol over stdio', () => {
  it('answers initialize with a supported version, the tools, prompts and resources capabilities and the server name (Req 4.2a, 7.2a)', async () => {
    const probe = new Client(work);
    try {
      const asked = await probe.request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } });
      expect(asked.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {}, prompts: {}, resources: {} }, serverInfo: { name: 'fright-score' } });
      const unknown = await probe.request('initialize', { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 't', version: '0' } });
      expect(unknown.result?.protocolVersion).toBe('2025-11-25');
    } finally {
      await probe.close();
    }
  });

  it('lists the four tools in order with object input schemas from zod (Req 4.2b, 7.2a)', async () => {
    const reply = await client.request('tools/list');
    const tools = reply.result!.tools as { name: string; description: string; inputSchema: Record<string, any> }[];
    expect(tools.map((t) => t.name)).toEqual(['score_cue', 'list_patches', 'score_level', 'verify_cue']);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe('object');
    }
    const props = tools[0].inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['seed', 'scene', 'mood', 'durationSec', 'stingAtSec', 'writeWavTo']));
    expect(tools[0].inputSchema.required ?? []).not.toContain('seed');
    expect(tools[1].inputSchema.additionalProperties).toBe(false);
  });

  it('answers ping with an empty result (Req 4.2c)', async () => {
    expect((await client.request('ping')).result).toEqual({});
  });

  it('sends no reply to a notification or to a message without an id (Req 4.2d)', async () => {
    const before = client.stdoutLines.length;
    client.notify('notifications/initialized');
    client.raw(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
    await client.request('ping'); // answered after the two silent messages, in order
    expect(client.stdoutLines.length - before).toBe(1);
  });

  it('answers an unknown method with -32601 (Req 4.3a, 7.2c)', async () => {
    const reply = await client.request('logging/setLevel');
    expect(reply.error?.code).toBe(-32601);
    expect((await client.request('server/discover')).error?.code).toBe(-32601);
  });

  it('answers a line that is not JSON with -32700 and keeps reading (Req 4.3b, 7.2c)', async () => {
    const reply = await client.garbage('{not json');
    expect(reply.error?.code).toBe(-32700);
    expect(reply.id).toBeNull();
    expect((await client.request('ping')).result).toEqual({});
  });

  it('answers an unknown tool with -32602 (Req 4.3c, 7.2c)', async () => {
    const reply = await client.call('summon_demon', {});
    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toMatch(/summon_demon/);
  });

  it('writes only protocol messages to stdout and diagnostics to stderr (Req 4.1c)', async () => {
    for (const line of client.stdoutLines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' });
  });

  it('exits with code 0 when stdin closes (Req 4.4)', async () => {
    const probe = new Client(work);
    await probe.request('ping');
    expect(await probe.close()).toBe(0);
  });
});

describe('score_cue over stdio', () => {
  afterEach(() => {
    for (const name of readdirSync(work)) rmSync(join(work, name), { recursive: true, force: true });
  });

  const structured = (reply: Reply) => reply.result!.structuredContent as Record<string, any>;

  it('gives the same sha256 for the same seed and another for another seed (Req 5.5, 7.2a, 7.2b)', async () => {
    const a = await client.call('score_cue', cue);
    const b = await client.call('score_cue', cue);
    const c = await client.call('score_cue', { ...cue, seed: 4 });
    expect(structured(a).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(structured(a).sha256).toBe(structured(b).sha256);
    expect(structured(c).sha256).not.toBe(structured(a).sha256);
    expect(structured(a)).toMatchObject({ director: 'local', seed: 3, durationSec: 5 });
    expect(structured(a).wavBytes).toBeGreaterThan(5 * 44_100 * 4);
    expect(structured(a).plan.mood).toBe('chase');
  });

  it('returns the structured result and the same JSON as text (Req 5.3)', async () => {
    const reply = await client.call('score_cue', cue);
    const content = reply.result!.content as { type: string; text: string }[];
    expect(content[0].type).toBe('text');
    expect(JSON.parse(content[0].text)).toEqual(structured(reply));
    expect(reply.result!.isError).toBeUndefined();
  });

  it('matches the SHA-256 of the file the CLI writes for the same arguments (Req 5.2, 5.6, 7.2b)', async () => {
    const out = join(cliDir, 'cli.wav');
    await runCli(['--mood', 'chase', '--seconds', '5', '--sting', '3', '--seed', '3', '--out', out, '--quiet'], {}, () => {});
    expect(structured(await client.call('score_cue', cue)).sha256).toBe(sha(readFileSync(out)));
  });

  it('reads sting times out of the scene text as the CLI does (Req 5.2)', async () => {
    const out = join(cliDir, 'scene.wav');
    const scene = 'creeping dread, 8 seconds, a sting at 0:06';
    await runCli(['--scene', scene, '--seed', '5', '--out', out, '--quiet'], {}, () => {});
    const result = structured(await client.call('score_cue', { scene, seed: 5 }));
    expect(result.sha256).toBe(sha(readFileSync(out)));
    expect(result.stingLandingSec).toEqual([6]);
  });

  it('lands the sting at the requested second, to the millisecond (Req 5.4)', async () => {
    const result = structured(await client.call('score_cue', { mood: 'dread', durationSec: 12, stingAtSec: [2.5, 9], seed: 1 }));
    expect(result.stingLandingSec).toHaveLength(2);
    expect(Math.abs(result.stingLandingSec[0] - 2.5)).toBeLessThan(0.001);
    expect(Math.abs(result.stingLandingSec[1] - 9)).toBeLessThan(0.001);
  });

  it('writes no file without writeWavTo (Req 5.7a)', async () => {
    await client.call('score_cue', cue);
    expect(readdirSync(work)).toEqual([]);
  });

  it('writes a file whose SHA-256 equals the reported one, and refuses to overwrite it (Req 5.7b, 5.7c)', async () => {
    const first = structured(await client.call('score_cue', { ...cue, writeWavTo: 'out/cue.wav' }));
    expect(first.wavPath).toBe(join(work, 'out', 'cue.wav'));
    expect(sha(readFileSync(first.wavPath))).toBe(first.sha256);
    const again = await client.call('score_cue', { ...cue, seed: 9, writeWavTo: 'out/cue.wav' });
    expect(again.result!.isError).toBe(true);
    expect(structured(again).error).toMatch(/already exists/);
    expect(sha(readFileSync(first.wavPath))).toBe(first.sha256);
  });

  it('refuses a path outside the working folder and a name without .wav, and writes nothing (Req 5.7c)', async () => {
    const outside = await client.call('score_cue', { ...cue, writeWavTo: join(cliDir, 'escape.wav') });
    const dotdot = await client.call('score_cue', { ...cue, writeWavTo: '../escape.wav' });
    const wrongName = await client.call('score_cue', { ...cue, writeWavTo: 'cue.mp3' });
    for (const reply of [outside, dotdot, wrongName]) expect(reply.result!.isError).toBe(true);
    expect(structured(outside).error).toMatch(/inside the server working directory/);
    expect(structured(wrongName).error).toMatch(/\.wav/);
    expect(existsSync(join(cliDir, 'escape.wav'))).toBe(false);
    expect(readdirSync(work)).toEqual([]);
  });

  it('refuses a symlink that leads out of the working folder (Req 5.7c)', async () => {
    symlinkSync(cliDir, join(work, 'link'));
    const reply = await client.call('score_cue', { ...cue, writeWavTo: 'link/escape.wav' });
    expect(reply.result!.isError).toBe(true);
    expect(existsSync(join(cliDir, 'escape.wav'))).toBe(false);
  });

  it('returns isError for a bad argument and keeps answering (Req 5.8, 7.2b)', async () => {
    const bad = await client.call('score_cue', { mood: 'cheerful', durationSec: 2 });
    expect(bad.error).toBeUndefined();
    expect(bad.result!.isError).toBe(true);
    expect((bad.result!.content as { text: string }[])[0].text).toMatch(/mood/);
    const notObject = await client.call('score_cue', 'dread');
    expect(notObject.result!.isError).toBe(true);
    expect((await client.request('ping')).result).toEqual({});
    expect(structured(await client.call('score_cue', cue)).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores FRIGHT_DIRECTOR=bedrock and reports the local director (Req 4.5)', async () => {
    expect(structured(await client.call('score_cue', cue)).director).toBe('local');
  });
});

describe('list_patches over stdio', () => {
  it('returns every patch in PATCH_IDS order with id, name, blurb, algorithm and feedback (Req 6.1, 6.2, 7.2a)', async () => {
    const reply = await client.call('list_patches');
    const patches = reply.result!.structuredContent.patches as Record<string, unknown>[];
    expect(patches).toHaveLength(11);
    expect(patches.map((p) => p.id)).toEqual([...PATCH_IDS]);
    for (const p of patches) {
      expect(Object.keys(p).sort()).toEqual(['algorithm', 'blurb', 'feedback', 'id', 'name']);
      const patch = PATCHES[p.id as keyof typeof PATCHES];
      expect(p).toEqual({ id: patch.id, name: patch.name, blurb: patch.blurb, algorithm: patch.algorithm, feedback: patch.feedback });
    }
    expect(readdirSync(work)).toEqual([]);
  });

  it('rejects arguments it does not take as a tool error (Req 6.2)', async () => {
    const reply = await client.call('list_patches', { id: 'screech' });
    expect(reply.result!.isError).toBe(true);
  });
});

describe('the fright-score registration in .kiro/settings/mcp.json', () => {
  it('runs the entry script with npx tsx and sets no env, beside the existing servers (Req 6.3)', () => {
    const config = JSON.parse(readFileSync(join(root, '.kiro/settings/mcp.json'), 'utf8')) as { mcpServers: Record<string, any> };
    expect(Object.keys(config.mcpServers)).toEqual(expect.arrayContaining(['aws-docs', 'context7', 'fright-score']));
    const entry = config.mcpServers['fright-score'];
    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(['tsx', 'scripts/mcp/fright-score-mcp.ts']);
    expect(entry.env).toBeUndefined();
    expect(existsSync(join(root, entry.args[1]))).toBe(true);
  });
});
