import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandOutput,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { CueRequest } from '../score/composer';
import { parseScorePlan, type ScorePlan } from '../score/schema';
import type { Director } from './director';
import { directorSystemPrompt, directorUserPrompt } from './prompt';
import { SCORE_CUE_TOOL_NAME, scoreCueToolSpec } from './tool';

export interface BedrockDirectorOptions {
  /** Bedrock model or inference profile ID. */
  modelId: string;
  region: string;
  /** Validation retries: the model sees its own errors and repairs the plan. Shared by validation errors and missing tool calls. */
  maxRepairs?: number;
  /** Explicit credentials for runtimes without the default AWS provider chain (e.g. Workers). */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Injected for tests; defaults to a real Bedrock Runtime client. */
  client?: Pick<BedrockRuntimeClient, 'send'>;
}

export const DEFAULT_BEDROCK_MODEL = 'us.amazon.nova-pro-v1:0';

/**
 * The real AI path: Amazon Bedrock's Converse API turns a scene into a ScorePlan through a
 * forced `score_cue` tool call, whose input is then validated with the same zod schema as the local director's output.
 * Only runs when FRIGHT_DIRECTOR=bedrock and AWS credentials are configured.
 */
export class BedrockDirector implements Director {
  readonly kind = 'bedrock' as const;
  readonly label: string;
  private readonly client: Pick<BedrockRuntimeClient, 'send'>;
  private readonly modelId: string;
  private readonly maxRepairs: number;

  constructor(options: BedrockDirectorOptions) {
    this.modelId = options.modelId;
    this.maxRepairs = options.maxRepairs ?? 1;
    this.client =
      options.client ??
      new BedrockRuntimeClient({ region: options.region, ...(options.credentials ? { credentials: options.credentials } : {}) });
    this.label = `Amazon Bedrock director (${options.modelId})`;
  }

  static fromEnv(env: Record<string, string | undefined>): BedrockDirector {
    const credentials =
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
          }
        : undefined;
    return new BedrockDirector({
      modelId: env.FRIGHT_BEDROCK_MODEL ?? DEFAULT_BEDROCK_MODEL,
      region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1',
      ...(credentials ? { credentials } : {}),
    });
  }

  async plan(request: CueRequest): Promise<ScorePlan> {
    const messages: Message[] = [{ role: 'user', content: [{ text: directorUserPrompt(request) }] }];
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRepairs; attempt++) {
      const output: ConverseCommandOutput = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: directorSystemPrompt() }],
          messages,
          inferenceConfig: { maxTokens: 2000, temperature: 0.8 },
          toolConfig: {
            tools: [scoreCueToolSpec()],
            toolChoice: { tool: { name: SCORE_CUE_TOOL_NAME } },
          },
        }),
      );
      const blocks = output.output?.message?.content ?? [];
      const toolUses = blocks.flatMap((block) => (block.toolUse ? [block.toolUse] : []));
      const call = toolUses.find((use) => use.name === SCORE_CUE_TOOL_NAME);
      const cutOff = output.stopReason === 'max_tokens';

      // Every toolUseId must be answered; the failed call gets the reason, any other block an "unknown tool".
      let reason: string;
      if (call && !cutOff) {
        try {
          return parseScorePlan(call.input);
        } catch (error) {
          lastError = error as Error;
          reason = lastError.message;
        }
      } else if (call) {
        lastError = new Error('The model reply was cut off (max_tokens) before the plan was complete');
        reason = `${lastError.message}. Call ${SCORE_CUE_TOOL_NAME} again with the complete plan.`;
      } else {
        lastError = new Error(`The model did not call ${SCORE_CUE_TOOL_NAME}`);
        reason = `Unknown tool. Call ${SCORE_CUE_TOOL_NAME}.`;
      }

      messages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : [{ text: '(no reply)' }] });
      const results: ContentBlock[] = toolUses.map((use) => ({
        toolResult: {
          toolUseId: use.toolUseId,
          status: 'error',
          content: [{ text: use === call ? reason : `Unknown tool. Call ${SCORE_CUE_TOOL_NAME}.` }],
        },
      }));
      messages.push({
        role: 'user',
        content:
          results.length > 0 ? results : [{ text: `Call the ${SCORE_CUE_TOOL_NAME} tool with the complete plan.` }],
      });
    }
    throw new Error(`Bedrock director could not produce a valid plan: ${lastError?.message ?? 'unknown error'}`);
  }
}
