import type { Folder, Routine, RoutineExercise, SetType } from '@/domain/types';
import { uid } from '@/domain/util';
import { slug } from '@/domain/util';

type Row = [name: string, sets: number, min: number, max: number, rest?: number];
interface Day { name: string; days: number[]; rows: Row[] }
export interface ProgramTemplate { key: string; name: string; description: string; perWeek: string; level: string; routines: Day[] }

export const PROGRAMS: ProgramTemplate[] = [
  { key: 'ppl', name: 'Push / Pull / Legs', perWeek: '3–6 days', level: 'Intermediate', description: 'The classic split: organise by movement, run it three days a week or repeat it for six.', routines: [
    { name: 'Push Day', days: [0, 3], rows: [['Barbell Bench Press', 4, 5, 8, 150], ['Overhead Press', 3, 6, 10, 120], ['Incline Dumbbell Press', 3, 8, 12, 90], ['Lateral Raise', 3, 12, 20, 60], ['Triceps Pushdown', 3, 10, 15, 60]] },
    { name: 'Pull Day', days: [1, 4], rows: [['Pull-Up', 4, 5, 10, 150], ['Barbell Row', 3, 6, 10, 120], ['Lat Pulldown', 3, 8, 12, 90], ['Face Pull', 3, 12, 20, 60], ['Dumbbell Curl', 3, 8, 12, 60]] },
    { name: 'Legs Day', days: [2, 5], rows: [['Barbell Squat', 4, 5, 8, 180], ['Romanian Deadlift', 3, 6, 10, 150], ['Leg Press', 3, 8, 12, 120], ['Leg Curl', 3, 10, 15, 60], ['Standing Calf Raise', 4, 10, 15, 60]] },
  ] },
  { key: 'ul', name: 'Upper / Lower', perWeek: '4 days', level: 'Beginner–Intermediate', description: 'Train everything twice a week with a clear heavy focus each session.', routines: [
    { name: 'Upper A', days: [0], rows: [['Barbell Bench Press', 4, 5, 8, 150], ['Barbell Row', 4, 6, 10, 120], ['Overhead Press', 3, 8, 10, 90], ['Lat Pulldown', 3, 8, 12, 90], ['Hammer Curl', 2, 10, 12, 60], ['Triceps Pushdown', 2, 10, 12, 60]] },
    { name: 'Lower A', days: [1], rows: [['Barbell Squat', 4, 5, 8, 180], ['Romanian Deadlift', 3, 8, 10, 120], ['Leg Press', 3, 10, 12, 90], ['Leg Curl', 3, 10, 15, 60], ['Seated Calf Raise', 3, 12, 15, 60]] },
    { name: 'Upper B', days: [3], rows: [['Incline Dumbbell Press', 4, 8, 12, 90], ['Chest-Supported Row', 4, 8, 12, 90], ['Dumbbell Shoulder Press', 3, 8, 12, 90], ['Pull-Up', 3, 6, 10, 120], ['Lateral Raise', 3, 12, 20, 60], ['Dumbbell Curl', 2, 10, 15, 60]] },
    { name: 'Lower B', days: [4], rows: [['Deadlift', 3, 3, 6, 240], ['Front Squat', 3, 6, 10, 150], ['Walking Lunge', 3, 10, 12, 90], ['Leg Extension', 3, 10, 15, 60], ['Hanging Leg Raise', 3, 8, 15, 60]] },
  ] },
  { key: 'fb', name: 'Full Body', perWeek: '3 days', level: 'Beginner', description: 'Three efficient sessions that hit the whole body with room to recover.', routines: [
    { name: 'Full Body A', days: [0], rows: [['Barbell Squat', 3, 5, 8, 150], ['Barbell Bench Press', 3, 5, 8, 150], ['Barbell Row', 3, 8, 10, 120], ['Plank', 3, 30, 60, 60]] },
    { name: 'Full Body B', days: [2], rows: [['Romanian Deadlift', 3, 8, 10, 120], ['Overhead Press', 3, 6, 10, 120], ['Lat Pulldown', 3, 8, 12, 90], ['Walking Lunge', 2, 10, 12, 90]] },
    { name: 'Full Body C', days: [4], rows: [['Leg Press', 3, 8, 12, 120], ['Incline Dumbbell Press', 3, 8, 12, 90], ['Seated Cable Row', 3, 8, 12, 90], ['Hanging Leg Raise', 3, 8, 15, 60]] },
  ] },
  { key: 'strength', name: 'Foundation Strength', perWeek: '3 days', level: 'Beginner', description: 'Alternate two simple barbell sessions and add load in small, steady steps.', routines: [
    { name: 'Foundation A', days: [0, 4], rows: [['Barbell Squat', 5, 5, 5, 180], ['Barbell Bench Press', 5, 5, 5, 180], ['Barbell Row', 5, 5, 5, 150]] },
    { name: 'Foundation B', days: [2], rows: [['Barbell Squat', 5, 5, 5, 180], ['Overhead Press', 5, 5, 5, 180], ['Deadlift', 1, 5, 5, 240]] },
  ] },
  { key: 'calisthenics', name: 'Bodyweight Foundations', perWeek: '3 days', level: 'All levels', description: 'No gym needed. Bars help, and every movement scales up or down.', routines: [
    { name: 'Calisthenics A', days: [0, 4], rows: [['Pull-Up', 4, 5, 10, 120], ['Push-Up', 4, 8, 20, 90], ['Bodyweight Squat', 4, 15, 25, 60], ['Plank', 3, 30, 60, 60]] },
    { name: 'Calisthenics B', days: [2], rows: [['Inverted Row', 4, 8, 15, 90], ['Pike Push-Up', 4, 6, 12, 90], ['Reverse Lunge', 3, 10, 15, 60], ['Hollow Hold', 3, 20, 40, 60]] },
  ] },
  { key: 'conditioning', name: 'Engine Builder', perWeek: '2–3 days', level: 'All levels', description: 'Steady cardio and simple conditioning to pair with lifting, or to use alone.', routines: [
    { name: 'Steady Engine', days: [1], rows: [['Rowing Machine', 1, 0, 0, 60], ['Incline Walk', 1, 0, 0, 60]] },
    { name: 'Circuit Engine', days: [3], rows: [['Kettlebell Swing', 4, 15, 20, 60], ['Burpee', 4, 8, 12, 60], ['Mountain Climber', 4, 30, 45, 60]] },
  ] },
];

const TIMED_NAMES = new Set(['Plank', 'Hollow Hold', 'Mountain Climber']);

function toRoutineExercise([name, sets, min, max, rest]: Row): RoutineExercise {
  const timed = TIMED_NAMES.has(name);
  const type: SetType = 'normal';
  return {
    id: uid(), exerciseId: slug(name), restSec: rest,
    sets: Array.from({ length: sets }, () => timed ? { type, seconds: max } : max ? { type, repsMin: min, repsMax: max } : { type }),
  };
}

/** Instantiates a template into the user's own folder and routines, with fresh ids. */
export function instantiateProgram(t: ProgramTemplate): { folder: Folder; routines: Routine[] } {
  const now = Date.now();
  const folder: Folder = { id: uid(), name: t.name, isProgram: true, description: t.description, updatedAt: now };
  return { folder, routines: t.routines.map((d) => ({ id: uid(), name: d.name, folderId: folder.id, days: d.days, updatedAt: now, exercises: d.rows.map(toRoutineExercise) })) };
}
