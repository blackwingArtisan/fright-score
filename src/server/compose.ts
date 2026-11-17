import { z } from 'zod';
import type { Director } from '../director/director';
import { reconcilePlan } from '../score/composer';
import { MAX_DURATION_SEC, MIN_DURATION_SEC, MOODS, formatZodError } from '../score/schema';

/** What the web app may send to `/api/compose`. */
export const ComposeRequestSchema = z.object({
  seed: z.number().int().nonnegative().max(0xffffffff),
  scene: z.string().max(500).optional(),
  mood: z.enum(MOODS).optional(),
  durationSec: z.number().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC).optional(),
  stingAtSec: z.array(z.number().positive().max(MAX_DURATION_SEC)).max(8).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Framework-agnostic handler: validate the request, ask the director for a plan,
 * force the requested constraints, return the plan as JSON.
 */
export async function handleCompose(request: Request, director: Director): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }
  const parsed = ComposeRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: formatZodError(parsed.error) }, 400);
  try {
    const plan = reconcilePlan(await director.plan(parsed.data), parsed.data);
    return json(plan);
  } catch (error) {
    return json({ error: `Director failed: ${(error as Error).message}` }, 502);
  }
}
