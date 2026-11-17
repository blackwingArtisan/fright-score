/** Pitch, scale and mode helpers. */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

export const MODES = {
  /** Flat second against the root: the sound of dread. */
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  /** Flat second and flat fifth: no stable chord anywhere. */
  locrian: [0, 1, 3, 5, 6, 8, 10],
  /** Raised seventh: gothic, operatic, a little Transylvanian. */
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  /** Natural minor: sad rather than scary. */
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  /** Major third over a flat second: incantations and desert temples. */
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  /** Octatonic half-whole scale: stacked diminished chords, no way out. */
  diminished: [0, 1, 3, 4, 6, 7, 9, 10],
  /** No half steps at all: dreamlike and unmoored. */
  wholeTone: [0, 2, 4, 6, 8, 10],
} as const;

export type ModeName = keyof typeof MODES;
export const MODE_NAMES = Object.keys(MODES) as ModeName[];

export const MODE_LABELS: Record<ModeName, string> = {
  phrygian: 'Phrygian',
  locrian: 'Locrian',
  harmonicMinor: 'harmonic minor',
  aeolian: 'Aeolian',
  phrygianDominant: 'Phrygian dominant',
  diminished: 'diminished (octatonic)',
  wholeTone: 'whole-tone',
};

export function pitchClass(name: NoteName): number {
  return NOTE_NAMES.indexOf(name);
}

/**
 * MIDI note for a scale degree. Degree 0 is the root in `octave` (MIDI octave numbering, C4 = 60).
 * Degrees wrap into higher or lower octaves, so degree 7 in a 7-note mode is the root an octave up.
 */
export function degreeToMidi(root: NoteName, mode: ModeName, degree: number, octave: number): number {
  const steps = MODES[mode];
  const n = steps.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return 12 * (octave + 1) + pitchClass(root) + steps[idx] + 12 * oct;
}

export function midiToName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${Math.floor(midi / 12) - 1}`;
}

/** Root MIDI note in a given octave. */
export function rootMidi(root: NoteName, octave: number): number {
  return 12 * (octave + 1) + pitchClass(root);
}

/** Format seconds as m:ss.s for cue sheets. */
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const whole = Math.floor(s);
  const tenth = Math.round((s - whole) * 10);
  const ss = tenth === 10 ? `${String(whole + 1).padStart(2, '0')}.0` : `${String(whole).padStart(2, '0')}.${tenth}`;
  return `${m}:${ss}`;
}
