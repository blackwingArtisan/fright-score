import { describe, expect, it, vi } from 'vitest';
import { BedrockDirector } from '../../src/director/bedrock';
import { createDirector } from '../../src/director';
import { parseDirectorKind } from '../../src/director/director';
import { LocalDirector } from '../../src/director/local';
import { directorSystemPrompt, directorUserPrompt, extractJsonObject, planFromModelReply } from '../../src/director/prompt';
import { RemoteDirector } from '../../src/director/remote';
import { composePlan } from '../../src/score/composer';
import { scoreFromRequest } from '../../src/score/pipeline';

const samplePlan = composePlan({ seed: 9, mood: 'ritual', durationSec: 30 });

function converseReply(text: string) {
  return { output: { message: { role: 'assistant', content: [{ text }] } } };
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

  it('describes the full JSON contract in the system prompt', () => {
    const prompt = directorSystemPrompt();
    for (const word of ['durationSec', 'tempoBpm', 'phrygian', 'grave-drone', 'sting', 'silence']) expect(prompt).toContain(word);
    expect(directorUserPrompt({ seed: 1, scene: 'a cellar', durationSec: 30, stingAtSec: [20] })).toMatch(/Stings at: 20/);
  });

  it('extracts JSON from fenced or chatty model replies', () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a": {"b": "}"}}\n```')).toEqual({ a: { b: '}' } });
    expect(extractJsonObject('Sure! {"x": 1} hope that helps')).toEqual({ x: 1 });
    expect(() => extractJsonObject('no json here')).toThrow();
    expect(planFromModelReply(JSON.stringify(samplePlan))).toEqual(samplePlan);
  });

  it('bedrock director validates the model reply (fake client, no network)', async () => {
    const send = vi.fn().mockResolvedValue(converseReply('```json\n' + JSON.stringify(samplePlan) + '\n```'));
    const director = new BedrockDirector({ modelId: 'test-model', region: 'us-east-1', client: { send } as never });
    const plan = await director.plan({ seed: 1, scene: 'cult chanting' });
    expect(plan.title).toBe(samplePlan.title);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('bedrock director asks the model to repair invalid JSON once, then gives up', async () => {
    const bad = JSON.stringify({ ...samplePlan, tempoBpm: 999 });
    const send = vi
      .fn()
      .mockResolvedValueOnce(converseReply(bad))
      .mockResolvedValueOnce(converseReply(JSON.stringify(samplePlan)));
    const director = new BedrockDirector({ modelId: 'm', region: 'us-east-1', client: { send } as never });
    await expect(director.plan({ seed: 1 })).resolves.toMatchObject({ mood: 'ritual' });
    expect(send).toHaveBeenCalledTimes(2);

    const alwaysBad = vi.fn().mockResolvedValue(converseReply(bad));
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
