import { MOODS, type Mood } from './schema';

/**
 * Rule-based reader for scene descriptions such as
 * "creeping dread, 90 seconds, builds to a sting at 1:10".
 * It pulls out a mood, a length, cue times and the overall shape of the cue.
 */

export type Shape = 'build' | 'steady' | 'fade';

export interface SceneReading {
  mood?: Mood;
  /** How strongly each mood matched, for the director's notes. */
  moodScores: Record<Mood, number>;
  durationSec?: number;
  stingAtSec: number[];
  hitAtSec: number[];
  shape: Shape;
  /** Scene nouns the title generator can use, e.g. "cellar", "doll". */
  nouns: string[];
  wantsJumpScare: boolean;
}

const MOOD_WORDS: Record<Mood, string[]> = {
  dread: [
    'dread', 'creeping', 'creep', 'ominous', 'dark', 'darkness', 'basement', 'cellar', 'fog', 'mist',
    'abandoned', 'unease', 'uneasy', 'haunted', 'decay', 'empty', 'void', 'cold', 'grave', 'tomb', 'crypt',
    'eerie', 'fear', 'horror', 'slow', 'looming', 'doom',
  ],
  stalker: [
    'stalk', 'stalker', 'stalking', 'watching', 'watched', 'footsteps', 'hiding', 'hide', 'following',
    'behind', 'closet', 'suspense', 'tension', 'tense', 'lurking', 'lurk', 'shadow', 'shadows', 'breathing',
    'whisper', 'whispers', 'killer', 'window', 'knock', 'creak', 'thriller', 'investigate',
  ],
  chase: [
    'chase', 'chased', 'run', 'running', 'escape', 'flee', 'fleeing', 'pursuit', 'sprint', 'hunt', 'hunted',
    'hunting', 'race', 'panic', 'frantic', 'attack', 'fight', 'horde', 'zombies', 'zombie', 'fast', 'action',
  ],
  lullaby: [
    'lullaby', 'child', 'children', 'kid', 'doll', 'dolls', 'music box', 'nursery', 'carousel', 'toy',
    'toys', 'little girl', 'little boy', 'playground', 'cradle', 'innocent', 'sweet', 'birthday', 'clown',
    'circus', 'attic', 'dream', 'memory', 'ghost girl', 'swing',
  ],
  ritual: [
    'ritual', 'cult', 'chant', 'chanting', 'summon', 'summoning', 'occult', 'altar', 'pagan', 'candle',
    'candles', 'sacrifice', 'monk', 'monks', 'demon', 'demonic', 'satanic', 'pentagram', 'coven', 'witch',
    'witches', 'temple', 'church', 'cathedral', 'drums', 'tribal', 'ancient', 'possession',
  ],
};

const SCENE_NOUNS = [
  'cellar', 'basement', 'attic', 'hallway', 'door', 'forest', 'woods', 'lake', 'house', 'church', 'chapel',
  'doll', 'carousel', 'well', 'mirror', 'nursery', 'graveyard', 'cemetery', 'crypt', 'altar', 'hospital',
  'asylum', 'motel', 'cabin', 'swamp', 'tunnel', 'elevator', 'stairwell', 'lighthouse', 'farm', 'field',
  'closet', 'window', 'garden', 'manor', 'tomb', 'ship', 'station', 'mine', 'orchard', 'theater',
];

/**
 * Parse a time phrase into seconds. Accepts "1:30", "0:70" (seconds may exceed 59),
 * "70s", "70 sec", "70 seconds", "1.5 min", "2 minutes", "1m10s".
 */
export function parseTimePhrase(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  let m = /^(\d+):(\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+)\s*m(?:in)?\s*(\d+(?:\.\d+)?)\s*s(?:ec)?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)?$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)$/.exec(t);
  if (m) return Number(m[1]) * 60;
  return undefined;
}

const TIME = String.raw`(\d+:\d{1,3}(?:\.\d+)?|\d+\s*m(?:in)?\s*\d+(?:\.\d+)?\s*s(?:ec)?|\d+(?:\.\d+)?\s*(?:seconds|second|secs|sec|s|minutes|minute|mins|min|m)\b|\d+(?:\.\d+)?)`;
const STING_WORDS = String.raw`(?:sting|stinger|scare|jump\s*scare|jumpscare|stab|shock|reveal|crash|boom|slam|scream)`;
const HIT_WORDS = String.raw`(?:hit|impact|thud|bang|knock|hits)`;

function collectCueTimes(text: string, words: string): { times: number[]; spans: [number, number][] } {
  const times: number[] = [];
  const spans: [number, number][] = [];
  const patterns = [
    new RegExp(String.raw`${words}\s*(?:lands\s*|hits\s*|comes\s*|right\s*|exactly\s*)?(?:at|@|on)\s*${TIME}`, 'gi'),
    new RegExp(String.raw`(?:at|@)\s*${TIME}\s*(?:a|an|the|big|huge|sudden|loud)?\s*${words}`, 'gi'),
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const sec = parseTimePhrase(m[1]);
      const start = m.index ?? 0;
      if (sec !== undefined && !spans.some(([a, b]) => start < b && start + m[0].length > a)) {
        times.push(sec);
        spans.push([start, start + m[0].length]);
      }
    }
  }
  return { times, spans };
}

function findDuration(text: string, cueSpans: [number, number][]): number | undefined {
  const re = new RegExp(
    String.raw`(\d+:\d{1,3}|\d+\s*m(?:in)?\s*\d+\s*s(?:ec)?|\d+(?:\.\d+)?\s*(?:seconds|second|secs|sec|s|minutes|minute|mins|min|m)\b)`,
    'gi',
  );
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const inCue = cueSpans.some(([a, b]) => start >= a && start < b);
    const before = text.slice(Math.max(0, start - 6), start).toLowerCase();
    if (inCue || /\b(at|@|by|until|after)\s*$/.test(before)) continue;
    const sec = parseTimePhrase(m[1]);
    if (sec !== undefined && sec > 0) return sec;
  }
  return undefined;
}

export function readScene(input: string): SceneReading {
  const text = input.toLowerCase();
  const moodScores = Object.fromEntries(MOODS.map((m) => [m, 0])) as Record<Mood, number>;
  for (const mood of MOODS) {
    for (const word of MOOD_WORDS[mood]) {
      const re = new RegExp(String.raw`\b${word.replace(/\s+/g, String.raw`\s+`)}\b`, 'g');
      moodScores[mood] += (text.match(re) ?? []).length * (word.includes(' ') ? 2 : 1);
    }
  }
  let mood: Mood | undefined;
  let best = 0;
  for (const m of MOODS) {
    if (moodScores[m] > best) {
      best = moodScores[m];
      mood = m;
    }
  }

  const stings = collectCueTimes(text, STING_WORDS);
  const hits = collectCueTimes(text, HIT_WORDS);
  const durationSec = findDuration(text, [...stings.spans, ...hits.spans]);

  let shape: Shape = 'steady';
  if (/\b(build|builds|building|crescendo|rising|rises|grows|growing|escalat\w*|swell\w*|climb\w*)\b/.test(text)) {
    shape = 'build';
  } else if (/\b(fade|fades|fading|dies away|dying|recede\w*|calm\w*|aftermath)\b/.test(text)) {
    shape = 'fade';
  }

  const wantsJumpScare =
    stings.times.length > 0 || /\b(jump\s*scare|jumpscare|sting|stinger|scare|shock|scream)\b/.test(text);

  const nouns = SCENE_NOUNS.filter((n) => new RegExp(String.raw`\b${n}s?\b`).test(text));

  return {
    mood,
    moodScores,
    durationSec,
    stingAtSec: stings.times,
    hitAtSec: hits.times,
    shape,
    nouns,
    wantsJumpScare,
  };
}
