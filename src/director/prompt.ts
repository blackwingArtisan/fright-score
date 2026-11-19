import { PATCHES, PATCH_IDS } from '../engine/patches';
import type { CueRequest } from '../score/composer';

/** System prompt for an LLM director. The plan's shape comes from the `score_cue` tool schema. */
export function directorSystemPrompt(): string {
  const patchList = PATCH_IDS.map((id) => `- ${id}: ${PATCHES[id].blurb}`).join('\n');
  return [
    'You are the music director for Fright Score, a tool that writes original horror cues for an emulated',
    "4-operator FM synthesis chip. Turn the user's scene into a score plan. Answer by calling the score_cue tool",
    'with the complete plan. Do not reply with prose. You write the sheet music; the chip makes the sound.',
    'Choose each palette entry from the patch list below, and give directorNotes of 2 to 4 plain sentences.',
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
