import type { Tool } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import { ScorePlanSchema } from '../score/schema';

export const SCORE_CUE_TOOL_NAME = 'score_cue';

type JsonObject = Record<string, unknown>;

export type ScoreCueToolSpec = Tool.ToolSpecMember;

const DESCRIPTION =
  'Records the score plan (the sheet music) for a horror cue. It makes no sound; the FS-666 chip renders the ' +
  'sound later from the plan. Sections must end after they start and stay inside durationSec, no cue may be ' +
  'after durationSec, and motif.degrees and motif.rhythmBeats must have the same length.';

/** Rewrite `palette` from `propertyNames` + `additionalProperties` to one optional property per role. */
function rewritePalette(schema: JsonObject): void {
  const properties = schema.properties as Record<string, JsonObject>;
  const palette = properties.palette;
  const roles = (palette.propertyNames as { enum: string[] }).enum;
  const value = palette.additionalProperties as JsonObject;
  properties.palette = {
    type: 'object',
    properties: Object.fromEntries(roles.map((role) => [role, { ...value }])),
  };
}

function buildSchema(): JsonObject {
  const schema = z.toJSONSchema(ScorePlanSchema, { target: 'draft-7', io: 'input' }) as JsonObject;
  delete schema.$schema;
  rewritePalette(schema);
  return schema;
}

let cached: ScoreCueToolSpec | undefined;

/** The one tool the Bedrock director offers. Built once from ScorePlanSchema, then cached. */
export function scoreCueToolSpec(): ScoreCueToolSpec {
  cached ??= {
    toolSpec: {
      name: SCORE_CUE_TOOL_NAME,
      description: DESCRIPTION,
      inputSchema: { json: buildSchema() as never },
    },
  };
  return cached;
}
