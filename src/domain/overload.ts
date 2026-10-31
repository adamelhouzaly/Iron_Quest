import type { Exercise, WorkoutExercise, WorkoutSet } from './types';
import { round } from './util';

export type Advice = 'increase-load' | 'increase-reps' | 'hold' | 'reduce' | 'baseline';
export interface Recommendation {
  advice: Advice;
  kg?: number;
  reps?: number;
  headline: string;
  /** Every rule that fired, in plain language. Recommendations are always explained. */
  reasons: string[];
}

const LOWER = new Set(['quads', 'glutes', 'hamstrings', 'calves']);

/** Load jump: 2.5% of working weight, snapped to the smallest realistic plate step, min one step. */
export function nextLoad(kg: number, exercise: Pick<Exercise, 'primary' | 'equipment'>) {
  const step = exercise.equipment === 'dumbbell' || exercise.equipment === 'kettlebell' ? 2 : exercise.equipment === 'machine' || exercise.equipment === 'cable' ? 2.5 : 2.5;
  const scale = exercise.primary.some((m) => LOWER.has(m)) ? 2 : 1;
  const target = kg + Math.max(step * scale, kg * 0.025);
  return round(Math.round(target / step) * step, 2);
}

/**
 * Transparent double-progression rules:
 *  1. Keep the load until every working set reaches the top of the rep range.
 *  2. When it does (and effort left some room), add a small amount of load.
 *  3. If effort was maximal, or reps fell under range, hold.
 *  4. Two consecutive sessions under range: back off ~10% to rebuild.
 * It is guidance from your own log, never a prescription.
 */
export function recommend(
  exercise: Pick<Exercise, 'primary' | 'equipment' | 'mode'>,
  recent: WorkoutExercise[], // newest last
  target?: { min?: number; max?: number },
): Recommendation | null {
  const work = (e?: WorkoutExercise) => (e?.sets ?? []).filter((s: WorkoutSet) => s.done && s.type !== 'warmup' && s.type !== 'drop');
  const last = work(recent[recent.length - 1]);
  if (!last.length) return { advice: 'baseline', headline: 'Set a baseline', reasons: ['No earlier sets logged — pick a weight you could do for a few more reps.'] };

  if (exercise.mode === 'timed') {
    const best = Math.max(...last.map((s) => s.seconds ?? 0));
    return { advice: 'increase-reps', headline: `Try ${best + 5}s`, reasons: [`Your longest last time was ${best}s. Adding 5s is a small, repeatable step.`] };
  }
  if (exercise.mode === 'cardio') return null;

  const min = target?.min ?? 8;
  const max = target?.max ?? Math.max(min, 12);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const rpes = last.flatMap((s) => (s.rpe ? [s.rpe] : []));
  const rpe = rpes.length ? avg(rpes) : undefined;
  const topKg = Math.max(...last.map((s) => s.kg ?? 0));
  const atTop = last.filter((s) => (s.kg ?? 0) === topKg);
  const minReps = Math.min(...atTop.map((s) => s.reps ?? 0));
  const bestReps = Math.max(...atTop.map((s) => s.reps ?? 0));
  const reasons: string[] = [`Last time: top load sets reached ${minReps === bestReps ? bestReps : `${minReps}–${bestReps}`} reps (target ${min === max ? max : `${min}–${max}`}).`];
  if (rpe !== undefined) reasons.push(`Average logged RPE was ${round(rpe, 1)}.`);

  if (exercise.mode === 'bodyweight' && topKg === 0) {
    if (rpe !== undefined && rpe >= 9.5) return { advice: 'hold', reps: bestReps, headline: `Repeat ${bestReps} reps`, reasons: [...reasons, 'Effort was near maximum, so consolidate before adding.'] };
    return { advice: 'increase-reps', reps: bestReps + 1, headline: `Try ${bestReps + 1} reps`, reasons: [...reasons, 'One more rep is the smallest step of progress.'] };
  }

  const prev = work(recent[recent.length - 2]);
  const under = minReps < min;
  const prevUnder = prev.length > 0 && Math.min(...prev.map((s) => s.reps ?? 0)) < min && Math.max(...prev.map((s) => s.kg ?? 0)) === topKg;

  if (under && prevUnder) {
    const kg = round(Math.round((topKg * 0.9) / 2.5) * 2.5, 2);
    return { advice: 'reduce', kg, reps: max, headline: 'Back off about 10%', reasons: [...reasons, 'Reps were under target two sessions in a row at this load. A small reduction rebuilds momentum.'] };
  }
  if (under) return { advice: 'hold', kg: topKg, reps: min, headline: 'Same load, aim for the range', reasons: [...reasons, `Bring every set up to at least ${min} reps before adding load.`] };
  if (rpe !== undefined && rpe >= 9.5) return { advice: 'hold', kg: topKg, reps: bestReps, headline: 'Same load, own it', reasons: [...reasons, 'The range was met but effort was near maximal — repeat until it feels more controlled.'] };
  if (minReps >= max) {
    const kg = nextLoad(topKg, exercise);
    return { advice: 'increase-load', kg, reps: min, headline: 'Add a little load', reasons: [...reasons, `Every top set hit the top of the range, so step up and work back from ${min} reps.`] };
  }
  return { advice: 'increase-reps', kg: topKg, reps: Math.min(max, bestReps + 1), headline: `Same load, ${Math.min(max, bestReps + 1)} reps`, reasons: [...reasons, 'Add reps within the range before adding load.'] };
}
