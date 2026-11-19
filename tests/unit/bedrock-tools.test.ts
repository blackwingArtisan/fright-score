import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';
import { BedrockDirector } from '../../src/director/bedrock';
import { SCORE_CUE_TOOL_NAME, scoreCueToolSpec } from '../../src/director/tool';
import { PATCH_IDS } from '../../src/engine/patches';
import { composePlan } from '../../src/score/composer';
import { CUE_KINDS, MOODS, ROLES } from '../../src/score/schema';
import { MODE_NAMES, NOTE_NAMES } from '../../src/score/theory';

const plan = composePlan({ seed: 9, mood: 'ritual', durationSec: 30 });
const badPlan = { ...plan, tempoBpm: 999 };

type Reply = { stopReason?: string; output?: { message?: { role: string; content: unknown[] } } };
const use = (input: unknown, toolUseId = 'tu_1', name = 'score_cue') => ({ toolUse: { toolUseId, name, input } });
const reply = (content: unknown[], stopReason = 'tool_use'): Reply => ({
  stopReason,
  output: { message: { role: 'assistant', content } },
});

/** A fake Bedrock client: records every command input and replays scripted replies (the last one repeats). */
function fake(replies: Reply[]) {
  const inputs: any[] = [];
  const send = vi.fn(async (command: ConverseCommand) => {
    // Snapshot, because the director keeps appending to the same messages array.
    inputs.push(structuredClone(command.input));
    return replies[Math.min(inputs.length - 1, replies.length - 1)];
  });
  const director = new BedrockDirector({ modelId: 'test-model', region: 'us-east-1', client: { send } as never });
  return { director, send, inputs };
}

const lastUser = (input: any) => input.messages[input.messages.length - 1];

describe('Bedrock request (Req 7.1a)', () => {
  it('sends one score_cue tool, forced, on the first request (Req 1.1a, 2.2a, 7.1a)', async () => {
    const { director, inputs, send } = fake([reply([use(plan)])]);
    await director.plan({ seed: 1, scene: 'a cellar' });
    expect(send.mock.calls[0][0]).toBeInstanceOf(ConverseCommand);
    const input = inputs[0];
    expect(input.modelId).toBe('test-model');
    expect(input.toolConfig.tools).toHaveLength(1);
    expect(input.toolConfig.tools[0].toolSpec.name).toBe('score_cue');
    expect(input.toolConfig.toolChoice).toEqual({ tool: { name: 'score_cue' } });
    expect(input.inferenceConfig).toEqual({ maxTokens: 2000, temperature: 0.8 });
    expect(input.system[0].text).toContain('score_cue');
  });

  it('describes the plan as sheet music that makes no sound (Req 1.1b)', () => {
    const { description } = scoreCueToolSpec().toolSpec!;
    expect(description).toMatch(/sheet music/);
    expect(description).toMatch(/no sound/);
    expect(scoreCueToolSpec().toolSpec!.name).toBe(SCORE_CUE_TOOL_NAME);
  });

  it('builds the schema once and reuses it (Req 1.1c)', () => {
    expect(scoreCueToolSpec()).toBe(scoreCueToolSpec());
  });

  it('has an object schema with the eleven required keys and every enum value (Req 1.1d, 7.1a)', () => {
    const schema = scoreCueToolSpec().toolSpec!.inputSchema!.json as any;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual([
      'version', 'title', 'mood', 'durationSec', 'tempoBpm', 'beatsPerBar',
      'key', 'sections', 'motif', 'cues', 'palette',
    ]);
    const text = JSON.stringify(schema);
    for (const value of [...MOODS, ...ROLES, ...CUE_KINDS, ...NOTE_NAMES, ...MODE_NAMES, ...PATCH_IDS]) {
      expect(text).toContain(`"${value}"`);
    }
    expect(schema.properties.mood.enum).toEqual([...MOODS]);
    expect(schema.properties.key.properties.mode.enum).toEqual([...MODE_NAMES]);
  });

  it('describes palette as one optional property per role, with no propertyNames or $schema (Req 1.1e, 7.1a)', () => {
    const schema = scoreCueToolSpec().toolSpec!.inputSchema!.json as any;
    expect(schema).not.toHaveProperty('$schema');
    expect(JSON.stringify(schema)).not.toContain('propertyNames');
    const palette = schema.properties.palette;
    expect(palette.type).toBe('object');
    expect(Object.keys(palette.properties)).toEqual([...ROLES]);
    for (const role of ROLES) expect(palette.properties[role].enum).toEqual([...PATCH_IDS]);
    expect(palette.required).toBeUndefined();
  });
});

describe('Bedrock repair loop (Req 2.3)', () => {
  it('answers an invalid input with an error toolResult, then accepts a valid one (Req 7.1b, 2.3a, 2.2)', async () => {
    const { director, inputs, send } = fake([reply([use(badPlan, 'tu_bad')]), reply([use(plan, 'tu_ok')])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    expect(send).toHaveBeenCalledTimes(2);
    expect(inputs[1].toolConfig.toolChoice).toEqual({ tool: { name: 'score_cue' } });
    const [first, assistant, user] = inputs[1].messages;
    expect(first.role).toBe('user');
    expect(assistant).toEqual({ role: 'assistant', content: [use(badPlan, 'tu_bad')] });
    expect(user.role).toBe('user');
    expect(user.content).toHaveLength(1);
    expect(user.content[0].toolResult).toMatchObject({ toolUseId: 'tu_bad', status: 'error' });
    expect(user.content[0].toolResult.content[0].text).toContain('tempoBpm');
  });

  it('gives up after maxRepairs + 1 calls with the last validation message (Req 7.1b, 2.3c, 2.3d)', async () => {
    const { director, send } = fake([reply([use(badPlan)])]);
    await expect(director.plan({ seed: 1 })).rejects.toThrow(/^Bedrock director could not produce a valid plan: .*tempoBpm/s);
    expect(send).toHaveBeenCalledTimes(2);

    const more = fake([reply([use(badPlan)])]);
    const patient = new BedrockDirector({
      modelId: 'm',
      region: 'us-east-1',
      maxRepairs: 3,
      client: { send: more.send } as never,
    });
    await expect(patient.plan({ seed: 1 })).rejects.toThrow(/could not produce a valid plan/);
    expect(more.send).toHaveBeenCalledTimes(4);
  });

  it('shares the maxRepairs limit between validation errors and missing tool calls (Req 2.4c)', async () => {
    const { director, send } = fake([reply([use(badPlan)]), reply([{ text: 'I refuse' }], 'end_turn'), reply([use(plan)])]);
    await expect(director.plan({ seed: 1 })).rejects.toThrow(/could not produce a valid plan: The model did not call score_cue/);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('Bedrock reply without a valid tool call', () => {
  it('asks again after a text-only reply, then accepts a tool call (Req 7.1c, 2.4a)', async () => {
    const { director, inputs } = fake([reply([{ text: 'Here is a plan, trust me.' }], 'end_turn'), reply([use(plan)])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    const [, assistant, user] = inputs[1].messages;
    expect(assistant).toEqual({ role: 'assistant', content: [{ text: 'Here is a plan, trust me.' }] });
    expect(user).toEqual({ role: 'user', content: [{ text: expect.stringContaining('score_cue') }] });
  });

  it('fails with a clear error for a model that always answers in text (Req 2.4a, 2.4c)', async () => {
    const { director, send } = fake([reply([{ text: 'no tools for me' }], 'end_turn')]);
    await expect(director.plan({ seed: 1 })).rejects.toThrow(/could not produce a valid plan: The model did not call score_cue/);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('puts a placeholder in an empty assistant message so the next request stays valid (Req 7.1c, 2.4b)', async () => {
    const { director, inputs } = fake([reply([], 'end_turn'), reply([use(plan)])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    const assistant = inputs[1].messages[1];
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toHaveLength(1);
    expect(assistant.content[0].text.length).toBeGreaterThan(0);
    expect(lastUser(inputs[1]).content[0].text).toContain('score_cue');
  });

  it('handles a missing output object like an empty reply (Req 2.4b)', async () => {
    const { director, inputs } = fake([{}, reply([use(plan)])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    expect(inputs[1].messages[1].content[0].text.length).toBeGreaterThan(0);
  });

  it('does not trust a tool input cut off by max_tokens, even if it would validate (Req 7.1c, 2.4a)', async () => {
    const { director, inputs } = fake([reply([use(plan, 'tu_cut')], 'max_tokens'), reply([use(plan, 'tu_2')])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    const result = lastUser(inputs[1]).content[0].toolResult;
    expect(result).toMatchObject({ toolUseId: 'tu_cut', status: 'error' });
    expect(result.content[0].text).toMatch(/cut off/);
  });

  it('treats a max_tokens reply with text only as a failed attempt (Req 7.1c, 2.4a)', async () => {
    const { director, send } = fake([reply([{ text: 'Once upon' }], 'max_tokens')]);
    await expect(director.plan({ seed: 1 })).rejects.toThrow(/did not call score_cue/);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('answers every toolUse block when the reply holds two (Req 7.1c, 2.3b)', async () => {
    const two = reply([use(badPlan, 'tu_a'), use({ x: 1 }, 'tu_b', 'other_tool')]);
    const { director, inputs } = fake([two, reply([use(plan)])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    const results = lastUser(inputs[1]).content.map((b: any) => b.toolResult);
    expect(results.map((r: any) => r.toolUseId)).toEqual(['tu_a', 'tu_b']);
    expect(results.every((r: any) => r.status === 'error')).toBe(true);
    expect(results[0].content[0].text).toContain('tempoBpm');
    expect(results[1].content[0].text).toMatch(/Unknown tool/);
  });

  it('uses a valid score_cue call next to an unknown tool call (Req 2.1, 2.2)', async () => {
    const { director, send } = fake([reply([use({ x: 1 }, 'tu_b', 'other_tool'), use(plan, 'tu_a')])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('answers a reply that only calls an unknown tool as an error result (Req 2.3b, 2.4a)', async () => {
    const { director, inputs } = fake([reply([use({}, 'tu_x', 'web_search')]), reply([use(plan)])]);
    await expect(director.plan({ seed: 1 })).resolves.toEqual(plan);
    expect(lastUser(inputs[1]).content[0].toolResult).toMatchObject({ toolUseId: 'tu_x', status: 'error' });
  });
});

describe('Bedrock client errors (Req 2.5)', () => {
  it('lets a thrown client error reach the caller unchanged, with no retry (Req 7.1d, 2.5)', async () => {
    const boom = Object.assign(new Error('ValidationException: toolChoice not supported'), { name: 'ValidationException' });
    const send = vi.fn().mockRejectedValue(boom);
    const director = new BedrockDirector({ modelId: 'm', region: 'us-east-1', client: { send } as never });
    await expect(director.plan({ seed: 1 })).rejects.toBe(boom);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('lets an error on a repair request reach the caller unchanged (Req 2.5)', async () => {
    const boom = new Error('ThrottlingException');
    const send = vi.fn().mockResolvedValueOnce(reply([use(badPlan)])).mockRejectedValueOnce(boom);
    const director = new BedrockDirector({ modelId: 'm', region: 'us-east-1', client: { send } as never });
    await expect(director.plan({ seed: 1 })).rejects.toBe(boom);
  });
});
