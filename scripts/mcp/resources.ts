import { MOOD_LOUDNESS_LUFS } from '../../src/engine/loudness';
import { MOOD_PROFILES } from '../../src/score/moods';
import { MOODS } from '../../src/score/schema';

export const MOODS_URI = 'fright-score://moods';

export const MOODS_RESOURCE = {
  uri: MOODS_URI,
  name: 'moods',
  title: 'Fright Score moods',
  description: 'Every mood score_level and score_cue accept, with its tempo range in BPM and its loudness ceiling in LUFS.',
  mimeType: 'application/json',
};

/** The moods as JSON text, read from the mood profiles and loudness ceilings when called. */
export function readMoods(): string {
  const moods = MOODS.map((id) => ({
    id,
    label: MOOD_PROFILES[id].label,
    tagline: MOOD_PROFILES[id].tagline,
    tempoBpm: { min: MOOD_PROFILES[id].tempoBpm[0], max: MOOD_PROFILES[id].tempoBpm[1] },
    loudnessCeilingLufs: MOOD_LOUDNESS_LUFS[id],
  }));
  return JSON.stringify(moods, null, 2);
}
