import { composePlan, type CueRequest } from '../score/composer';
import type { ScorePlan } from '../score/schema';
import type { Director } from './director';

/** Free, offline director: rule-based scene reading plus a seeded Markov composer. */
export class LocalDirector implements Director {
  readonly kind = 'local' as const;
  readonly label = 'Local director (rules + Markov, offline)';

  async plan(request: CueRequest): Promise<ScorePlan> {
    return composePlan(request);
  }
}
