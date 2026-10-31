import { z } from 'zod';
import { COLLECTIONS } from './types';

/** Everything crossing a trust boundary (imports, share codes, other people's data) is parsed here. */
const num = (lo: number, hi: number) => z.number().min(lo).max(hi);
const text = (max: number) => z.string().max(max);

export const setSchema = z.object({
  id: text(80), type: z.enum(['warmup', 'normal', 'drop', 'failure']), kg: num(0, 1500).optional(), reps: num(0, 2000).optional(),
  seconds: num(0, 86400).optional(), meters: num(0, 1_000_000).optional(), rpe: num(1, 10).optional(), done: z.boolean(), doneAt: z.number().optional(),
});
export const workoutExerciseSchema = z.object({
  id: text(80), exerciseId: text(120), notes: text(4000).optional(), groupId: text(80).optional(), groupType: z.enum(['superset', 'circuit']).optional(),
  restSec: num(0, 3600).optional(), targetRepsMin: num(0, 2000).optional(), targetRepsMax: num(0, 2000).optional(), sets: z.array(setSchema).max(200),
});
export const workoutSchema = z.object({
  id: text(80), name: text(120), routineId: text(80).optional(), startedAt: z.number(), completedAt: z.number(), notes: text(8000).optional(),
  exercises: z.array(workoutExerciseSchema).max(100), updatedAt: z.number(),
  legacy: z.object({ volumeKg: z.number(), completedSets: z.number(), xpEarned: z.number(), newPRs: z.array(z.object({ name: z.string(), kg: z.number(), reps: z.number(), e1rmKg: z.number() })) }).optional(),
});
const routineSetSchema = z.object({
  type: z.enum(['warmup', 'normal', 'drop', 'failure']), repsMin: num(0, 2000).optional(), repsMax: num(0, 2000).optional(), kg: num(0, 1500).optional(),
  seconds: num(0, 86400).optional(), meters: num(0, 1_000_000).optional(), rpe: num(1, 10).optional(),
});
export const routineSchema = z.object({
  id: text(80), name: text(120), folderId: text(80).optional(), notes: text(4000).optional(), days: z.array(num(0, 6)).max(7), updatedAt: z.number(),
  exercises: z.array(z.object({ id: text(80), exerciseId: text(120), notes: text(4000).optional(), groupId: text(80).optional(), groupType: z.enum(['superset', 'circuit']).optional(), restSec: num(0, 3600).optional(), sets: z.array(routineSetSchema).max(100) })).max(100),
});
const muscle = z.string().max(30);
export const exerciseSchema = z.object({
  id: text(120), name: text(120), primary: z.array(muscle).max(20), secondary: z.array(muscle).max(20), equipment: text(30), category: text(30),
  mode: z.enum(['strength', 'bodyweight', 'timed', 'cardio']), steps: z.array(text(1000)).max(30), form: z.array(text(1000)).max(30), custom: z.boolean().optional(), updatedAt: z.number().optional(),
});

/** Shared routines also carry names for any custom exercises they use, so they still make sense elsewhere. */
export const sharePayloadSchema = z.object({
  v: z.literal(1), routine: routineSchema, exercises: z.array(exerciseSchema).max(100),
});

export const backupSchema = z.object({
  app: z.literal('iron-quest'), version: z.number().int().min(1).max(1),
  exportedAt: z.number(),
  data: z.record(z.enum(COLLECTIONS as [string, ...string[]]), z.array(z.object({ id: z.string() }).loose())),
  tombstones: z.array(z.object({ collection: z.string(), id: z.string(), updatedAt: z.number() })).optional(),
  photos: z.array(z.object({ id: z.string(), dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/) })).optional(),
});
export type Backup = z.infer<typeof backupSchema>;

/** Per-collection validators for imports; loose ones still require id + updatedAt. */
export const importValidators: Record<string, z.ZodTypeAny> = {
  workouts: workoutSchema, routines: routineSchema, exercises: exerciseSchema,
};
