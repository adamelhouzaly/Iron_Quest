import type { ActiveWorkout, Exercise, GroupType, Routine, RoutineSet, Workout, WorkoutExercise, WorkoutSet } from './types';
import { uid } from './util';

/** Hard limits for user input. Values outside these are refused rather than silently stored. */
export const LIMITS = {
  kg: { min: 0, max: 1500 },
  reps: { min: 0, max: 2000 },
  seconds: { min: 0, max: 86400 },
  meters: { min: 0, max: 1_000_000 },
  rpe: { min: 1, max: 10 },
} as const;

export type EditableWorkout = Pick<Workout, 'exercises'>;

export const blankSet = (type: WorkoutSet['type'] = 'normal'): WorkoutSet => ({ id: uid(), type, done: false });

export function newWorkoutExercise(exercise: Pick<Exercise, 'id'>, setCount = 3): WorkoutExercise {
  return { id: uid(), exerciseId: exercise.id, sets: Array.from({ length: setCount }, () => blankSet()) };
}

const mapExercise = <T extends EditableWorkout>(w: T, id: string, fn: (e: WorkoutExercise) => WorkoutExercise): T =>
  ({ ...w, exercises: w.exercises.map((e) => (e.id === id ? fn(e) : e)) });

export const addExercises = <T extends EditableWorkout>(w: T, list: Pick<Exercise, 'id'>[]): T =>
  ({ ...w, exercises: [...w.exercises, ...list.map((e) => newWorkoutExercise(e))] });

export const removeExercise = <T extends EditableWorkout>(w: T, id: string): T => {
  const exercises = w.exercises.filter((e) => e.id !== id);
  return { ...w, exercises: pruneGroups(exercises) };
};

export const moveExercise = <T extends EditableWorkout>(w: T, id: string, dir: -1 | 1): T => {
  const i = w.exercises.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= w.exercises.length) return w;
  const exercises = [...w.exercises];
  [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
  return { ...w, exercises };
};

export const updateExercise = <T extends EditableWorkout>(w: T, id: string, patch: Partial<WorkoutExercise>): T =>
  mapExercise(w, id, (e) => ({ ...e, ...patch }));

export const addSet = <T extends EditableWorkout>(w: T, exId: string): T =>
  mapExercise(w, exId, (e) => {
    const last = e.sets[e.sets.length - 1];
    const next = blankSet(last?.type === 'warmup' ? 'normal' : (last?.type ?? 'normal'));
    return { ...e, sets: [...e.sets, last ? { ...next, kg: last.kg, reps: last.reps, seconds: last.seconds, meters: last.meters } : next] };
  });

export const duplicateSet = <T extends EditableWorkout>(w: T, exId: string, setId: string): T =>
  mapExercise(w, exId, (e) => {
    const i = e.sets.findIndex((s) => s.id === setId);
    if (i < 0) return e;
    const sets = [...e.sets];
    sets.splice(i + 1, 0, { ...e.sets[i], id: uid(), done: false, doneAt: undefined });
    return { ...e, sets };
  });

export const removeSet = <T extends EditableWorkout>(w: T, exId: string, setId: string): T =>
  mapExercise(w, exId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));

export const updateSet = <T extends EditableWorkout>(w: T, exId: string, setId: string, patch: Partial<WorkoutSet>): T =>
  mapExercise(w, exId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

/** Link an exercise with the one after it. Consecutive exercises sharing a groupId render and rest together. */
export const linkWithNext = <T extends EditableWorkout>(w: T, exId: string, type: GroupType): T => {
  const i = w.exercises.findIndex((e) => e.id === exId);
  if (i < 0 || i === w.exercises.length - 1) return w;
  const groupId = w.exercises[i].groupId ?? w.exercises[i + 1].groupId ?? uid();
  const a = w.exercises[i], b = w.exercises[i + 1];
  const members = new Set([a.id, b.id]);
  for (const e of w.exercises) if ((a.groupId && e.groupId === a.groupId) || (b.groupId && e.groupId === b.groupId)) members.add(e.id);
  return { ...w, exercises: w.exercises.map((e) => (members.has(e.id) ? { ...e, groupId, groupType: type } : e)) };
};

export const unlink = <T extends EditableWorkout>(w: T, exId: string): T => {
  const exercises = w.exercises.map((e) => (e.id === exId ? { ...e, groupId: undefined, groupType: undefined } : e));
  return { ...w, exercises: pruneGroups(exercises) };
};

/** A group needs two adjacent members; anything less dissolves. */
function pruneGroups(list: WorkoutExercise[]): WorkoutExercise[] {
  return list.map((e, i) => {
    if (!e.groupId) return e;
    const adj = list[i - 1]?.groupId === e.groupId || list[i + 1]?.groupId === e.groupId;
    return adj ? e : { ...e, groupId: undefined, groupType: undefined };
  });
}

/** In a group, rest only fires after the last member; otherwise you'd be resting mid-superset. */
export function restAfter(w: EditableWorkout, exId: string, fallback: number): number {
  const i = w.exercises.findIndex((e) => e.id === exId);
  const e = w.exercises[i];
  if (!e) return 0;
  if (e.groupId && w.exercises[i + 1]?.groupId === e.groupId) return 0;
  return e.restSec ?? fallback;
}

export function workoutFromRoutine(r: Routine): ActiveWorkout {
  const now = Date.now();
  return {
    id: uid(), name: r.name, routineId: r.id, startedAt: now, notes: r.notes, rest: null, updatedAt: now,
    exercises: r.exercises.map((e) => ({
      id: uid(), exerciseId: e.exerciseId, notes: e.notes, groupId: e.groupId, groupType: e.groupType, restSec: e.restSec,
      targetRepsMin: e.sets.find((s) => s.type !== 'warmup')?.repsMin,
      targetRepsMax: e.sets.find((s) => s.type !== 'warmup')?.repsMax,
      sets: e.sets.map(fromRoutineSet),
    })),
  };
}
const fromRoutineSet = (s: RoutineSet): WorkoutSet => ({
  id: uid(), type: s.type, done: false, kg: s.kg, seconds: s.seconds, meters: s.meters, rpe: undefined,
  reps: undefined,
});

export const blankWorkout = (name = 'Open Session'): ActiveWorkout => {
  const now = Date.now();
  return { id: uid(), name, startedAt: now, exercises: [], rest: null, updatedAt: now };
};

/** Save a logged workout back as a routine — sets keep their values as targets. */
export function routineFromWorkout(w: Workout, name: string): Routine {
  return {
    id: uid(), name, days: [], updatedAt: Date.now(),
    exercises: w.exercises.map((e) => ({
      id: uid(), exerciseId: e.exerciseId, notes: e.notes, groupId: e.groupId, groupType: e.groupType, restSec: e.restSec,
      sets: e.sets.filter((s) => s.done).map((s) => ({ type: s.type, repsMin: s.reps, repsMax: s.reps, kg: s.kg, seconds: s.seconds, meters: s.meters })),
    })).filter((e) => e.sets.length),
  };
}

/** Keep only completed sets; drop exercises that end up empty. Unfinished rows are never counted. */
export function finalize(a: ActiveWorkout, completedAt: number, name?: string, notes?: string): Workout {
  return {
    id: a.id, name: (name ?? a.name).trim() || 'Workout', routineId: a.routineId, startedAt: a.startedAt, completedAt,
    notes: notes ?? a.notes, updatedAt: Date.now(),
    exercises: a.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length > 0),
  };
}

export const countDone = (w: EditableWorkout) => w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
export const countPending = (w: EditableWorkout) => w.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);

/** A set can only be completed when it records real work for its tracking mode. */
export function setProblem(s: WorkoutSet, mode: Exercise['mode']): string | null {
  const bad = (v: number | undefined, k: keyof typeof LIMITS) => v !== undefined && (Number.isNaN(v) || v < LIMITS[k].min || v > LIMITS[k].max);
  if (bad(s.kg, 'kg')) return `Weight must be between 0 and ${LIMITS.kg.max} kg.`;
  if (bad(s.reps, 'reps')) return `Reps must be between 0 and ${LIMITS.reps.max}.`;
  if (bad(s.seconds, 'seconds')) return 'Time must be under 24 hours.';
  if (bad(s.meters, 'meters')) return 'Distance is out of range.';
  if (s.rpe !== undefined && (s.rpe < LIMITS.rpe.min || s.rpe > LIMITS.rpe.max)) return 'RPE must be 1 to 10.';
  if (mode === 'strength' && !(s.kg !== undefined && s.reps && s.reps > 0)) return 'Enter weight and reps first.';
  if (mode === 'bodyweight' && !(s.reps && s.reps > 0)) return 'Enter reps first.';
  if (mode === 'timed' && !(s.seconds && s.seconds > 0)) return 'Enter a time first.';
  if (mode === 'cardio' && !((s.seconds && s.seconds > 0) || (s.meters && s.meters > 0))) return 'Enter a time or distance first.';
  return null;
}
