import { MOOD_PROFILES, type MoodProfile } from './moods';
import { createRng, type Rng } from './rng';
import { readScene, type SceneReading, type Shape } from './scene';
import {
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  ROLES,
  parseScorePlan,
  type Cue,
  type Mood,
  type Role,
  type ScorePlan,
  type Section,
} from './schema';
import { MODE_LABELS, degreeToMidi, formatTime, midiToName, type NoteName } from './theory';

/** What the user asked for. Any field may be missing; the director fills the gaps. */
export interface CueRequest {
  scene?: string;
  mood?: Mood;
  durationSec?: number;
  stingAtSec?: number[];
  /** Seamless loop for games: whole bars, steady intensity, no fades. */
  loop?: boolean;
  seed: number;
}

const SECTION_NAMES: Record<Mood, string[][]> = {
  dread: [
    ['Threshold', 'The Cold Room', 'Dust and Static', 'First Light Fails'],
    ['Descent', 'Something Breathes', 'The Long Hall', 'Under the Floor'],
    ['It Knows', 'Closer', 'The Door Moves', 'No Way Back'],
    ['The Turn', 'Too Close', 'Eyes Open', 'The Last Step'],
  ],
  stalker: [
    ['Empty Street', 'Alone, Probably', 'Porch Light'],
    ['Footsteps', 'Keeping Pace', 'Reflection'],
    ['Behind You', 'The Gap Closes', 'Breathing'],
    ['Do Not Turn Around', 'Within Reach', 'The Hand'],
  ],
  chase: [
    ['Run', 'Bolt', 'Out the Back Door'],
    ['Corridors', 'Dead End', 'Gaining'],
    ['Cornered', 'The Fence', 'No Air'],
    ['Last Stretch', 'Faster', 'It Has Your Scent'],
  ],
  lullaby: [
    ['Wind the Key', 'Nursery', 'Hush'],
    ['The Dolls Listen', 'Second Verse', 'Rocking Chair'],
    ['The Melody Bends', 'Wrong Note', 'Someone Hums Along'],
    ['Last Turn of the Key', 'Too Slow', 'The Song Stops'],
  ],
  ritual: [
    ['Candles', 'The Circle', 'Gathering'],
    ['Invocation', 'The Chant Rises', 'Old Words'],
    ['Offering', 'The Names', 'Blood on Stone'],
    ['It Answers', 'Ascension', 'The Veil Tears'],
  ],
};

const TITLE_ADJECTIVES = ['Hollow', 'Black', 'Drowned', 'Silent', 'Rotten', 'Forgotten', 'Crooked', 'Pale', 'Last', 'Weeping'];
const TITLE_NOUNS = ['Door', 'Attic', 'Hallway', 'Cradle', 'Bell', 'Chapel', 'Lantern', 'Stair', 'Well', 'Window'];
const TITLE_FORMS: ((adj: string, noun: string) => string)[] = [
  (a, n) => `The ${a} ${n}`,
  (a, n) => `Nocturne for a ${a} ${n}`,
  (a, n) => `Hymn of the ${a} ${n}`,
  (a, n) => `Requiem for the ${n}`,
  (a, n) => `Behind the ${a} ${n}`,
];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function chooseTitle(rng: Rng, reading: SceneReading | undefined): string {
  const adj = rng.pick(TITLE_ADJECTIVES);
  const noun = reading && reading.nouns.length > 0 ? capitalize(rng.pick(reading.nouns)) : rng.pick(TITLE_NOUNS);
  return rng.pick(TITLE_FORMS)(adj, noun);
}

/** Intensity for each section of a cue with the given shape. */
export function intensityCurve(shape: Shape, count: number, profile: MoodProfile, rng: Rng): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    let v: number;
    if (shape === 'build') v = 0.18 + 0.8 * t;
    else if (shape === 'fade') v = 0.85 - 0.6 * t;
    else v = profile.steadyIntensity + (i % 2 === 0 ? -0.06 : 0.08);
    out.push(round2(clamp(v + rng.range(-0.04, 0.04), 0.05, 1)));
  }
  return out;
}

/** Roles that play at a given intensity in this mood. */
export function layersFor(profile: MoodProfile, intensity: number): Role[] {
  return ROLES.filter((r) => {
    const th = profile.layerThresholds[r];
    return th !== undefined && intensity >= th;
  });
}

/** First-order Markov walk over scale-degree steps, favoring half and whole steps and returning home. */
export function composeMotif(profile: MoodProfile, rng: Rng): ScorePlan['motif'] {
  const steps = [-3, -2, -1, 0, 1, 2, 3, 4];
  const length = rng.int(profile.motifLength[0], profile.motifLength[1]);
  const degrees: number[] = [rng.weighted([0, 0, 4, 2], [3, 1, 1, 1])];
  let prevStep = 0;
  for (let i = 1; i < length; i++) {
    const weights = profile.stepWeights.map((w, k) => {
      const step = steps[k];
      let weight = w;
      // After a leap, prefer to step back the other way (classic melodic recovery).
      if (Math.abs(prevStep) >= 3 && Math.sign(step) === -Math.sign(prevStep) && Math.abs(step) <= 2) weight *= 3;
      if (step === 0 && prevStep === 0) weight *= 0.2;
      return weight;
    });
    let step = rng.weighted(steps, weights);
    const candidate = degrees[i - 1] + step;
    if (candidate < -4 || candidate > 9) step = -step;
    degrees.push(degrees[i - 1] + step);
    prevStep = step;
  }
  // End on the root, or hang on the flat second for an unresolved ending.
  if (length >= 3) degrees[length - 1] = rng.weighted([0, 1, -1], [3, 2, 1]);

  const rhythmBeats: number[] = [];
  while (rhythmBeats.length < length) rhythmBeats.push(...rng.pick(profile.rhythmCells));
  return { degrees, rhythmBeats: rhythmBeats.slice(0, length) };
}

function sectionBounds(durationSec: number, stings: number[], barSec: number, count: number): [number, number][] {
  const lastSting = stings.length > 0 ? Math.max(...stings) : undefined;
  const hasAftermath = lastSting !== undefined && durationSec - lastSting >= 3;
  const buildEnd = hasAftermath ? lastSting! : durationSec;
  const buildCount = hasAftermath ? Math.max(1, count - 1) : count;
  const bounds: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < buildCount; i++) {
    let end = i === buildCount - 1 ? buildEnd : (buildEnd * (i + 1)) / buildCount;
    if (i < buildCount - 1) {
      const snapped = Math.round(end / barSec) * barSec;
      if (snapped > start + barSec * 0.5 && snapped < buildEnd - barSec * 0.5) end = snapped;
    }
    bounds.push([round2(start), round2(end)]);
    start = end;
  }
  if (hasAftermath) bounds.push([round2(buildEnd), round2(durationSec)]);
  return bounds;
}

/** Snap a loop length to whole bars, staying inside the allowed range. */
export function snapLoopLength(durationSec: number, barSec: number): number {
  let bars = Math.max(2, Math.round(durationSec / barSec));
  while (bars * barSec > MAX_DURATION_SEC) bars--;
  while (bars * barSec < MIN_DURATION_SEC) bars++;
  return round2(bars * barSec);
}

function sectionCount(durationSec: number): number {
  if (durationSec < 20) return 2;
  if (durationSec < 45) return 3;
  if (durationSec < 100) return 4;
  return 5;
}

function describePlan(plan: Omit<ScorePlan, 'directorNotes'>, reading: SceneReading | undefined, profile: MoodProfile): string {
  const lines: string[] = [];
  const root = plan.key.root;
  const flat2 = midiToName(degreeToMidi(root, plan.key.mode, 1, 4)).replace(/-?\d+$/, '');
  lines.push(
    `${profile.label}: ${root} ${MODE_LABELS[plan.key.mode]} at ${plan.tempoBpm} BPM in ${plan.beatsPerBar}/4, ${formatTime(plan.durationSec)} long.`,
  );
  if (plan.key.mode === 'phrygian' || plan.key.mode === 'locrian' || plan.key.mode === 'phrygianDominant') {
    lines.push(`The second note of the scale (${flat2}) sits a half step above the root, so the drone never feels safe.`);
  } else if (plan.key.mode === 'diminished') {
    lines.push('The octatonic scale stacks diminished chords: every chord leads somewhere worse.');
  } else if (plan.key.mode === 'wholeTone') {
    lines.push('A whole-tone scale has no half steps and no home key, so the melody floats like a bad dream.');
  } else {
    lines.push('Minor harmony with a raised seventh gives it a gothic, music-box sadness.');
  }
  const firstPulse = plan.sections.find((s) => s.layers.includes('pulse'));
  if (firstPulse) lines.push(`The heartbeat enters at ${formatTime(firstPulse.startSec)}.`);
  for (const cue of plan.cues) {
    if (cue.kind === 'sting') lines.push(`Sting at ${formatTime(cue.atSec)}: a tritone brass cluster over a falling boom.`);
    if (cue.kind === 'silence') lines.push(`Everything drops out at ${formatTime(cue.atSec)}, so the sting lands in silence.`);
    if (cue.kind === 'riser') lines.push(`A scraping riser climbs for ${cue.lengthSec ?? 4} seconds before ${formatTime(cue.atSec)}.`);
    if (cue.kind === 'hit') lines.push(`A hit lands at ${formatTime(cue.atSec)}.`);
  }
  if (plan.loop) lines.push(`Built as a seamless ${Math.round(plan.durationSec / ((60 / plan.tempoBpm) * plan.beatsPerBar))}-bar loop: tails wrap to the start, so it can repeat forever in a game.`);
  if (reading?.mood) lines.push(`Read "${plan.mood}" from the scene description.`);
  return lines.join(' ');
}

function pickTempo(profile: MoodProfile, rng: Rng): number {
  return rng.int(profile.tempoBpm[0], profile.tempoBpm[1]);
}

/** Add the silence and riser cues that make a sting land, plus the sting itself. */
export function stingCues(atSec: number, durationSec: number): Cue[] {
  const cues: Cue[] = [];
  if (atSec >= 4) cues.push({ atSec: round2(atSec), kind: 'riser', lengthSec: round2(Math.min(6, atSec * 0.4)) });
  if (atSec >= 3) cues.push({ atSec: round2(atSec - 0.6), kind: 'silence', lengthSec: 0.6 });
  cues.push({ atSec: round2(Math.min(atSec, durationSec)), kind: 'sting', label: 'Sting' });
  return cues;
}

/**
 * The local director: a rule-based reading of the request plus seeded choices.
 * Returns a validated ScorePlan.
 */
export function composePlan(request: CueRequest): ScorePlan {
  const rng = createRng(request.seed).fork('director');
  const reading = request.scene ? readScene(request.scene) : undefined;
  const mood: Mood = request.mood ?? reading?.mood ?? 'dread';
  const profile = MOOD_PROFILES[mood];

  const requestedSec = round2(
    clamp(request.durationSec ?? reading?.durationSec ?? profile.defaultDurationSec, MIN_DURATION_SEC, MAX_DURATION_SEC),
  );
  const loop = request.loop === true;
  const shape: Shape = loop ? 'steady' : reading && reading.shape !== 'steady' ? reading.shape : profile.defaultShape;
  const tempoBpm = pickTempo(profile, rng);
  const beatsPerBar = rng.pick(profile.beatsPerBar);
  const barSec = (60 / tempoBpm) * beatsPerBar;
  const durationSec = loop ? snapLoopLength(requestedSec, barSec) : requestedSec;
  const mode = rng.weighted(
    profile.modes.map((m) => m.mode),
    profile.modes.map((m) => m.weight),
  );
  const root: NoteName = rng.pick(profile.roots);

  let stings = (request.stingAtSec ?? reading?.stingAtSec ?? []).filter((t) => t > 0 && t <= durationSec - 0.25);
  if (stings.length === 0 && reading?.wantsJumpScare && !loop) {
    stings = [round2(Math.max(2, Math.round((durationSec * 0.8) / barSec) * barSec))];
  }
  stings = [...new Set(stings.map(round2))].sort((a, b) => a - b);

  const bounds = sectionBounds(durationSec, stings, barSec, sectionCount(durationSec));
  const lastSting = stings.at(-1);
  const hasAftermath = lastSting !== undefined && durationSec - lastSting >= 3;
  const curve = intensityCurve(shape, hasAftermath ? bounds.length - 1 : bounds.length, profile, rng);
  if (hasAftermath) curve.push(0.28);

  const names = SECTION_NAMES[mood];
  const sections: Section[] = bounds.map(([startSec, endSec], i) => {
    const isAftermath = hasAftermath && i === bounds.length - 1;
    const pool = isAftermath ? ['Aftermath', 'What Remains', 'Silence After'] : names[Math.min(names.length - 1, Math.floor((i / bounds.length) * names.length))];
    return {
      name: rng.pick(pool),
      startSec,
      endSec,
      intensity: curve[i],
      layers: layersFor(profile, curve[i]),
    };
  });

  const cues: Cue[] = [];
  for (const s of stings) cues.push(...stingCues(s, durationSec));
  for (const h of reading?.hitAtSec ?? []) {
    if (h > 0 && h < durationSec) cues.push({ atSec: round2(h), kind: 'hit', label: 'Hit' });
  }
  cues.sort((a, b) => a.atSec - b.atSec);

  const plan: Omit<ScorePlan, 'directorNotes'> = {
    version: 1,
    title: chooseTitle(createRng(request.seed).fork(`title:${mood}:${request.scene ?? ''}`), reading),
    mood,
    ...(request.scene ? { scene: request.scene.slice(0, 500) } : {}),
    durationSec,
    tempoBpm,
    beatsPerBar,
    key: { root, mode },
    sections,
    motif: composeMotif(profile, rng),
    cues,
    palette: { ...profile.palette },
    ...(loop ? { loop: true } : {}),
  };
  return parseScorePlan({ ...plan, directorNotes: describePlan(plan, reading, profile) });
}

/**
 * Force a plan from any director (local or AI) to honor the request's hard constraints:
 * the requested length and every requested sting time.
 */
export function reconcilePlan(plan: ScorePlan, request: CueRequest): ScorePlan {
  let durationSec = request.durationSec ? round2(clamp(request.durationSec, MIN_DURATION_SEC, MAX_DURATION_SEC)) : plan.durationSec;
  const loop = plan.loop === true || request.loop === true;
  if (loop) durationSec = snapLoopLength(durationSec, (60 / plan.tempoBpm) * plan.beatsPerBar);
  const scale = durationSec / plan.durationSec;
  let sections = plan.sections.map((s) => ({ ...s, startSec: round2(s.startSec * scale), endSec: round2(s.endSec * scale) }));
  if (sections.length > 0) sections[sections.length - 1].endSec = durationSec;
  sections = sections.filter((s) => s.endSec > s.startSec);
  let cues = plan.cues.map((c) => ({ ...c, atSec: round2(Math.min(c.atSec * scale, durationSec)) }));
  const requested = (request.stingAtSec ?? []).filter((t) => t > 0 && t <= durationSec - 0.25);
  if (requested.length > 0) {
    cues = cues.filter((c) => c.kind === 'hit');
    for (const s of requested) cues.push(...stingCues(s, durationSec));
    cues.sort((a, b) => a.atSec - b.atSec);
  }
  return parseScorePlan({ ...plan, durationSec, sections, cues, ...(loop ? { loop: true } : {}) });
}

