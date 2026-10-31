import type { Exercise, Workout, WorkoutSet } from './types';
import { slug, uid } from './util';

const COLUMNS = ['workout_id', 'workout_name', 'started_at', 'completed_at', 'exercise', 'exercise_id', 'set_index', 'set_type', 'weight_kg', 'reps', 'seconds', 'meters', 'rpe', 'notes'];

/** Quote for CSV and neutralise spreadsheet formula injection in user-controlled text. */
function cell(v: unknown): string {
  if (v === undefined || v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function workoutsToCsv(workouts: Workout[], nameOf: (id: string) => string): string {
  const rows = [COLUMNS.join(',')];
  for (const w of [...workouts].sort((a, b) => a.completedAt - b.completedAt)) {
    if (w.legacy) {
      rows.push([w.id, w.name, new Date(w.startedAt).toISOString(), new Date(w.completedAt).toISOString(), '(summary only)', '', '', '', '', '', '', '', '', `v1 session: ${w.legacy.completedSets} sets, ${Math.round(w.legacy.volumeKg)} kg`].map(cell).join(','));
      continue;
    }
    for (const e of w.exercises) e.sets.forEach((s, i) => {
      rows.push([w.id, w.name, new Date(w.startedAt).toISOString(), new Date(w.completedAt).toISOString(), nameOf(e.exerciseId), e.exerciseId, i + 1, s.type, s.kg, s.reps, s.seconds, s.meters, s.rpe, e.notes].map(cell).join(','));
    });
  }
  return rows.join('\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export interface CsvImport { workouts: Workout[]; customExercises: Exercise[]; errors: string[] }

/** Imports the CSV format written above. Bad rows are reported, never silently dropped. */
export function csvToWorkouts(text: string, known: (id: string) => boolean): CsvImport {
  const [head, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const errors: string[] = [];
  if (!head) return { workouts: [], customExercises: [], errors: ['The file is empty.'] };
  const col = (n: string) => head.indexOf(n);
  for (const n of ['workout_name', 'completed_at', 'exercise']) if (col(n) < 0) return { workouts: [], customExercises: [], errors: [`Missing column: ${n}`] };
  const map = new Map<string, Workout>();
  const custom = new Map<string, Exercise>();
  const opt = (v?: string) => { if (v === undefined || v === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : undefined; };
  rows.forEach((r, i) => {
    const line = i + 2;
    const name = (r[col('exercise')] ?? '').replace(/^'/, '').trim();
    if (name === '(summary only)') return;
    const completedAt = new Date(r[col('completed_at')]).getTime();
    if (!Number.isFinite(completedAt)) { errors.push(`Line ${line}: invalid completed_at.`); return; }
    if (!name) { errors.push(`Line ${line}: missing exercise.`); return; }
    const startedRaw = col('started_at') >= 0 ? new Date(r[col('started_at')]).getTime() : NaN;
    const key = (col('workout_id') >= 0 && r[col('workout_id')]) || `${r[col('workout_name')]}|${completedAt}`;
    const w = map.get(key) ?? { id: col('workout_id') >= 0 && r[col('workout_id')] ? r[col('workout_id')] : uid(), name: (r[col('workout_name')] || 'Imported workout').replace(/^'/, ''), startedAt: Number.isFinite(startedRaw) ? startedRaw : completedAt, completedAt, exercises: [], updatedAt: Date.now() };
    map.set(key, w);
    let exId = col('exercise_id') >= 0 ? r[col('exercise_id')] : '';
    if (!exId) exId = slug(name);
    if (!known(exId) && !custom.has(exId)) custom.set(exId, { id: exId, name, primary: [], secondary: [], equipment: 'other', category: 'isolation', mode: 'strength', custom: true, steps: ['Imported from a CSV file.'], form: [], updatedAt: Date.now() });
    let e = w.exercises[w.exercises.length - 1];
    if (!e || e.exerciseId !== exId) { e = { id: uid(), exerciseId: exId, sets: [], notes: col('notes') >= 0 ? r[col('notes')] || undefined : undefined }; w.exercises.push(e); }
    const type = (['warmup', 'normal', 'drop', 'failure'].includes(r[col('set_type')]) ? r[col('set_type')] : 'normal') as WorkoutSet['type'];
    const rpe = opt(r[col('rpe')]);
    e.sets.push({ id: uid(), type, done: true, kg: opt(r[col('weight_kg')]), reps: opt(r[col('reps')]), seconds: opt(r[col('seconds')]), meters: opt(r[col('meters')]), rpe: rpe !== undefined && rpe >= 1 && rpe <= 10 ? rpe : undefined });
  });
  return { workouts: [...map.values()], customExercises: [...custom.values()], errors };
}
