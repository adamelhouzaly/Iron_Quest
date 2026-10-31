export type SetType = 'warmup' | 'normal' | 'drop' | 'failure';
export type TrackingMode = 'strength' | 'bodyweight' | 'timed' | 'cardio';
export type GroupType = 'superset' | 'circuit';
export type Unit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';

export type Muscle =
  | 'chest' | 'lats' | 'upper-back' | 'lower-back' | 'traps' | 'front-delts' | 'side-delts' | 'rear-delts'
  | 'biceps' | 'triceps' | 'forearms' | 'abs' | 'obliques' | 'quads' | 'hamstrings' | 'glutes' | 'calves'
  | 'adductors' | 'abductors' | 'cardio';

export type Equipment =
  | 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'kettlebell' | 'band' | 'ez-bar'
  | 'smith' | 'trap-bar' | 'cardio-machine' | 'none' | 'other';

export type Category = 'push' | 'pull' | 'squat' | 'hinge' | 'lunge' | 'carry' | 'core' | 'isolation' | 'cardio' | 'calisthenics';

export interface Exercise {
  id: string;
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  category: Category;
  mode: TrackingMode;
  /** Numbered, plain-language execution steps. */
  steps: string[];
  /** Form cues and common mistakes. */
  form: string[];
  custom?: boolean;
  updatedAt?: number;
}

/** All stored loads are kilograms and distances are metres; display conversion happens at the UI edge. */
export interface WorkoutSet {
  id: string;
  type: SetType;
  kg?: number;
  reps?: number;
  seconds?: number;
  meters?: number;
  rpe?: number;
  done: boolean;
  doneAt?: number;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  notes?: string;
  groupId?: string;
  groupType?: GroupType;
  restSec?: number;
  /** Rep range target carried from the routine, used by the overload engine. */
  targetRepsMin?: number;
  targetRepsMax?: number;
  sets: WorkoutSet[];
}

/** A session imported from the original single-file app: totals only, no per-set records exist. */
export interface LegacySummary {
  volumeKg: number;
  completedSets: number;
  xpEarned: number;
  newPRs: { name: string; kg: number; reps: number; e1rmKg: number }[];
}

export interface Workout {
  id: string;
  name: string;
  routineId?: string;
  startedAt: number;
  completedAt: number;
  notes?: string;
  exercises: WorkoutExercise[];
  legacy?: LegacySummary;
  updatedAt: number;
}

export interface ActiveWorkout {
  id: string;
  name: string;
  routineId?: string;
  startedAt: number;
  notes?: string;
  exercises: WorkoutExercise[];
  rest?: { endsAt: number; total: number; label: string } | null;
  updatedAt: number;
}

export interface RoutineSet {
  type: SetType;
  repsMin?: number;
  repsMax?: number;
  kg?: number;
  seconds?: number;
  meters?: number;
  rpe?: number;
}

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  notes?: string;
  groupId?: string;
  groupType?: GroupType;
  restSec?: number;
  sets: RoutineSet[];
}

export interface Routine {
  id: string;
  name: string;
  folderId?: string;
  notes?: string;
  /** Weekdays this routine is scheduled on: 0 = Monday … 6 = Sunday. */
  days: number[];
  exercises: RoutineExercise[];
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  /** A program is a folder with a description and an intended sequence. */
  isProgram?: boolean;
  description?: string;
  updatedAt: number;
}

export interface BodyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg?: number;
  bodyFat?: number;
  /** Girths in centimetres, keyed by site. */
  measures?: Partial<Record<MeasureSite, number>>;
  notes?: string;
  updatedAt: number;
}
export type MeasureSite = 'neck' | 'chest' | 'waist' | 'hips' | 'arm' | 'forearm' | 'thigh' | 'calf';

/** Metadata only; image bytes live in the local `blobs` store and never sync. */
export interface PhotoEntry {
  id: string;
  date: string;
  pose: 'front' | 'side' | 'back' | 'other';
  notes?: string;
  updatedAt: number;
}

export type GoalKind = 'workouts-week' | 'e1rm' | 'bodyweight' | 'volume-month' | 'overload';
export interface Goal {
  id: string;
  kind: GoalKind;
  title: string;
  exerciseId?: string;
  /** workouts/week, kg e1RM, kg body weight, or kg/month. Unused for 'overload'. */
  target?: number;
  /** Start of the goal, ms. */
  startedAt: number;
  updatedAt: number;
}

export interface Profile {
  id: 'me';
  name: string;
  motto?: string;
  avatarSeed?: number;
  equipped: { armor: string; accent: string; relic: string };
  title?: string;
  skills: string[];
  onboarded: boolean;
  updatedAt: number;
}

export interface Settings {
  id: 'me';
  unit: Unit;
  distance: DistanceUnit;
  defaultRestSec: number;
  autoRest: boolean;
  restSound: boolean;
  restVibrate: boolean;
  barKg: number;
  plates: number[];
  remindersOn: boolean;
  reminderHour: number;
  reducedEffects: boolean;
  updatedAt: number;
}

export interface LegacyPR {
  exerciseId: string;
  kg: number;
  reps: number;
  e1rmKg: number;
  date: number;
}

/** Extra facts carried over from v1 that cannot be re-derived from per-set records. */
export interface LegacyImport {
  id: 'me';
  prs: LegacyPR[];
  carryXp: number;
  carrySets: number;
  carryVolumeKg: number;
  importedAt: number;
  updatedAt: number;
}

export interface Collections {
  workouts: Workout;
  routines: Routine;
  folders: Folder;
  exercises: Exercise;
  body: BodyEntry;
  photos: PhotoEntry;
  goals: Goal;
  profile: Profile;
  settings: Settings;
  legacy: LegacyImport;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ['workouts', 'routines', 'folders', 'exercises', 'body', 'photos', 'goals', 'profile', 'settings', 'legacy'];

export interface Tombstone { collection: CollectionName; id: string; updatedAt: number }
