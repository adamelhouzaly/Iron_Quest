import { create } from 'zustand';
import { COLLECTIONS, type ActiveWorkout, type BodyEntry, type CollectionName, type Collections, type Exercise, type Folder, type Goal, type PhotoEntry, type Profile, type Routine, type Settings, type Workout } from '@/domain/types';
import { migrateV1, V1_KEY } from '@/domain/migration';
import { EXERCISE_BY_ID } from '@/data/exercises';
import * as db from '@/services/db';

export const defaultSettings = (unit: Settings['unit'] = 'kg'): Settings => ({
  id: 'me', unit, distance: unit === 'lb' ? 'mi' : 'km', defaultRestSec: 90, autoRest: true, restSound: true, restVibrate: true,
  barKg: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], remindersOn: false, reminderHour: 18, reducedEffects: false, updatedAt: 0,
});
export const defaultProfile = (): Profile => ({
  id: 'me', name: '', equipped: { armor: 'auto', accent: 'ember', relic: 'none' }, skills: [], onboarded: false, updatedAt: 0,
});

export interface ToastMsg { id: number; kind: 'info' | 'success' | 'error' | 'pr'; text: string; detail?: string; action?: { label: string; run: () => void } }

interface State {
  ready: boolean;
  storageError: string | null;
  workouts: Workout[]; routines: Routine[]; folders: Folder[]; customExercises: Exercise[]; body: BodyEntry[]; photos: PhotoEntry[]; goals: Goal[];
  profile: Profile; settings: Settings; legacy: Collections['legacy'] | null;
  active: ActiveWorkout | null;
  migrated: { sessions: number; skipped: number } | null;
  toasts: ToastMsg[];
  boot: () => Promise<void>;
  reload: () => Promise<void>;
  save: <C extends CollectionName>(c: C, rec: Collections[C]) => Promise<void>;
  remove: (c: CollectionName, id: string) => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  setActive: (a: ActiveWorkout | null) => void;
  toast: (t: Omit<ToastMsg, 'id'>) => void;
  dismissToast: (id: number) => void;
  dismissMigration: () => void;
}

const stateKey: Partial<Record<CollectionName, keyof State>> = {
  workouts: 'workouts', routines: 'routines', folders: 'folders', exercises: 'customExercises', body: 'body', photos: 'photos', goals: 'goals',
};
let toastId = 1;

export const useStore = create<State>((set, get) => ({
  ready: false, storageError: null,
  workouts: [], routines: [], folders: [], customExercises: [], body: [], photos: [], goals: [],
  profile: defaultProfile(), settings: defaultSettings(), legacy: null, active: null, migrated: null, toasts: [],

  async boot() {
    if (get().ready) return;
    // Ask the browser to keep our data even under storage pressure. Best-effort.
    navigator.storage?.persist?.().catch(() => undefined);
    await runV1Migration(set);
    await get().reload();
    try { set({ active: await db.loadDraft() }); } catch { /* no draft */ }
    if (db.storageFailed) set({ storageError: 'This browser is blocking local storage, so nothing will be saved. Leave private browsing or allow site data, and export anything you log.' });
    set({ ready: true });
  },

  async reload() {
    const all = await db.loadAll();
    const hadV1 = !!safeLS(V1_KEY);
    const unitGuess: Settings['unit'] = hadV1 || navigator.language === 'en-US' ? 'lb' : 'kg';
    set({
      workouts: all.workouts, routines: all.routines, folders: all.folders, customExercises: all.exercises, body: all.body, photos: all.photos, goals: all.goals,
      profile: all.profile[0] ? { ...defaultProfile(), ...all.profile[0] } : defaultProfile(),
      settings: all.settings[0] ? { ...defaultSettings(all.settings[0].unit), ...all.settings[0] } : defaultSettings(unitGuess),
      legacy: all.legacy[0] ?? null,
    });
  },

  // Durable first: the screen only shows a record once the database has committed it, so
  // "saved" on screen always means saved on disk, even if the tab closes a moment later.
  async save(c, rec) {
    const stamped = { ...rec, updatedAt: Date.now() } as Collections[typeof c] & { id: string; updatedAt: number };
    try { await db.putRecord(c, stamped); schedulePush(); }
    catch (e) { persistFailed(set, get, e); throw e; }
    const k = stateKey[c];
    if (k) set((s) => ({ [k]: [...(s[k] as { id: string }[]).filter((r) => r.id !== stamped.id), stamped] }) as Partial<State>);
  },

  async remove(c, id) {
    try { await db.deleteRecord(c, id); schedulePush(); }
    catch (e) { persistFailed(set, get, e); throw e; }
    const k = stateKey[c];
    if (k) set((s) => ({ [k]: (s[k] as { id: string }[]).filter((r) => r.id !== id) }) as Partial<State>);
  },

  async saveProfile(patch) {
    const profile = { ...get().profile, ...patch, updatedAt: Date.now() };
    set({ profile });
    try { await db.putRecord('profile', profile); schedulePush(); } catch (e) { persistFailed(set, get, e); }
  },
  async saveSettings(patch) {
    const settings = { ...get().settings, ...patch, updatedAt: Date.now() };
    set({ settings });
    try { await db.putRecord('settings', settings); schedulePush(); } catch (e) { persistFailed(set, get, e); }
  },

  setActive(a) {
    const stamped = a ? { ...a, updatedAt: Date.now() } : null;
    set({ active: stamped });
    void db.saveDraft(stamped);
  },

  toast(t) {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 9000 : t.action ? 7000 : t.kind === 'pr' ? 5000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissMigration: () => set({ migrated: null }),
}));

function persistFailed(set: (p: Partial<State>) => void, get: () => State, e: unknown) {
  console.warn('save failed', e);
  const msg = 'Your last change could not be saved to this device. Export your data from Settings before closing this tab.';
  set({ storageError: msg });
  get().toast({ kind: 'error', text: 'Save failed', detail: msg });
}

const safeLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

async function runV1Migration(set: (p: Partial<State>) => void) {
  const raw = safeLS(V1_KEY);
  if (!raw) return;
  try {
    if (await db.getMeta('migratedV1')) return;
    const result = migrateV1(raw, (id) => EXERCISE_BY_ID.has(id));
    if (!result) return;
    const now = Date.now();
    const rows: db.RawRecord[] = [
      ...result.workouts.map((w) => ({ collection: 'workouts' as const, id: w.id, updatedAt: now, data: w })),
      ...result.customExercises.map((e) => ({ collection: 'exercises' as const, id: e.id, updatedAt: now, data: e })),
      { collection: 'legacy' as const, id: 'me', updatedAt: now, data: result.legacy },
    ];
    await db.putMany(rows);
    // Marked done only after the transaction commits. The v1 key itself is intentionally left untouched.
    await db.setMeta('migratedV1', { at: now, sessions: result.workouts.length });
    if (result.workouts.length) set({ migrated: { sessions: result.workouts.length, skipped: result.skipped } });
  } catch (e) {
    console.warn('v1 migration deferred', e); // Source data is untouched; retried next launch.
  }
}

// --- wired to the sync engine only when cloud is configured, to keep it out of the local-only path.
let pushHook: (() => void) | null = null;
export const setPushHook = (fn: (() => void) | null) => { pushHook = fn; };
const schedulePush = () => pushHook?.();

export const allCollections = COLLECTIONS;
