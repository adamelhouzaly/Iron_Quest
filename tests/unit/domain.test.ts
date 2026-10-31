import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_BY_ID } from '@/data/exercises';
import { PROGRAMS, instantiateProgram } from '@/data/templates';
import { migrateV1 } from '@/domain/migration';
import { buildRecordBook, e1rm } from '@/domain/records';
import { computeProgress, levelFromXp, XP } from '@/domain/progression';
import { muscleSets, streaks, totals, weeklySeries } from '@/domain/analytics';
import { recommend } from '@/domain/overload';
import { plateBreakdown, warmupSets } from '@/domain/tools';
import { addSet, duplicateSet, finalize, linkWithNext, moveExercise, newWorkoutExercise, removeExercise, restAfter, setProblem, unlink, workoutFromRoutine } from '@/domain/workout-ops';
import { toDisplay, toKg } from '@/domain/util';
import type { Workout, WorkoutSet } from '@/domain/types';

const lookup = (id: string) => EXERCISE_BY_ID.get(id);
const set = (kg: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: `${Math.random()}`, type: 'normal', kg, reps, done: true, ...extra });
let n = 0;
const wk = (at: string, sets: WorkoutSet[], exerciseId = 'barbell-bench-press', minutes = 45, extra: Partial<Workout> = {}): Workout => {
  const completedAt = new Date(at).getTime();
  return { id: `w${n++}`, name: 'T', startedAt: completedAt - minutes * 60000, completedAt, updatedAt: 0, exercises: [{ id: `e${n}`, exerciseId, sets }], ...extra };
};
const NOW = new Date('2026-06-20T12:00:00').getTime();

describe('library', () => {
  it('has unique ids and complete instruction data', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) { expect(e.primary.length, e.name).toBeGreaterThan(0); expect(e.steps.length, e.name).toBeGreaterThan(1); expect(e.form.length, e.name).toBeGreaterThan(0); }
  });
  it('contains every exercise the original app shipped', () => {
    for (const name of ['Barbell Bench Press', 'Incline Dumbbell Press', 'Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Cable Fly', 'Triceps Pushdown', 'Overhead Triceps Extension', 'Pull-Up', 'Lat Pulldown', 'Barbell Row', 'Chest-Supported Row', 'Seated Cable Row', 'Face Pull', 'Dumbbell Curl', 'Hammer Curl', 'Barbell Squat', 'Front Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Standing Calf Raise', 'Seated Calf Raise', 'Hanging Leg Raise'])
      expect(EXERCISES.some((e) => e.name === name), name).toBe(true);
  });
  it('program templates only reference exercises that exist', () => {
    for (const p of PROGRAMS) for (const r of instantiateProgram(p).routines) for (const e of r.exercises) expect(lookup(e.exerciseId), `${p.name}: ${e.exerciseId}`).toBeTruthy();
  });
});

describe('v1 migration', () => {
  const v1 = JSON.stringify({ xp: 700, totalVolume: 12000, totalSets: 14, streak: 2, lastWorkoutDate: '2026-01-02',
    history: [{ split: 'Push', completedAt: '2026-01-02T18:00:00.000Z', volume: 12000, completedSets: 12, xpEarned: 600, newPRs: [{ name: 'Barbell Bench Press', weight: 225, reps: 5, e1rm: 262.5 }] }, { completedAt: 'garbage' }],
    prs: { 'Barbell Bench Press': { weight: 225, reps: 5, e1rm: 262.5, date: '2026-01-02T18:00:00.000Z' }, 'Mystery Lift': { weight: 100, reps: 1, e1rm: 100, date: 'x' } } });
  const known = (id: string) => EXERCISE_BY_ID.has(id);

  it('converts sessions, preserves totals exactly, and keeps pounds round-trippable', () => {
    const r = migrateV1(v1, known, NOW)!;
    expect(r.workouts).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(toDisplay(r.workouts[0].legacy!.volumeKg, 'lb')).toBe(12000);
    expect(toDisplay(r.legacy.prs[0].kg, 'lb')).toBe(225);
    expect(r.legacy.carryXp).toBe(100);
    expect(r.legacy.carrySets).toBe(2);
    expect(r.customExercises.map((e) => e.name)).toEqual(['Mystery Lift']);
  });
  it('is idempotent and tolerates bad input', () => {
    expect(migrateV1(v1, known, 1)!.workouts[0].id).toBe(migrateV1(v1, known, 2)!.workouts[0].id);
    expect(migrateV1('{not json', known)).toBeNull();
    expect(migrateV1(null, known)).toBeNull();
    expect(migrateV1('{}', known)!.workouts).toEqual([]);
  });
  it('keeps every XP point the user earned in v1', () => {
    const r = migrateV1(v1, known, NOW)!;
    const p = computeProgress({ workouts: r.workouts, legacy: r.legacy, goals: [], lookup, now: NOW });
    expect(p.xp).toBeGreaterThanOrEqual(700);
    expect(p.achievements.has('first-workout')).toBe(true);
  });
  it('treats a legacy PR as the bar to beat', () => {
    const r = migrateV1(v1, known, NOW)!;
    const lighter = wk('2026-02-01T10:00:00', [set(toKg(200, 'lb'), 5)]);
    const heavier = wk('2026-02-08T10:00:00', [set(toKg(250, 'lb'), 5)]);
    const book = buildRecordBook([lighter, heavier], (id) => lookup(id)?.mode, r.legacy);
    expect(book.byWorkout.get(lighter.id)).toBeUndefined();
    expect(book.byWorkout.get(heavier.id)!.some((e) => e.kind === 'e1rm')).toBe(true);
  });
});

describe('records recalculate from history', () => {
  const a = wk('2026-03-01T10:00:00', [set(100, 5)]);
  const b = wk('2026-03-08T10:00:00', [set(110, 5)]);
  const c = wk('2026-03-15T10:00:00', [set(105, 5)]);
  const mode = (id: string) => lookup(id)?.mode;

  it('uses the Epley formula, with 1 rep = weight', () => { expect(e1rm(100, 1)).toBe(100); expect(e1rm(100, 30)).toBe(200); });
  it('first performance is a baseline, not a PR', () => expect(buildRecordBook([a], mode).events).toHaveLength(0));
  it('finds PRs in date order even when saved out of order', () => {
    const book = buildRecordBook([c, a, b], mode);
    expect(book.bests.get('barbell-bench-press')!.weight).toBe(110);
    expect(book.byWorkout.get(b.id)!.length).toBeGreaterThan(0);
    expect(book.byWorkout.get(c.id)).toBeUndefined();
  });
  it('deleting the record session demotes the best and promotes the next one', () => {
    const book = buildRecordBook([a, c], mode);
    expect(book.bests.get('barbell-bench-press')!.weight).toBe(105);
    expect(book.byWorkout.get(c.id)!.length).toBeGreaterThan(0);
  });
  it('ignores warm-ups and unfinished sets', () => {
    const w = wk('2026-03-20T10:00:00', [set(300, 5, { type: 'warmup' }), set(300, 5, { done: false }), set(60, 5)]);
    expect(buildRecordBook([a, w], mode).bests.get('barbell-bench-press')!.weight).toBe(100);
  });
});

describe('XP is balanced and resists spam', () => {
  const p = (workouts: Workout[]) => computeProgress({ workouts, goals: [], lookup, now: NOW });
  const sets = (k: number) => Array.from({ length: k }, () => set(60, 10));
  const entry = (w: Workout, ws: Workout[] = [w]) => p(ws).ledger.find((l) => l.workoutId === w.id)!;

  it('a normal session earns set and completion XP', () => {
    const e = entry(wk('2026-06-01T10:00:00', sets(12), 'barbell-bench-press', 50));
    expect(e.items.find((i) => i.label === 'Session complete')!.xp).toBe(XP.COMPLETE);
    expect(e.items[0].xp).toBe(12 * XP.SET);
  });
  it('a 1-minute session of 100 sets is capped by pace and gets no completion bonus', () => {
    const e = entry(wk('2026-06-01T10:00:00', sets(100), 'barbell-bench-press', 1));
    expect(e.items[0].xp).toBeLessThanOrEqual(3 * XP.SET);
    expect(e.items.some((i) => i.label === 'Session complete')).toBe(false);
    expect(e.notes.length).toBeGreaterThan(0);
  });
  it('repeat sessions in a day pay less', () => {
    const a = wk('2026-06-01T08:00:00', sets(10)); const b = wk('2026-06-01T12:00:00', sets(10)); const c = wk('2026-06-01T16:00:00', sets(10));
    const ledger = p([a, b, c]).ledger;
    const setXp = (w: Workout) => ledger.find((l) => l.workoutId === w.id)!.items[0].xp;
    expect(setXp(b)).toBe(setXp(a) / 2);
    expect(setXp(c)).toBeLessThan(setXp(b));
  });
  it('weight does not change XP', () => {
    const light = entry(wk('2026-06-02T10:00:00', Array.from({ length: 10 }, () => set(20, 10))));
    const heavy = entry(wk('2026-06-02T10:00:00', Array.from({ length: 10 }, () => set(200, 10))));
    expect(light.total).toBe(heavy.total);
  });
  it('implausible PR jumps earn no XP', () => {
    const a = wk('2026-06-01T10:00:00', [set(100, 5), ...sets(3)]);
    const fake = wk('2026-06-08T10:00:00', [set(400, 5), ...sets(3)]);
    expect(entry(fake, [a, fake]).items.some((i) => i.label.includes('personal record'))).toBe(false);
    const real = wk('2026-06-08T10:00:00', [set(105, 5), ...sets(3)]);
    expect(entry(real, [a, real]).items.some((i) => i.label.includes('personal record'))).toBe(true);
  });
  it('time off never removes XP; deleting a workout does', () => {
    const a = wk('2026-01-05T10:00:00', sets(10));
    const later = computeProgress({ workouts: [a], goals: [], lookup, now: new Date('2026-12-01').getTime() });
    expect(later.xp).toBe(p([a]).xp);
    expect(p([]).xp).toBe(0);
  });
  it('weekly quest pays once, and paying out is derived from the log', () => {
    const ws = ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-06'].map((d) => wk(`${d}T10:00:00`, sets(6)));
    expect(p(ws).ledger.filter((l) => l.title.includes('Three sessions'))).toHaveLength(1);
    expect(p(ws.slice(0, 2)).ledger.filter((l) => l.title.includes('Three sessions'))).toHaveLength(0);
  });
  it('level curve is monotonic', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(299).level).toBe(1);
    expect(levelFromXp(300).level).toBe(2);
    expect(levelFromXp(300).into).toBe(0);
  });
});

describe('analytics', () => {
  it('rest days do not break the weekly streak; a missed week does', () => {
    const list = [wk('2026-05-04T10:00:00', [set(1, 1)]), wk('2026-05-11T10:00:00', [set(1, 1)]), wk('2026-05-18T10:00:00', [set(1, 1)]), wk('2026-06-08T10:00:00', [set(1, 1)]), wk('2026-06-20T08:00:00', [set(1, 1)])];
    expect(streaks(list, NOW).currentWeeks).toBe(2);
    expect(streaks(list, NOW).bestWeeks).toBe(3);
  });
  it('the current empty week does not break a streak', () => {
    const list = [wk('2026-06-14T10:00:00', [set(1, 1)])];
    expect(streaks(list, new Date('2026-06-16T10:00:00').getTime()).currentWeeks).toBe(1);
  });
  it('counts primary 1, secondary 0.5 for muscle sets', () => {
    const m = muscleSets([wk('2026-06-01T10:00:00', [set(60, 10), set(60, 10), set(60, 10, { type: 'warmup' })])], lookup);
    expect(m.get('chest')).toBe(2); expect(m.get('triceps')).toBe(1);
  });
  it('totals exclude unfinished sets; weekly series keeps empty weeks', () => {
    const w = wk('2026-06-01T10:00:00', [set(100, 10), set(100, 10, { done: false })]);
    expect(totals([w]).volume).toBe(1000);
    expect(totals([w]).sets).toBe(1);
    const series = weeklySeries([w], new Date('2026-05-18').getTime(), NOW);
    expect(series.length).toBeGreaterThanOrEqual(5);
    expect(series.filter((s) => s.volume === 0).length).toBeGreaterThan(0);
  });
});

describe('overload engine', () => {
  const bench = lookup('barbell-bench-press')!;
  const e = (sets: WorkoutSet[]) => ({ id: 'x', exerciseId: bench.id, sets });
  it('adds load only once the range is cleared', () => {
    expect(recommend(bench, [e([set(100, 10), set(100, 10)])], { min: 8, max: 10 })!.advice).toBe('increase-load');
    expect(recommend(bench, [e([set(100, 9), set(100, 8)])], { min: 8, max: 10 })!.advice).toBe('increase-reps');
  });
  it('holds under range or at maximal RPE, backs off after two misses', () => {
    expect(recommend(bench, [e([set(100, 6)])], { min: 8, max: 10 })!.advice).toBe('hold');
    expect(recommend(bench, [e([set(100, 10, { rpe: 10 })])], { min: 8, max: 10 })!.advice).toBe('hold');
    expect(recommend(bench, [e([set(100, 6)]), e([set(100, 6)])], { min: 8, max: 10 })!.advice).toBe('reduce');
  });
  it('always explains itself', () => { expect(recommend(bench, [e([set(100, 10)])])!.reasons.length).toBeGreaterThan(0); });
  it('asks for a baseline with no history', () => { expect(recommend(bench, [])!.advice).toBe('baseline'); });
});

describe('tools', () => {
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
  it('breaks plates down per side', () => {
    const r = plateBreakdown(100, 20, plates);
    expect(r.plates).toEqual([{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
    expect(r.remainder).toBe(0);
  });
  it('reports what cannot be loaded', () => { expect(plateBreakdown(101, 20, plates).remainder).toBe(1); expect(plateBreakdown(10, 20, plates).belowBar).toBe(true); });
  it('warm-ups stay under the work weight', () => { for (const s of warmupSets(100, 20, 2.5)) expect(s.kg).toBeLessThan(100); });
});

describe('workout operations', () => {
  const ex = (id: string) => newWorkoutExercise({ id });
  it('reorders and respects edges', () => {
    const a = ex('a'), b = ex('b'); const w = { exercises: [a, b] };
    expect(moveExercise(w, b.id, -1).exercises[0].id).toBe(b.id);
    expect(moveExercise(w, a.id, -1)).toBe(w);
  });
  it('supersets rest only after the last member; removing one dissolves the group', () => {
    const a = ex('a'), b = ex('b'), c = ex('c'); let w = { exercises: [a, b, c] };
    w = linkWithNext(w, a.id, 'superset');
    expect(w.exercises[0].groupId).toBe(w.exercises[1].groupId);
    expect(restAfter(w, a.id, 90)).toBe(0);
    expect(restAfter(w, b.id, 90)).toBe(90);
    expect(removeExercise(w, b.id).exercises[0].groupId).toBeUndefined();
    expect(unlink(w, a.id).exercises[1].groupId).toBeUndefined();
  });
  it('duplicate/add sets copy values but never completion', () => {
    const a = ex('a'); a.sets = [set(100, 5)]; let w = { exercises: [a] };
    w = duplicateSet(w, a.id, a.sets[0].id);
    expect(w.exercises[0].sets[1]).toMatchObject({ kg: 100, done: false });
    w = addSet(w, a.id);
    expect(w.exercises[0].sets[2].done).toBe(false);
  });
  it('validation rejects empty and absurd input, allows zero-weight reps for bodyweight', () => {
    expect(setProblem({ id: '', type: 'normal', done: false }, 'strength')).toBeTruthy();
    expect(setProblem({ id: '', type: 'normal', done: false, kg: 5000, reps: 5 }, 'strength')).toBeTruthy();
    expect(setProblem({ id: '', type: 'normal', done: false, kg: -1, reps: 5 }, 'strength')).toBeTruthy();
    expect(setProblem({ id: '', type: 'normal', done: false, kg: 50, reps: 5 }, 'strength')).toBeNull();
    expect(setProblem({ id: '', type: 'normal', done: false, reps: 5 }, 'bodyweight')).toBeNull();
    expect(setProblem({ id: '', type: 'normal', done: false, seconds: 60 }, 'cardio')).toBeNull();
  });
  it('finalize drops unfinished sets and empty exercises', () => {
    const a = ex('a'), b = ex('b'); a.sets = [set(100, 5), set(100, 5, { done: false })]; b.sets = [set(1, 1, { done: false })];
    const f = finalize({ id: 'w', name: ' Day ', startedAt: 1, exercises: [a, b], updatedAt: 1 }, 2);
    expect(f.exercises).toHaveLength(1); expect(f.exercises[0].sets).toHaveLength(1); expect(f.name).toBe('Day');
  });
  it('routine round-trip carries targets', () => {
    const { routines } = instantiateProgram(PROGRAMS[0]);
    const w = workoutFromRoutine(routines[0]);
    expect(w.routineId).toBe(routines[0].id);
    expect(w.exercises[0].targetRepsMax).toBe(8);
    expect(w.exercises[0].sets.every((s) => !s.done)).toBe(true);
  });
});
