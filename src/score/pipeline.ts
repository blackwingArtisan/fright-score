import { arrange } from './arranger';
import { reconcilePlan, type CueRequest } from './composer';
import type { Score, ScorePlan } from './schema';

/** Anything that can turn a request into a ScorePlan (see src/director). */
export interface PlanSource {
  plan(request: CueRequest): Promise<ScorePlan>;
}

/** Director -> reconcile hard constraints -> arrange into notes. */
export async function scoreFromRequest(director: PlanSource, request: CueRequest): Promise<Score> {
  const plan = reconcilePlan(await director.plan(request), request);
  return arrange(plan, request.seed);
}
