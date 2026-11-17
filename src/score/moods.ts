import type { PatchId } from '../engine/patches';
import type { Mood, Role } from './schema';
import type { Shape } from './scene';
import type { ModeName, NoteName } from './theory';

/** Everything the local director knows about one mood. */
export interface MoodProfile {
  mood: Mood;
  label: string;
  tagline: string;
  tempoBpm: [number, number];
  beatsPerBar: number[];
  modes: { mode: ModeName; weight: number }[];
  roots: NoteName[];
  palette: Record<Exclude<Role, 'stinger'>, PatchId> & { stinger: PatchId };
  /** A layer plays in any section whose intensity is at or above its threshold. */
  layerThresholds: Partial<Record<Role, number>>;
  defaultDurationSec: number;
  defaultShape: Shape;
  /** Base intensity for a steady cue. */
  steadyIntensity: number;
  motifLength: [number, number];
  rhythmCells: number[][];
  /** Relative weights for motif steps of -3..+4 scale degrees. */
  stepWeights: number[];
}

export const MOOD_PROFILES: Record<Mood, MoodProfile> = {
  dread: {
    mood: 'dread',
    label: 'Creeping Dread',
    tagline: 'Slow drones, a flat second that will not resolve, a heartbeat that finds you.',
    tempoBpm: [50, 62],
    beatsPerBar: [4],
    modes: [
      { mode: 'phrygian', weight: 3 },
      { mode: 'locrian', weight: 2 },
      { mode: 'diminished', weight: 1 },
    ],
    roots: ['C', 'C#', 'D', 'D#', 'E', 'F'],
    palette: {
      drone: 'grave-drone',
      pulse: 'heartbeat',
      bass: 'crypt-bass',
      motif: 'glass-bell',
      texture: 'screech',
      choir: 'wraith-pad',
      percussion: 'ritual-drum',
      stinger: 'tritone-brass',
    },
    layerThresholds: { drone: 0, motif: 0.1, choir: 0.3, texture: 0.4, pulse: 0.45, bass: 0.65, percussion: 0.88 },
    defaultDurationSec: 60,
    defaultShape: 'build',
    steadyIntensity: 0.45,
    motifLength: [3, 5],
    rhythmCells: [[2, 1, 1, 4], [3, 1, 4], [1.5, 0.5, 2], [4, 2, 2]],
    stepWeights: [0.4, 1, 3, 0.6, 3, 1.2, 0.5, 0.6],
  },
  stalker: {
    mood: 'stalker',
    label: 'The Stalker',
    tagline: 'Something keeps pace behind you. Ticking pulse, octatonic shadows, scraping metal.',
    tempoBpm: [68, 88],
    beatsPerBar: [4],
    modes: [
      { mode: 'diminished', weight: 2 },
      { mode: 'phrygian', weight: 2 },
      { mode: 'locrian', weight: 1 },
    ],
    roots: ['D', 'E', 'F', 'F#', 'G'],
    palette: {
      drone: 'wraith-pad',
      pulse: 'heartbeat',
      bass: 'crypt-bass',
      motif: 'glass-bell',
      texture: 'screech',
      choir: 'grave-drone',
      percussion: 'ritual-drum',
      stinger: 'tritone-brass',
    },
    layerThresholds: { drone: 0, pulse: 0.2, texture: 0.3, motif: 0.35, bass: 0.5, choir: 0.7, percussion: 0.9 },
    defaultDurationSec: 60,
    defaultShape: 'build',
    steadyIntensity: 0.55,
    motifLength: [2, 4],
    rhythmCells: [[1, 3], [0.5, 0.5, 3], [2, 2], [1, 1, 2]],
    stepWeights: [0.6, 0.6, 3, 1, 3, 0.4, 1.2, 0.2],
  },
  chase: {
    mood: 'chase',
    label: 'The Chase',
    tagline: 'Run. Driving bass, pounding toms, snarling brass in harmonic minor.',
    tempoBpm: [148, 172],
    beatsPerBar: [4],
    modes: [
      { mode: 'harmonicMinor', weight: 2 },
      { mode: 'phrygian', weight: 2 },
      { mode: 'diminished', weight: 1 },
    ],
    roots: ['C', 'D', 'E', 'F', 'G', 'A'],
    palette: {
      drone: 'grave-drone',
      pulse: 'heartbeat',
      bass: 'crypt-bass',
      motif: 'tritone-brass',
      texture: 'screech',
      choir: 'choir-organ',
      percussion: 'ritual-drum',
      stinger: 'tritone-brass',
    },
    layerThresholds: { bass: 0, percussion: 0, drone: 0.2, pulse: 0.3, motif: 0.4, texture: 0.55, choir: 0.8 },
    defaultDurationSec: 45,
    defaultShape: 'steady',
    steadyIntensity: 0.78,
    motifLength: [4, 6],
    rhythmCells: [[0.5, 0.5, 0.5, 0.5], [0.75, 0.75, 0.5], [1, 0.5, 0.5], [0.5, 0.5, 1]],
    stepWeights: [0.3, 1, 2.5, 1.5, 2.5, 1, 0.8, 0.3],
  },
  lullaby: {
    mood: 'lullaby',
    label: 'Haunted Lullaby',
    tagline: 'A warped music box in three-four. Sweet, slightly out of tune, very wrong.',
    tempoBpm: [72, 90],
    beatsPerBar: [3],
    modes: [
      { mode: 'harmonicMinor', weight: 3 },
      { mode: 'aeolian', weight: 1 },
      { mode: 'wholeTone', weight: 1 },
    ],
    roots: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    palette: {
      drone: 'grave-drone',
      pulse: 'heartbeat',
      bass: 'crypt-bass',
      motif: 'music-box',
      texture: 'glass-bell',
      choir: 'wraith-pad',
      percussion: 'ritual-drum',
      stinger: 'tritone-brass',
    },
    layerThresholds: { motif: 0, drone: 0.15, choir: 0.35, texture: 0.5, pulse: 0.72, bass: 0.85 },
    defaultDurationSec: 60,
    defaultShape: 'steady',
    steadyIntensity: 0.4,
    motifLength: [5, 8],
    rhythmCells: [[1, 1, 1], [2, 1], [1, 0.5, 0.5, 1], [1.5, 0.5, 1]],
    stepWeights: [0.5, 1.5, 3, 0.8, 3, 1.5, 0.6, 0.6],
  },
  ritual: {
    mood: 'ritual',
    label: 'The Ritual',
    tagline: 'Toms in five, a chapel organ, a chant in Phrygian dominant. They are calling something up.',
    tempoBpm: [84, 102],
    beatsPerBar: [4, 5],
    modes: [
      { mode: 'phrygianDominant', weight: 3 },
      { mode: 'phrygian', weight: 1 },
    ],
    roots: ['C#', 'D', 'E', 'F', 'G'],
    palette: {
      drone: 'grave-drone',
      pulse: 'heartbeat',
      bass: 'crypt-bass',
      motif: 'choir-organ',
      texture: 'screech',
      choir: 'choir-organ',
      percussion: 'ritual-drum',
      stinger: 'tritone-brass',
    },
    layerThresholds: { percussion: 0, drone: 0, choir: 0.25, motif: 0.4, bass: 0.55, texture: 0.7, pulse: 0.9 },
    defaultDurationSec: 60,
    defaultShape: 'build',
    steadyIntensity: 0.6,
    motifLength: [4, 6],
    rhythmCells: [[1, 1, 2], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 1, 1, 1]],
    stepWeights: [0.2, 1, 3, 1.5, 3, 0.8, 0.3, 0.4],
  },
};
