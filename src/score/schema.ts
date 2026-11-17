import { z } from 'zod';
import { PATCH_IDS } from '../engine/patches';
import { MODE_NAMES, NOTE_NAMES, type ModeName } from './theory';

export const MOODS = ['dread', 'stalker', 'chase', 'lullaby', 'ritual'] as const;
export type Mood = (typeof MOODS)[number];

export const ROLES = ['drone', 'pulse', 'bass', 'motif', 'texture', 'choir', 'percussion', 'stinger'] as const;
export type Role = (typeof ROLES)[number];

export const CUE_KINDS = ['sting', 'hit', 'riser', 'silence'] as const;
export type CueKind = (typeof CUE_KINDS)[number];

export const MIN_DURATION_SEC = 5;
export const MAX_DURATION_SEC = 300;

const MoodSchema = z.enum(MOODS);
const RoleSchema = z.enum(ROLES);
const PatchIdSchema = z.enum(PATCH_IDS);
const ModeSchema = z.enum(MODE_NAMES as [ModeName, ...ModeName[]]);
const NoteNameSchema = z.enum(NOTE_NAMES);

export const SectionSchema = z.object({
  name: z.string().min(1).max(60),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  intensity: z.number().min(0).max(1),
  layers: z.array(RoleSchema).max(ROLES.length),
});

export const CueSchema = z.object({
  atSec: z.number().min(0),
  kind: z.enum(CUE_KINDS),
  label: z.string().max(60).optional(),
  /** For risers: how long the build lasts before atSec. For silence: how long the gap lasts. */
  lengthSec: z.number().positive().max(30).optional(),
});

export const MotifSchema = z
  .object({
    /** Scale degrees relative to the root (0 = root, negative = below). */
    degrees: z.array(z.number().int().min(-14).max(21)).min(2).max(16),
    /** Duration of each motif note in beats. */
    rhythmBeats: z.array(z.number().positive().max(8)).min(2).max(16),
  })
  .refine((m) => m.degrees.length === m.rhythmBeats.length, {
    message: 'motif.degrees and motif.rhythmBeats must have the same length',
  });

/** What a director produces: the musical plan, before any notes are written. */
export const ScorePlanSchema = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(80),
    mood: MoodSchema,
    scene: z.string().max(500).optional(),
    durationSec: z.number().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC),
    tempoBpm: z.number().min(30).max(220),
    beatsPerBar: z.number().int().min(2).max(7),
    key: z.object({ root: NoteNameSchema, mode: ModeSchema }),
    sections: z.array(SectionSchema).min(1).max(12),
    motif: MotifSchema,
    cues: z.array(CueSchema).max(16),
    palette: z.partialRecord(RoleSchema, PatchIdSchema),
    directorNotes: z.string().max(1200).optional(),
  })
  .superRefine((plan, ctx) => {
    plan.sections.forEach((s, i) => {
      if (s.endSec <= s.startSec) {
        ctx.addIssue({ code: 'custom', path: ['sections', i], message: 'section ends before it starts' });
      }
      if (s.endSec > plan.durationSec + 0.001) {
        ctx.addIssue({ code: 'custom', path: ['sections', i], message: 'section runs past durationSec' });
      }
    });
    plan.cues.forEach((c, i) => {
      if (c.atSec > plan.durationSec) {
        ctx.addIssue({ code: 'custom', path: ['cues', i], message: 'cue is after the end of the score' });
      }
    });
  });

export type ScorePlan = z.infer<typeof ScorePlanSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Cue = z.infer<typeof CueSchema>;

export const NoteSchema = z.object({
  atSec: z.number().min(0),
  durSec: z.number().positive(),
  midi: z.number().int().min(0).max(127),
  velocity: z.number().min(0).max(1),
  bendSemis: z.number().min(-48).max(48).optional(),
  bendSec: z.number().positive().optional(),
  /** Per-note pan override, -1 (left) .. 1 (right). */
  pan: z.number().min(-1).max(1).optional(),
  /** Cut this note quickly at its end instead of using the patch release. */
  choke: z.boolean().optional(),
});

export const TrackSchema = z.object({
  id: z.string().min(1),
  role: RoleSchema,
  patchId: PatchIdSchema,
  gainDb: z.number().min(-60).max(12),
  pan: z.number().min(-1).max(1),
  /** Reverb send, 0..1. */
  reverb: z.number().min(0).max(1),
  notes: z.array(NoteSchema),
});

/** A fully realized score: every note of every track, ready for the chip. */
export const ScoreSchema = z.object({
  version: z.literal(1),
  seed: z.number().int().nonnegative(),
  sampleRate: z.literal(44_100),
  durationSec: z.number().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC),
  plan: ScorePlanSchema,
  tracks: z.array(TrackSchema).min(1).max(12),
});

export type Note = z.infer<typeof NoteSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Score = z.infer<typeof ScoreSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

export function parseScorePlan(input: unknown): ScorePlan {
  const result = ScorePlanSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid score plan: ${formatZodError(result.error)}`);
  return result.data;
}

export function parseScore(input: unknown): Score {
  const result = ScoreSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid score: ${formatZodError(result.error)}`);
  return result.data;
}
