import { PATCHES, PATCH_IDS } from '../engine/patches';
import type { CueRequest } from '../score/composer';
import { CUE_KINDS, MOODS, ROLES, parseScorePlan, type ScorePlan } from '../score/schema';
import { MODE_NAMES, NOTE_NAMES } from '../score/theory';

/** System prompt for an LLM director. It describes the ScorePlan JSON contract exactly. */
export function directorSystemPrompt(): string {
  const patchList = PATCH_IDS.map((id) => `- ${id}: ${PATCHES[id].blurb}`).join('\n');
  return [
    'You are the music director for Fright Score, a tool that writes original horror cues for an emulated',
    '4-operator FM synthesis chip. Turn the user\'s scene into a score plan. Reply with ONE JSON object and nothing else.',
    '',
    'JSON shape:',
    '{',
    '  "version": 1,',
    '  "title": string (evocative, max 80 chars),',
    `  "mood": one of ${JSON.stringify(MOODS)},`,
    '  "scene": the scene text, optional,',
    '  "durationSec": number 5-300,',
    '  "tempoBpm": number 30-220,',
    '  "beatsPerBar": integer 2-7,',
    `  "key": { "root": one of ${JSON.stringify(NOTE_NAMES)}, "mode": one of ${JSON.stringify(MODE_NAMES)} },`,
    '  "sections": [{ "name": string, "startSec": number, "endSec": number, "intensity": 0-1,',
    `                 "layers": array of ${JSON.stringify(ROLES.filter((r) => r !== 'stinger'))} }] (1-12, in order, covering 0..durationSec),`,
    '  "motif": { "degrees": integers (scale degrees, 0 = root), "rhythmBeats": positive numbers, same length, 2-16 notes },',
    `  "cues": [{ "atSec": number, "kind": one of ${JSON.stringify(CUE_KINDS)}, "label": optional string, "lengthSec": optional number }],`,
    '  "palette": { role: patch id } choosing from the patch list below,',
    '  "directorNotes": 2-4 plain sentences explaining the musical choices',
    '}',
    '',
    'Patches:',
    patchList,
    '',
    'Craft rules: horror lives in the flat second, the tritone and the silence before a hit. Build intensity',
    'toward stings. Put a 0.6 s "silence" cue right before each "sting", and a "riser" cue that ends at the sting.',
    'Keep motifs short and singable. Never imitate an existing film or game theme.',
  ].join('\n');
}

export function directorUserPrompt(request: CueRequest): string {
  const parts: string[] = [];
  if (request.scene) parts.push(`Scene: ${request.scene}`);
  if (request.mood) parts.push(`Mood: ${request.mood}`);
  if (request.durationSec) parts.push(`Length: ${request.durationSec} seconds`);
  if (request.stingAtSec?.length) parts.push(`Stings at: ${request.stingAtSec.join(', ')} seconds`);
  if (parts.length === 0) parts.push('Scene: a slow, creeping horror cue.');
  return parts.join('\n');
}

/** Pull the first JSON object out of a model reply (tolerates code fences and stray prose). */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start < 0) throw new Error('Model reply contained no JSON object');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error('Model reply had an unterminated JSON object');
}

/** Parse and validate a model reply into a ScorePlan, or throw with the validation errors. */
export function planFromModelReply(text: string): ScorePlan {
  return parseScorePlan(extractJsonObject(text));
}
