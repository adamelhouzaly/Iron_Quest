import type { Exercise, Muscle, Workout } from './types';
import { isHard, setVolume } from './records';
import { addDays, dayKey, monthKey, startOfWeek, weekKey } from './util';

export const workoutVolume = (w: Workout) =>
  w.legacy ? w.legacy.volumeKg : w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + setVolume(s), 0), 0);
export const workoutSets = (w: Workout) =>
  w.legacy ? w.legacy.completedSets : w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
export const workoutDuration = (w: Workout) => Math.max(0, Math.round((w.completedAt - w.startedAt) / 1000));

export interface Totals { workouts: number; sets: number; volume: number; seconds: number; reps: number }
export function totals(list: Workout[], carry?: { sets: number; volumeKg: number }): Totals {
  const t: Totals = { workouts: list.length, sets: carry?.sets ?? 0, volume: carry?.volumeKg ?? 0, seconds: 0, reps: 0 };
  for (const w of list) {
    t.sets += workoutSets(w); t.volume += workoutVolume(w); t.seconds += workoutDuration(w);
    for (const e of w.exercises) for (const s of e.sets) if (s.done) t.reps += s.reps ?? 0;
  }
  return t;
}

export type RangeKey = '4w' | '12w' | '6m' | '1y' | 'all';
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '4w', label: '4W', days: 28 }, { key: '12w', label: '12W', days: 84 }, { key: '6m', label: '6M', days: 182 }, { key: '1y', label: '1Y', days: 365 }, { key: 'all', label: 'ALL', days: null },
];
export function rangeBounds(key: RangeKey, now = Date.now()): { from: number; prevFrom: number | null } {
  const days = RANGES.find((r) => r.key === key)!.days;
  if (days === null) return { from: 0, prevFrom: null };
  const from = addDays(now, -days).getTime();
  return { from, prevFrom: addDays(now, -days * 2).getTime() };
}
export const inRange = (list: Workout[], from: number, to = Infinity) => list.filter((w) => w.completedAt >= from && w.completedAt < to);

export interface WeekPoint { week: string; start: number; volume: number; workouts: number; sets: number; minutes: number }
/** Continuous weekly series — empty weeks stay as zeros so gaps read as gaps. */
export function weeklySeries(list: Workout[], from: number, now = Date.now()): WeekPoint[] {
  const firstW = list.length ? Math.min(...list.map((w) => w.completedAt)) : now;
  const start = startOfWeek(Math.max(from, from === 0 ? firstW : from));
  const map = new Map<string, WeekPoint>();
  for (let d = start; d.getTime() <= now; d = addDays(d, 7)) {
    const k = weekKey(d);
    map.set(k, { week: k, start: d.getTime(), volume: 0, workouts: 0, sets: 0, minutes: 0 });
  }
  for (const w of list) {
    const p = map.get(weekKey(w.completedAt));
    if (!p) continue;
    p.volume += workoutVolume(w); p.workouts += 1; p.sets += workoutSets(w); p.minutes += workoutDuration(w) / 60;
  }
  return [...map.values()];
}

export interface MonthSummary { month: string; workouts: number; sets: number; volume: number; minutes: number; days: number }
export function monthlySummaries(list: Workout[]): MonthSummary[] {
  const map = new Map<string, MonthSummary & { dayset: Set<string> }>();
  for (const w of list) {
    const k = monthKey(w.completedAt);
    const m = map.get(k) ?? { month: k, workouts: 0, sets: 0, volume: 0, minutes: 0, days: 0, dayset: new Set() };
    m.workouts++; m.sets += workoutSets(w); m.volume += workoutVolume(w); m.minutes += workoutDuration(w) / 60; m.dayset.add(dayKey(w.completedAt));
    m.days = m.dayset.size;
    map.set(k, m);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month)).map(({ dayset: _d, ...m }) => m);
}
export function yearlySummaries(list: Workout[]) {
  const map = new Map<string, MonthSummary>();
  for (const m of monthlySummaries(list)) {
    const y = m.month.slice(0, 4);
    const t = map.get(y) ?? { month: y, workouts: 0, sets: 0, volume: 0, minutes: 0, days: 0 };
    t.workouts += m.workouts; t.sets += m.sets; t.volume += m.volume; t.minutes += m.minutes; t.days += m.days;
    map.set(y, t);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', lats: 'Lats', 'upper-back': 'Upper back', 'lower-back': 'Lower back', traps: 'Traps', 'front-delts': 'Front delts', 'side-delts': 'Side delts', 'rear-delts': 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', adductors: 'Adductors', abductors: 'Abductors', cardio: 'Cardio',
};
export const MUSCLES = Object.keys(MUSCLE_LABEL) as Muscle[];

/** Hard sets per muscle: a primary mover counts as 1 set, a secondary mover as 0.5. */
export function muscleSets(list: Workout[], lookup: (id: string) => Exercise | undefined): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const w of list) for (const e of w.exercises) {
    const x = lookup(e.exerciseId);
    if (!x) continue;
    const hard = e.sets.filter(isHard).length;
    if (!hard) continue;
    for (const m of x.primary) out.set(m, (out.get(m) ?? 0) + hard);
    for (const m of x.secondary) out.set(m, (out.get(m) ?? 0) + hard * 0.5);
  }
  return out;
}

export interface Streaks { currentWeeks: number; bestWeeks: number; currentDays: number; bestDays: number; activeDays: number }
/**
 * The headline streak is counted in WEEKS so rest days never break it. A week counts
 * once it has one workout; the current week can't break a streak until it has ended.
 */
export function streaks(list: Workout[], now = Date.now()): Streaks {
  const days = new Set(list.map((w) => dayKey(w.completedAt)));
  const weeks = new Set(list.map((w) => weekKey(w.completedAt)));
  let currentWeeks = 0;
  let cur = startOfWeek(now);
  if (!weeks.has(weekKey(cur))) cur = addDays(cur, -7);
  while (weeks.has(weekKey(cur))) { currentWeeks++; cur = addDays(cur, -7); }
  const longest = (keys: string[], step: number) => {
    let best = 0, run = 0, prev: number | null = null;
    for (const k of keys.sort()) {
      const [y, m, d] = k.split('-').map(Number);
      const t = new Date(y, m - 1, d).getTime();
      const gap = prev === null ? 0 : Math.round((t - prev) / 86400000);
      run = prev !== null && gap === step ? run + 1 : 1;
      best = Math.max(best, run); prev = t;
    }
    return best;
  };
  let currentDays = 0;
  let c = new Date(now);
  if (!days.has(dayKey(c))) c = addDays(c, -1);
  while (days.has(dayKey(c))) { currentDays++; c = addDays(c, -1); }
  return { currentWeeks, bestWeeks: longest([...weeks], 7), currentDays, bestDays: longest([...days], 1), activeDays: days.size };
}

export const pctChange = (now: number, prev: number) => (prev > 0 ? ((now - prev) / prev) * 100 : null);
