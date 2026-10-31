import type { Exercise, LegacyImport, Workout, WorkoutExercise, WorkoutSet } from './types';

/** Epley estimate — the same formula v1 used, so migrated PRs stay comparable. */
export const e1rm = (kg: number, reps: number) => (kg > 0 && reps > 0 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : 0);

export const setVolume = (s: WorkoutSet) => (s.done ? (s.kg ?? 0) * (s.reps ?? 0) : 0);
export const isWorking = (s: WorkoutSet) => s.type !== 'warmup';
/** A "hard set": a completed working set that is not explicitly easy. */
export const isHard = (s: WorkoutSet) => s.done && isWorking(s) && (s.rpe === undefined || s.rpe >= 6);

export type PRKind = 'e1rm' | 'weight' | 'reps' | 'volume' | 'time' | 'distance';
export const PR_LABEL: Record<PRKind, string> = { e1rm: 'Est. 1RM', weight: 'Heaviest', reps: 'Most reps', volume: 'Best set volume', time: 'Longest time', distance: 'Longest distance' };

export interface Bests { e1rm: number; weight: number; reps: number; volume: number; time: number; distance: number }
export const emptyBests = (): Bests => ({ e1rm: 0, weight: 0, reps: 0, volume: 0, time: 0, distance: 0 });

export interface PREvent {
  workoutId: string; exerciseId: string; setId: string; kind: PRKind; value: number; previous: number; at: number;
  kg?: number; reps?: number;
}

/** Which records does this set beat? First-ever performances establish a baseline; they aren't PRs. */
export function checkSet(mode: Exercise['mode'] | undefined, s: WorkoutSet, b: Bests, hasHistory: boolean): { kind: PRKind; value: number; previous: number }[] {
  if (!s.done || s.type === 'warmup') return [];
  const out: { kind: PRKind; value: number; previous: number }[] = [];
  const add = (kind: PRKind, value: number) => { if (value > b[kind] && hasHistory && b[kind] > 0) out.push({ kind, value, previous: b[kind] }); };
  if (mode === 'timed') add('time', s.seconds ?? 0);
  else if (mode === 'cardio') { add('distance', s.meters ?? 0); add('time', s.seconds ?? 0); }
  else if (mode === 'bodyweight' && !s.kg) add('reps', s.reps ?? 0);
  else {
    add('e1rm', e1rm(s.kg ?? 0, s.reps ?? 0));
    add('weight', s.kg ?? 0);
    add('volume', (s.kg ?? 0) * (s.reps ?? 0));
  }
  return out;
}

export function applySet(b: Bests, s: WorkoutSet) {
  if (!s.done || s.type === 'warmup') return;
  b.e1rm = Math.max(b.e1rm, e1rm(s.kg ?? 0, s.reps ?? 0));
  b.weight = Math.max(b.weight, s.kg ?? 0);
  b.reps = Math.max(b.reps, s.reps ?? 0);
  b.volume = Math.max(b.volume, (s.kg ?? 0) * (s.reps ?? 0));
  b.time = Math.max(b.time, s.seconds ?? 0);
  b.distance = Math.max(b.distance, s.meters ?? 0);
}

export interface RecordBook {
  bests: Map<string, Bests>;
  events: PREvent[];
  byWorkout: Map<string, PREvent[]>;
  /** Exercise ids that have at least one recorded performance. */
  seen: Set<string>;
}

export const chronological = (w: Workout[]) => [...w].sort((a, b) => a.completedAt - b.completedAt);

/**
 * Replays every saved workout in date order. Nothing about records is ever stored —
 * editing or deleting a workout changes the input and the whole book recalculates.
 */
export function buildRecordBook(workouts: Workout[], modeOf: (id: string) => Exercise['mode'] | undefined, legacy?: LegacyImport | null): RecordBook {
  const bests = new Map<string, Bests>();
  const events: PREvent[] = [];
  const byWorkout = new Map<string, PREvent[]>();
  const seen = new Set<string>();
  // v1 PRs are real history that has no per-set record: they act as the starting bar.
  for (const p of legacy?.prs ?? []) {
    const b = emptyBests();
    b.e1rm = p.e1rmKg; b.weight = p.kg; b.reps = p.reps; b.volume = p.kg * p.reps;
    bests.set(p.exerciseId, b);
    seen.add(p.exerciseId);
  }
  for (const w of chronological(workouts)) {
    for (const ex of w.exercises) {
      const b = bests.get(ex.exerciseId) ?? emptyBests();
      const had = seen.has(ex.exerciseId);
      let hadThisSession = had;
      for (const s of ex.sets) {
        for (const hit of checkSet(modeOf(ex.exerciseId), s, b, hadThisSession)) {
          const ev: PREvent = { workoutId: w.id, exerciseId: ex.exerciseId, setId: s.id, at: w.completedAt, kg: s.kg, reps: s.reps, ...hit };
          events.push(ev);
          (byWorkout.get(w.id) ?? byWorkout.set(w.id, []).get(w.id)!).push(ev);
        }
        if (s.done && s.type !== 'warmup') { applySet(b, s); hadThisSession = true; }
      }
      bests.set(ex.exerciseId, b);
      if (hadThisSession) seen.add(ex.exerciseId);
    }
  }
  return { bests, events, byWorkout, seen };
}

export interface LastPerformance { workoutId: string; at: number; sets: WorkoutSet[] }

/** Most recent performance of each exercise, for the "previous" column. */
export function lastPerformances(workouts: Workout[]): Map<string, LastPerformance> {
  const out = new Map<string, LastPerformance>();
  for (const w of chronological(workouts)) for (const e of w.exercises) {
    const sets = e.sets.filter((s) => s.done);
    if (sets.length) out.set(e.exerciseId, { workoutId: w.id, at: w.completedAt, sets });
  }
  return out;
}

export interface ExerciseSession { workout: Workout; entry: WorkoutExercise; at: number; bestE1rm: number; topKg: number; volume: number; reps: number; seconds: number; meters: number; sets: number }

export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (const w of chronological(workouts)) {
    for (const entry of w.exercises) {
      if (entry.exerciseId !== exerciseId) continue;
      const work = entry.sets.filter((s) => s.done && isWorking(s));
      if (!work.length) continue;
      out.push({
        workout: w, entry, at: w.completedAt,
        bestE1rm: Math.max(0, ...work.map((s) => e1rm(s.kg ?? 0, s.reps ?? 0))),
        topKg: Math.max(0, ...work.map((s) => s.kg ?? 0)),
        volume: entry.sets.reduce((n, s) => n + setVolume(s), 0),
        reps: work.reduce((n, s) => n + (s.reps ?? 0), 0),
        seconds: work.reduce((n, s) => n + (s.seconds ?? 0), 0),
        meters: work.reduce((n, s) => n + (s.meters ?? 0), 0),
        sets: work.length,
      });
    }
  }
  return out;
}
