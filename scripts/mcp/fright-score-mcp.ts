#!/usr/bin/env node
// Fright Score as a Model Context Protocol server over stdio: one JSON-RPC message per line.
// Standard output carries protocol messages only; diagnostics go to standard error.
// It always uses the local director and never reads AWS settings.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { PROMPT_DEFINITION, getPrompt } from './prompts';
import { MOODS_RESOURCE, MOODS_URI, readMoods } from './resources';
import { TOOLS } from './tools';

/** Supported protocol revisions with the `initialize` handshake, newest first. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const RESOURCE_NOT_FOUND = -32002;

type Id = string | number | null;
type Reply = Record<string, unknown>;

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

const failure = (id: Id, code: number, message: string): Reply => ({ jsonrpc: '2.0', id, error: { code, message } });
const success = (id: Id, result: unknown): Reply => ({ jsonrpc: '2.0', id, result });

const listed = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: z.toJSONSchema(tool.inputSchema, { target: 'draft-2020-12', io: 'input' }),
}));

async function callTool(id: Id, params: unknown): Promise<Reply> {
  const { name, arguments: args } = (params ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof name !== 'string') return failure(id, INVALID_PARAMS, 'tools/call needs a tool name');
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return failure(id, INVALID_PARAMS, `Unknown tool: ${name}`);
  const result = await tool.run(args);
  return success(id, {
    content: [{ type: 'text', text: JSON.stringify(result.structured) }],
    structuredContent: result.structured,
    ...(result.isError ? { isError: true } : {}),
  });
}

/** Answers one parsed message. Returns undefined for notifications, which get no reply. */
export async function handleMessage(message: unknown): Promise<Reply | undefined> {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return failure(null, INVALID_REQUEST, 'Invalid request');
  }
  const { id, method, params } = message as { id?: Id; method?: unknown; params?: unknown };
  if (id === undefined) return undefined;
  if (typeof method !== 'string') return failure(id, INVALID_REQUEST, 'Invalid request');
  try {
    switch (method) {
      case 'initialize': {
        const asked = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
        const protocolVersion = typeof asked === 'string' && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
        return success(id, { protocolVersion, capabilities: { tools: {}, prompts: {}, resources: {} }, serverInfo: { name: 'fright-score', version } });
      }
      case 'ping':
        return success(id, {});
      case 'tools/list':
        return success(id, { tools: listed });
      case 'tools/call':
        return await callTool(id, params);
      case 'prompts/list':
        return success(id, { prompts: [PROMPT_DEFINITION] });
      case 'prompts/get': {
        const { name, arguments: args } = (params ?? {}) as { name?: unknown; arguments?: unknown };
        const prompt = getPrompt(name, args);
        return 'error' in prompt ? failure(id, INVALID_PARAMS, prompt.error) : success(id, prompt);
      }
      case 'resources/list':
        return success(id, { resources: [MOODS_RESOURCE] });
      case 'resources/read': {
        const uri = (params as { uri?: unknown } | undefined)?.uri;
        if (typeof uri !== 'string') return failure(id, INVALID_PARAMS, 'resources/read needs a uri');
        if (uri !== MOODS_URI) return { jsonrpc: '2.0', id, error: { code: RESOURCE_NOT_FOUND, message: 'Resource not found', data: { uri } } };
        return success(id, { contents: [{ uri, mimeType: MOODS_RESOURCE.mimeType, text: readMoods() }] });
      }
      case 'resources/templates/list':
        return success(id, { resourceTemplates: [] });
      default:
        return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (error) {
    console.error(`fright-score-mcp: ${(error as Error).stack ?? error}`);
    return failure(id, INTERNAL_ERROR, (error as Error).message);
  }
}

/** Handles one input line. */
export async function handleLine(line: string): Promise<Reply | undefined> {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return failure(null, PARSE_ERROR, 'Parse error');
  }
  return handleMessage(message);
}

function serve(): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  // One message at a time, in arrival order: rendering is synchronous CPU work.
  let queue: Promise<void> = Promise.resolve();
  lines.on('line', (line) => {
    if (line.trim() === '') return;
    queue = queue.then(async () => {
      const reply = await handleLine(line);
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    });
  });
  // When stdin closes, the queue drains and the process ends on its own with code 0.
  lines.on('close', () => console.error('fright-score-mcp: stdin closed, exiting'));
}

const isMain = /fright-score-mcp\.ts$/.test(process.argv[1] ?? '');
if (isMain) serve();
