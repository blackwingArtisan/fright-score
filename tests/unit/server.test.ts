import { describe, expect, it } from 'vitest';
import { LocalDirector } from '../../src/director/local';
import { handleCompose } from '../../src/server/compose';
import { ScorePlanSchema } from '../../src/score/schema';

const post = (body: unknown) =>
  new Request('http://localhost/api/compose', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('/api/compose handler', () => {
  it('returns a validated plan that honors the request', async () => {
    const res = await handleCompose(post({ seed: 5, scene: 'a doll in the attic', durationSec: 30, stingAtSec: [25] }), new LocalDirector());
    expect(res.status).toBe(200);
    const plan = ScorePlanSchema.parse(await res.json());
    expect(plan.durationSec).toBe(30);
    expect(plan.cues.find((c) => c.kind === 'sting')?.atSec).toBe(25);
  });

  it('rejects bad requests with 400 and a field message', async () => {
    const res = await handleCompose(post({ seed: -1 }), new LocalDirector());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/seed/);
    expect((await handleCompose(post('not json'), new LocalDirector())).status).toBe(400);
    expect((await handleCompose(new Request('http://localhost/api/compose'), new LocalDirector())).status).toBe(405);
  });

  it('maps director failures to 502', async () => {
    const broken = { kind: 'bedrock' as const, label: 'broken', plan: async () => Promise.reject(new Error('throttled')) };
    const res = await handleCompose(post({ seed: 1 }), broken);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/throttled/);
  });
});
