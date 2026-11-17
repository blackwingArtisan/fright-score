import type { CueRequest } from '../score/composer';
import { parseScorePlan, type ScorePlan } from '../score/schema';
import type { Director } from './director';

/**
 * Web-app adapter for the AI path: POSTs the request to a server endpoint (`/api/compose`)
 * that runs the Bedrock director, so no AWS credentials ever reach the browser.
 */
export class RemoteDirector implements Director {
  readonly kind = 'remote' as const;
  readonly label = 'AI director (server)';

  constructor(
    private readonly endpoint = '/api/compose',
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async plan(request: CueRequest): Promise<ScorePlan> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Director endpoint returned ${response.status}`);
    return parseScorePlan(await response.json());
  }
}
