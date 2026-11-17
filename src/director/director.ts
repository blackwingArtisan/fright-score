import type { CueRequest } from '../score/composer';
import type { ScorePlan } from '../score/schema';

/** Turns a request (scene, mood, length, stings, seed) into a ScorePlan. */
export interface Director {
  readonly kind: DirectorKind;
  /** Short label for the UI and CLI output. */
  readonly label: string;
  plan(request: CueRequest): Promise<ScorePlan>;
}

export const DIRECTOR_KINDS = ['local', 'bedrock', 'remote'] as const;
export type DirectorKind = (typeof DIRECTOR_KINDS)[number];

export function parseDirectorKind(value: string | undefined, fallback: DirectorKind = 'local'): DirectorKind {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if ((DIRECTOR_KINDS as readonly string[]).includes(v)) return v as DirectorKind;
  throw new Error(`Unknown director "${value}". Use one of: ${DIRECTOR_KINDS.join(', ')}`);
}
