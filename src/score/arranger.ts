import type { PatchId } from '../engine/patches';
import { MOOD_PROFILES } from './moods';
import { createRng, type Rng } from './rng';
import { parseScore, type Mood, type Note, type Role, type Score, type ScorePlan, type Section, type Track } from './schema';
import { degreeToMidi, rootMidi, type ModeName, type NoteName } from './theory';

/**
 * The arranger realizes a ScorePlan into notes. It is deterministic: the same plan and seed
 * always give the same Score. Each role draws from its own forked generator, so changing one
 * layer never reshuffles the others.
 */

interface Ctx {
  plan: ScorePlan;
  root: NoteName;
  mode: ModeName;
  mood: Mood;
  beatSec: number;
  barSec: number;
  risers: { startSec: number; endSec: number }[];
  silences: { startSec: number; endSec: number }[];
}

interface TrackDefaults {
  gainDb: number;
  pan: number;
  reverb: number;
}

const TRACK_DEFAULTS: Record<Role, TrackDefaults> = {
  drone: { gainDb: -4, pan: 0, reverb: 0.45 },
  pulse: { gainDb: -1, pan: 0, reverb: 0.15 },
  bass: { gainDb: -5, pan: 0, reverb: 0.12 },
  motif: { gainDb: -6, pan: 0.22, reverb: 0.55 },
  texture: { gainDb: -12, pan: 0, reverb: 0.7 },
  choir: { gainDb: -9, pan: -0.2, reverb: 0.6 },
  percussion: { gainDb: -3, pan: -0.1, reverb: 0.25 },
  stinger: { gainDb: 0, pan: 0, reverb: 0.5 },
};

/** Per-mood mix trims in dB, so the lead layer of each mood sits on top. */
const MOOD_TRIM_DB: Record<Mood, Partial<Record<Role, number>>> = {
  dread: {},
  stalker: { pulse: 1 },
  chase: { drone: -4, choir: -2 },
  lullaby: { drone: -8, choir: -3, motif: 4 },
  ritual: { percussion: 1, choir: 1 },
};

/** Octave (MIDI numbering) where each patch sounds best. */
const PATCH_OCTAVE: Record<PatchId, number> = {
  'grave-drone': 2,
  'wraith-pad': 4,
  heartbeat: 2,
  'tritone-brass': 4,
  'music-box': 5,
  'glass-bell': 5,
  'crypt-bass': 2,
  screech: 5,
  'ritual-drum': 2,
  'choir-organ': 3,
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function note(atSec: number, durSec: number, midi: number, velocity: number, extra: Partial<Note> = {}): Note {
  return {
    atSec: r3(Math.max(0, atSec)),
    durSec: r3(Math.max(0.01, durSec)),
    midi: Math.max(0, Math.min(127, Math.round(midi))),
    velocity: r3(Math.max(0.05, Math.min(1, velocity))),
    ...extra,
  };
}

function sectionsWith(plan: ScorePlan, role: Role): Section[] {
  return plan.sections.filter((s) => s.layers.includes(role));
}

interface Span {
  startSec: number;
  endSec: number;
  intensity: number;
  parts: Section[];
}

/**
 * Merge touching sections into continuous spans so long drones do not re-attack,
 * but break them at silence windows so the drone comes back after a sting.
 */
function spans(sections: Section[], silences: { startSec: number; endSec: number }[]): Span[] {
  const merged: Span[] = [];
  for (const s of sections) {
    const last = merged.at(-1);
    if (last && Math.abs(last.endSec - s.startSec) < 0.01) {
      last.endSec = s.endSec;
      last.intensity = Math.max(last.intensity, s.intensity);
      last.parts.push(s);
    } else merged.push({ startSec: s.startSec, endSec: s.endSec, intensity: s.intensity, parts: [s] });
  }
  const out: Span[] = [];
  for (const span of merged) {
    let pieces: Span[] = [span];
    for (const w of silences) {
      pieces = pieces.flatMap((p) => {
        if (w.endSec <= p.startSec || w.startSec >= p.endSec) return [p];
        const result: Span[] = [];
        const clip = (a: number, b: number) =>
          p.parts
            .filter((x) => x.endSec > a && x.startSec < b)
            .map((x) => ({ ...x, startSec: Math.max(x.startSec, a), endSec: Math.min(x.endSec, b) }));
        if (w.startSec - p.startSec > 0.5) {
          const parts = clip(p.startSec, w.startSec);
          result.push({ startSec: p.startSec, endSec: w.startSec, intensity: Math.max(...parts.map((x) => x.intensity)), parts });
        }
        if (p.endSec - w.endSec > 0.5) {
          const parts = clip(w.endSec, p.endSec);
          result.push({ startSec: w.endSec, endSec: p.endSec, intensity: Math.max(...parts.map((x) => x.intensity)), parts });
        }
        return result;
      });
    }
    out.push(...pieces);
  }
  return out;
}

function deg(ctx: Ctx, degree: number, octave: number): number {
  return degreeToMidi(ctx.root, ctx.mode, degree, octave);
}

function drone(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  for (const span of spans(sectionsWith(ctx.plan, 'drone'), ctx.silences)) {
    const len = span.endSec - span.startSec;
    notes.push(note(span.startSec, len + 0.2, rootMidi(ctx.root, octave), 0.55 + 0.35 * span.intensity));
    notes.push(note(span.startSec + 0.4, len, rootMidi(ctx.root, octave + 1), 0.3 + 0.2 * span.intensity, { pan: -0.35 }));
    for (const part of span.parts) {
      if (part.intensity < 0.35) continue;
      // Upper voice moves slowly: fifth, flat sixth, fifth, flat second.
      const path = part.intensity >= 0.5 ? [4, 5, 4, 1] : [4];
      const chunk = ctx.barSec * 2;
      let i = 0;
      for (let t = part.startSec; t < part.endSec - 0.5; t += chunk, i++) {
        const dur = Math.min(chunk, part.endSec - t) + 0.3;
        notes.push(note(t, dur, deg(ctx, path[i % path.length], octave + 1), 0.25 + 0.3 * part.intensity, { pan: 0.35 }));
      }
      if (part.intensity >= 0.7) {
        notes.push(note(part.startSec + 0.2, part.endSec - part.startSec, deg(ctx, 1, octave + 2), 0.2 + 0.2 * part.intensity, { pan: rng.range(-0.5, 0.5) }));
      }
    }
  }
  return notes;
}

function riserFactor(ctx: Ctx, t: number): number {
  for (const r of ctx.risers) {
    if (t >= r.startSec && t < r.endSec) return 1 - 0.5 * ((t - r.startSec) / (r.endSec - r.startSec));
  }
  return 1;
}

function pulse(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  const midi = rootMidi(ctx.root, octave);
  const single = ctx.mood === 'chase' || ctx.plan.tempoBpm > 120;
  for (const s of sectionsWith(ctx.plan, 'pulse')) {
    let t = s.startSec;
    while (t < s.endSec - 0.05) {
      const v = 0.6 + 0.4 * s.intensity;
      notes.push(note(t, 0.18, midi, v, { bendSemis: -5, bendSec: 0.12 }));
      if (!single) {
        const dub = Math.min(0.24, ctx.beatSec * 0.3);
        notes.push(note(t + dub, 0.16, midi - 2, v * 0.72, { bendSemis: -5, bendSec: 0.1 }));
      }
      // The heart races during a riser.
      t += ctx.beatSec * riserFactor(ctx, t) * (rng.chance(0.08) ? 1.04 : 1);
    }
  }
  return notes;
}

function bass(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  for (const s of sectionsWith(ctx.plan, 'bass')) {
    const b = ctx.beatSec;
    if (ctx.mood === 'chase') {
      const pattern = rng.pick([
        [0, 0, 1, 0, 0, 0, 1, 2],
        [0, 0, 0, 1, 0, 0, 3, 1],
        [0, 1, 0, 0, 1, 0, 4, 1],
      ]);
      let i = 0;
      for (let t = s.startSec; t < s.endSec - 0.05; t += b / 2, i++) {
        notes.push(note(t, b * 0.42, deg(ctx, pattern[i % pattern.length], octave), i % 2 === 0 ? 0.95 : 0.7));
      }
    } else if (ctx.mood === 'lullaby') {
      for (let t = s.startSec; t < s.endSec - 0.05; t += ctx.barSec) notes.push(note(t, ctx.barSec * 0.9, deg(ctx, 0, octave), 0.6));
    } else if (ctx.mood === 'ritual') {
      let i = 0;
      for (let t = s.startSec; t < s.endSec - 0.05; t += b, i++) {
        if (i % ctx.plan.beatsPerBar === 0) notes.push(note(t, b * 1.6, deg(ctx, 0, octave), 0.9));
        else if (i % ctx.plan.beatsPerBar === 2) notes.push(note(t, b * 0.8, deg(ctx, 4, octave), 0.6));
      }
    } else {
      // The two-note shark figure: root and flat second, faster as intensity climbs.
      const step = s.intensity >= 0.85 ? b / 2 : b;
      let i = 0;
      for (let t = s.startSec; t < s.endSec - 0.05; t += step * riserFactor(ctx, t), i++) {
        notes.push(note(t, step * 0.8, deg(ctx, i % 2 === 0 ? 0 : 1, octave), i % 2 === 0 ? 0.85 : 0.65));
      }
    }
  }
  return notes;
}

function motif(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  const { degrees, rhythmBeats } = ctx.plan.motif;
  const phraseBeats = rhythmBeats.reduce((a, b) => a + b, 0);
  for (const s of sectionsWith(ctx.plan, 'motif')) {
    const gapBars = s.intensity < 0.4 ? 4 : s.intensity < 0.7 ? 2 : 1;
    const phraseSec = phraseBeats * ctx.beatSec;
    const every = Math.max(phraseSec + ctx.beatSec, gapBars * ctx.barSec);
    let t = s.startSec + (s.intensity < 0.4 ? ctx.barSec : 0);
    while (t + Math.min(phraseSec, ctx.barSec) <= s.endSec) {
      const transpose = rng.weighted([0, 1, -2, 4, 2], [5, 2, 1, 1, 1]);
      const invert = rng.chance(0.18);
      const fragment = rng.chance(0.2) && degrees.length >= 4;
      const count = fragment ? Math.ceil(degrees.length / 2) : degrees.length;
      let at = t;
      for (let i = 0; i < count; i++) {
        const d = (invert ? -degrees[i] : degrees[i]) + transpose;
        const dur = rhythmBeats[i] * ctx.beatSec;
        if (at >= s.endSec) break;
        const v = 0.55 + 0.35 * s.intensity - (i % 2) * 0.08;
        const extra: Partial<Note> = {};
        // Warped tape: the lullaby sometimes sags out of tune.
        if (ctx.mood === 'lullaby' && rng.chance(0.22)) Object.assign(extra, { bendSemis: -0.45, bendSec: Math.max(0.2, dur) });
        notes.push(note(at, Math.min(dur * 0.92, s.endSec - at), deg(ctx, d, octave), v, extra));
        if (s.intensity >= 0.6 && ctx.mood !== 'chase') {
          notes.push(note(at + 0.012, Math.min(dur * 0.9, s.endSec - at), deg(ctx, d, octave) + 12, v * 0.45, { pan: -0.4 }));
        }
        at += dur;
      }
      t += every;
    }
  }
  return notes;
}

function texture(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  for (const s of sectionsWith(ctx.plan, 'texture')) {
    for (let t = s.startSec; t < s.endSec - 1; t += ctx.barSec) {
      if (!rng.chance(0.2 + 0.45 * s.intensity)) continue;
      const len = Math.min(ctx.barSec * rng.int(1, 3), s.endSec - t);
      const base = deg(ctx, rng.pick([0, 1, 3, 4, 5]), octave);
      const interval = rng.weighted([1, 6, 11], [3, 2, 1]);
      const pan = rng.range(-0.75, 0.75);
      const bend = rng.chance(0.3) ? { bendSemis: rng.pick([-1, 1, -2]), bendSec: len } : {};
      notes.push(note(t + rng.range(0, ctx.beatSec), len, base, 0.35 + 0.3 * s.intensity, { pan, ...bend }));
      notes.push(note(t + rng.range(0, ctx.beatSec), len, base + interval, 0.25 + 0.3 * s.intensity, { pan: -pan }));
    }
  }
  return notes;
}

function choir(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  const progressions: Record<Mood, number[][]> = {
    dread: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [-1, 1, 3]],
    stalker: [[0, 2, 4], [1, 3, 5], [-2, 0, 2], [1, 3, 5]],
    chase: [[0, 2, 4], [5, 7, 9], [1, 3, 5], [4, 6, 8]],
    lullaby: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    ritual: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10]],
  };
  const prog = progressions[ctx.mood];
  for (const s of sectionsWith(ctx.plan, 'choir')) {
    const chordLen = s.intensity >= 0.75 ? ctx.barSec : ctx.barSec * 2;
    let i = rng.int(0, 1) * 2;
    for (let t = s.startSec; t < s.endSec - 0.5; t += chordLen, i++) {
      const dur = Math.min(chordLen, s.endSec - t) + 0.25;
      prog[i % prog.length].forEach((d, k) => {
        notes.push(note(t + k * 0.03, dur, deg(ctx, d, octave), 0.45 + 0.3 * s.intensity, { pan: (k - 1) * 0.4 }));
      });
    }
  }
  return notes;
}

function percussion(ctx: Ctx, rng: Rng, octave: number): Note[] {
  const notes: Note[] = [];
  const steps = ctx.plan.beatsPerBar * 2;
  const patterns: Record<Mood, number[][]> = {
    ritual: [
      [1, 0, 0, 0.6, 0, 0.8, 0, 0, 0.7, 0],
      [1, 0, 0.5, 0, 0.8, 0, 0, 0.6, 0.7, 0.5],
    ],
    chase: [
      [1, 0, 0.6, 0.6, 1, 0, 0.6, 0.8],
      [1, 0.5, 0, 0.7, 1, 0.5, 0.7, 0.7],
    ],
    dread: [[1, 0, 0, 0, 0, 0, 0.6, 0]],
    stalker: [[1, 0, 0, 0, 0.7, 0, 0, 0]],
    lullaby: [[1, 0, 0, 0, 0, 0]],
  };
  for (const s of sectionsWith(ctx.plan, 'percussion')) {
    const pattern = rng.pick(patterns[ctx.mood]);
    const stepSec = ctx.beatSec / 2;
    let i = 0;
    for (let t = s.startSec; t < s.endSec - 0.05; t += stepSec, i++) {
      const pos = i % steps;
      let v = pattern[pos % pattern.length] ?? 0;
      const lastBar = t >= s.endSec - ctx.barSec;
      if (lastBar && s.intensity >= 0.75 && v === 0) v = 0.5; // fill into the next section
      if (v <= 0) continue;
      const pitch = rootMidi(ctx.root, octave) + (pos === 0 ? 0 : rng.pick([0, 3, 7]));
      notes.push(note(t, 0.3, pitch, v * (0.7 + 0.3 * s.intensity), { bendSemis: -4, bendSec: 0.2, pan: rng.range(-0.2, 0.2) }));
    }
  }
  return notes;
}

/** Drop or cut notes that overlap a silence window. */
function applySilence(notes: Note[], windows: { startSec: number; endSec: number }[]): Note[] {
  const out: Note[] = [];
  for (const n of notes) {
    let keep: Note | undefined = n;
    for (const w of windows) {
      if (!keep) break;
      const end = keep.atSec + keep.durSec;
      if (keep.atSec >= w.startSec && keep.atSec < w.endSec - 1e-6) keep = undefined;
      else if (keep.atSec < w.startSec && end > w.startSec) {
        const dur: number = w.startSec - keep.atSec;
        keep = dur < 0.03 ? undefined : { ...keep, durSec: r3(dur), choke: true };
      }
    }
    if (keep) out.push(keep);
  }
  return out;
}

function clipToDuration(notes: Note[], durationSec: number): Note[] {
  return notes
    .filter((n) => n.atSec < durationSec - 0.05)
    .map((n) => (n.atSec + n.durSec > durationSec ? { ...n, durSec: r3(durationSec - n.atSec) } : n))
    .sort((a, b) => a.atSec - b.atSec || a.midi - b.midi);
}

export function arrange(plan: ScorePlan, seed: number): Score {
  const rng = createRng(seed).fork('arranger');
  const beatSec = 60 / plan.tempoBpm;
  const profile = MOOD_PROFILES[plan.mood];
  const silences = plan.cues
    .filter((c) => c.kind === 'silence')
    .map((c) => ({ startSec: c.atSec, endSec: r3(c.atSec + (c.lengthSec ?? 0.6)) }));
  const ctx: Ctx = {
    plan,
    root: plan.key.root,
    mode: plan.key.mode,
    mood: plan.mood,
    beatSec,
    barSec: beatSec * plan.beatsPerBar,
    risers: plan.cues
      .filter((c) => c.kind === 'riser')
      .map((c) => ({ startSec: Math.max(0, c.atSec - (c.lengthSec ?? 4)), endSec: c.atSec })),
    silences,
  };

  const patchFor = (role: Role): PatchId => plan.palette[role] ?? profile.palette[role];
  const generators: Partial<Record<Role, (ctx: Ctx, rng: Rng, octave: number) => Note[]>> = {
    drone,
    pulse,
    bass,
    motif,
    texture,
    choir,
    percussion,
  };

  const tracks: Track[] = [];
  for (const role of ['drone', 'choir', 'bass', 'pulse', 'percussion', 'motif', 'texture'] as const) {
    const gen = generators[role];
    if (!gen || sectionsWith(plan, role).length === 0) continue;
    const patchId = patchFor(role);
    const notes = clipToDuration(applySilence(gen(ctx, rng.fork(role), PATCH_OCTAVE[patchId]), silences), plan.durationSec);
    if (notes.length === 0) continue;
    const defaults = TRACK_DEFAULTS[role];
    const gainDb = defaults.gainDb + (MOOD_TRIM_DB[plan.mood][role] ?? 0);
    tracks.push({ id: role, role, patchId, ...defaults, gainDb, notes });
  }

  // Cue tracks: risers, stings and hits.
  const riserNotes: Note[] = [];
  const stingNotes: Note[] = [];
  const boomNotes: Note[] = [];
  const cueRng = rng.fork('cues');
  for (const cue of plan.cues) {
    if (cue.kind === 'riser') {
      const len = cue.lengthSec ?? 4;
      const start = Math.max(0, cue.atSec - len);
      const base = deg(ctx, cueRng.pick([0, 1]), 4);
      riserNotes.push(note(start, len, base, 0.75, { bendSemis: 12, bendSec: len, pan: -0.3 }));
      riserNotes.push(note(start + 0.15, len - 0.15, base + 1, 0.6, { bendSemis: 13, bendSec: len, pan: 0.3 }));
    } else if (cue.kind === 'sting') {
      const r = rootMidi(ctx.root, 3);
      for (const [i, interval] of [0, 1, 6, 13, 18].entries()) {
        stingNotes.push(note(cue.atSec, 1.8, r + interval, 1 - i * 0.05, { pan: (i - 2) * 0.3 }));
      }
      boomNotes.push(note(cue.atSec, 1.2, rootMidi(ctx.root, 2), 1, { bendSemis: -12, bendSec: 0.6 }));
    } else if (cue.kind === 'hit') {
      const r = rootMidi(ctx.root, 3);
      stingNotes.push(note(cue.atSec, 0.7, r, 0.85), note(cue.atSec, 0.7, r + 6, 0.8));
      boomNotes.push(note(cue.atSec, 0.8, rootMidi(ctx.root, 2), 0.9, { bendSemis: -7, bendSec: 0.4 }));
    }
  }
  const riserClean = clipToDuration(applySilence(riserNotes, silences), plan.durationSec);
  if (riserClean.length > 0) {
    tracks.push({ id: 'riser', role: 'texture', patchId: 'screech', gainDb: -6, pan: 0, reverb: 0.5, notes: riserClean });
  }
  if (stingNotes.length > 0) {
    tracks.push({ id: 'stinger', role: 'stinger', patchId: patchFor('stinger'), ...TRACK_DEFAULTS.stinger, notes: clipToDuration(stingNotes, plan.durationSec) });
    tracks.push({ id: 'boom', role: 'stinger', patchId: 'ritual-drum', gainDb: 0, pan: 0, reverb: 0.35, notes: clipToDuration(boomNotes, plan.durationSec) });
  }

  return parseScore({ version: 1, seed: seed >>> 0, sampleRate: 44_100, durationSec: plan.durationSec, plan, tracks });
}
