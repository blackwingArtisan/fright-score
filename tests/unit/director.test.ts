import { describe, expect, it, vi } from 'vitest';
import { BedrockDirector } from '../../src/director/bedrock';
import { createDirector } from '../../src/director';
import { parseDirectorKind } from '../../src/director/director';
import { LocalDirector } from '../../src/director/local';
import { directorSystemPrompt, directorUserPrompt } from '../../src/director/prompt';
import { RemoteDirector } from '../../src/director/remote';
import { composePlan } from '../../src/score/composer';
import { scoreFromRequest } from '../../src/score/pipeline';

const samplePlan = composePlan({ seed: 9, mood: 'ritual', durationSec: 30 });

function toolReply(input: unknown, toolUseId = 'tooluse_1') {
  return {
    stopReason: 'tool_use',
    output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId, name: 'score_cue', input } }] } },
  };
}

describe('director adapters', () => {
  it('picks the local director by default and rejects unknown kinds', () => {
    expect(createDirector(undefined).kind).toBe('local');
    expect(createDirector('remote').kind).toBe('remote');
    expect(createDirector('bedrock', { AWS_REGION: 'us-west-2' }).kind).toBe('bedrock');
    expect(() => parseDirectorKind('oracle')).toThrow(/Unknown director/);
  });

  it('local director returns the composer plan', async () => {
    const plan = await new LocalDirector().plan({ seed: 9, mood: 'ritual', durationSec: 30 });
    expect(plan).toEqual(samplePlan);
  });

  it('system prompt names the tool, keeps the patch list and craft rules, and drops the JSON shape (Req 1.2b, 1.2c)', () => {
    const prompt = directorSystemPrompt();
    for (const word of ['score_cue', 'grave-drone', 'sting', 'silence', 'tritone']) expect(prompt).toContain(word);
    for (const word of ['JSON shape', 'tempoBpm', 'beatsPerBar']) expect(prompt).not.toContain(word);
    expect(directorUserPrompt({ seed: 1, scene: 'a cellar', durationSec: 30, stingAtSec: [20] })).toMatch(/Stings at: 20/);
  });

  it('bedrock director validates the tool input (fake client, no network) (Req 2.1, 2.2, 7.4)', async () => {
    const send = vi.fn().mockResolvedValue(toolReply(samplePlan));
    const director = new BedrockDirector({ modelId: 'test-model', region: 'us-east-1', client: { send } as never });
    const plan = await director.plan({ seed: 1, scene: 'cult chanting' });
    expect(plan.title).toBe(samplePlan.title);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('bedrock director repairs an invalid tool input once, then gives up (Req 2.3, 7.4)', async () => {
    const bad = { ...samplePlan, tempoBpm: 999 };
    const send = vi.fn().mockResolvedValueOnce(toolReply(bad)).mockResolvedValueOnce(toolReply(samplePlan));
    const director = new BedrockDirector({ modelId: 'm', region: 'us-east-1', client: { send } as never });
    await expect(director.plan({ seed: 1 })).resolves.toMatchObject({ mood: 'ritual' });
    expect(send).toHaveBeenCalledTimes(2);

    const alwaysBad = vi.fn().mockResolvedValue(toolReply(bad));
    const stubborn = new BedrockDirector({ modelId: 'm', region: 'us-east-1', client: { send: alwaysBad } as never });
    await expect(stubborn.plan({ seed: 1 })).rejects.toThrow(/could not produce a valid plan/);
  });

  it('remote director posts the request and validates the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(samplePlan), { status: 200 }));
    const plan = await new RemoteDirector('/api/compose', fetchImpl as never).plan({ seed: 3, scene: 'x' });
    expect(plan.mood).toBe('ritual');
    expect(fetchImpl).toHaveBeenCalledWith('/api/compose', expect.objectContaining({ method: 'POST' }));
    const failing = vi.fn().mockResolvedValue(new Response('nope', { status: 502 }));
    await expect(new RemoteDirector('/api/compose', failing as never).plan({ seed: 3 })).rejects.toThrow(/502/);
  });

  it('the pipeline enforces requested stings even when a director ignores them', async () => {
    const lazy = { plan: async () => composePlan({ seed: 4, mood: 'chase', durationSec: 40 }) };
    const score = await scoreFromRequest(lazy, { seed: 4, durationSec: 20, stingAtSec: [15] });
    expect(score.durationSec).toBe(20);
    expect(score.tracks.find((t) => t.id === 'stinger')?.notes[0].atSec).toBe(15);
  });
});
