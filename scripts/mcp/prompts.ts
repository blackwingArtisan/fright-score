import { z } from 'zod';

export const PROMPT_NAME = 'score_scene_for_game';

const MAX_ARG_CHARS = 200;
const PromptArgs = z.strictObject({
  game: z.string().max(MAX_ARG_CHARS).optional(),
  writeDir: z.string().max(MAX_ARG_CHARS).optional(),
});

export const PROMPT_DEFINITION = {
  name: PROMPT_NAME,
  description:
    'Walk an agent through scoring a game: ask for the rooms and events, call score_level, check each sting with verify_cue and report the result.',
  arguments: [
    { name: 'game', description: 'One line that describes the game.', required: false },
    { name: 'writeDir', description: 'A new folder name for the WAV files and the manifest.', required: false },
  ],
};

export type PromptResult =
  | { description: string; messages: { role: 'user'; content: { type: 'text'; text: string } }[] }
  | { error: string };

/** Builds the prompt text. Arguments must be strings of at most 200 characters. */
export function getPrompt(name: unknown, args: unknown): PromptResult {
  if (name !== PROMPT_NAME) return { error: `Unknown prompt: ${String(name)}` };
  const parsed = PromptArgs.safeParse(args ?? {});
  if (!parsed.success) {
    return { error: `Invalid arguments for ${PROMPT_NAME}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ')}` };
  }
  const { game, writeDir } = parsed.data;
  const folder = writeDir ? `Use writeDir "${writeDir}" so the WAV files and manifest.json are saved.` : 'Add writeDir (a new folder name) when the user wants the files saved.';
  const text = [
    'Score the rooms and events of a game with the Fright Score MCP server.',
    ...(game ? ['', `The game: ${game}`] : []),
    '',
    'Follow these steps in order.',
    '1. Ask the user for the rooms. Each room needs an id (lower case letters, digits and underscores, starting with a letter), ' +
      'a mood from the resource fright-score://moods, and a loop length of 4 to 60 seconds. For each room, ask which events need a sting. ' +
      'Each event needs an id and, optionally, one sentence that describes the scene.',
    `2. Call score_level with those rooms and one seed. ${folder}`,
    '3. Call verify_cue on every written sting file, with expectedHitSec set to the hitSec that score_level returned for it. ' +
      'Report each measured time, its error in milliseconds and whether it passed or failed.',
    '4. Tell the user that the AI planned the rooms and events, the local rule-based director wrote the score, and the FS-666 chip made every sound. ' +
      'The same arguments and seed always give the same files.',
  ].join('\n');
  return { description: PROMPT_DEFINITION.description, messages: [{ role: 'user', content: { type: 'text', text } }] };
}
