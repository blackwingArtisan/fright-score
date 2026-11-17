import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import type { CueRequest } from '../score/composer';
import type { ScorePlan } from '../score/schema';
import type { Director } from './director';
import { directorSystemPrompt, directorUserPrompt, planFromModelReply } from './prompt';

export interface BedrockDirectorOptions {
  /** Bedrock model or inference profile ID. */
  modelId: string;
  region: string;
  /** Validation retries: the model sees its own errors and repairs the JSON. */
  maxRepairs?: number;
  /** Explicit credentials for runtimes without the default AWS provider chain (e.g. Workers). */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Injected for tests; defaults to a real Bedrock Runtime client. */
  client?: Pick<BedrockRuntimeClient, 'send'>;
}

export const DEFAULT_BEDROCK_MODEL = 'us.amazon.nova-pro-v1:0';

/**
 * The real AI path: Amazon Bedrock's Converse API turns a scene into ScorePlan JSON,
 * which is then validated with the same zod schema as the local director's output.
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
    const messages: { role: 'user' | 'assistant'; content: { text: string }[] }[] = [
      { role: 'user', content: [{ text: directorUserPrompt(request) }] },
    ];
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRepairs; attempt++) {
      const output: ConverseCommandOutput = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: directorSystemPrompt() }],
          messages,
          inferenceConfig: { maxTokens: 2000, temperature: 0.8 },
        }),
      );
      const text = (output.output?.message?.content ?? [])
        .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
        .join('');
      try {
        return planFromModelReply(text);
      } catch (error) {
        lastError = error;
        messages.push({ role: 'assistant', content: [{ text }] });
        messages.push({
          role: 'user',
          content: [{ text: `That JSON was rejected: ${(error as Error).message}. Reply with corrected JSON only.` }],
        });
      }
    }
    throw new Error(`Bedrock director could not produce a valid plan: ${(lastError as Error).message}`);
  }
}
