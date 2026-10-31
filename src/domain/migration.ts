import type { Exercise, LegacyImport, LegacyPR, Workout } from './types';
import { LB_PER_KG, hash, slug } from './util';

export const V1_KEY = 'ironQuestDataV1';
const lbToKg = (v: unknown) => (Number(v) || 0) / LB_PER_KG;

export interface MigrationResult {
  workouts: Workout[];
  legacy: LegacyImport;
  customExercises: Exercise[];
  skipped: number;
}

/**
 * Converts the original app's localStorage payload. The source key is left in place: nothing
 * here deletes it, so a failed upgrade can always be re-run. v1 stored totals and PR bests in
 * pounds and never per-set records, so those sessions come through as summaries.
 * Ids are deterministic, which makes re-running idempotent.
 */
export function migrateV1(raw: string | null, known: (id: string) => boolean, now = Date.now()): MigrationResult | null {
  if (!raw) return null;
  let data: any;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object') return null;

  const history: any[] = Array.isArray(data.history) ? data.history : [];
  const custom = new Map<string, Exercise>();
  const resolve = (name: string) => {
    const id = slug(name);
    if (!known(id) && !custom.has(id)) custom.set(id, {
      id, name, primary: [], secondary: [], equipment: 'other', category: 'isolation', mode: 'strength', custom: true, updatedAt: now,
      steps: ['Imported from your earlier Iron Quest data. Edit this exercise to add details.'], form: [],
    });
    return id;
  };

  let skipped = 0;
  const seen = new Set<string>();
  const workouts: Workout[] = [];
  history.forEach((h, i) => {
    const t = new Date(h?.completedAt).getTime();
    if (!Number.isFinite(t)) { skipped++; return; }
    let id = `v1-${hash(`${h.completedAt}|${h.split}`).toString(36)}`;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const prs = Array.isArray(h.newPRs) ? h.newPRs : [];
    workouts.push({
      id, name: `${typeof h.split === 'string' && h.split ? h.split : 'Imported'} Day`, startedAt: t, completedAt: t, exercises: [], updatedAt: now,
      legacy: {
        volumeKg: lbToKg(h.volume), completedSets: Number(h.completedSets) || 0, xpEarned: Number(h.xpEarned) || 0,
        newPRs: prs.filter((p: any) => typeof p?.name === 'string').map((p: any) => ({ name: p.name, kg: lbToKg(p.weight), reps: Number(p.reps) || 0, e1rmKg: lbToKg(p.e1rm) })),
      },
    });
  });

  const prs: LegacyPR[] = Object.entries<any>(data.prs && typeof data.prs === 'object' ? data.prs : {}).flatMap(([name, p]) => {
    if (!p || !(Number(p.e1rm) > 0)) return [];
    const date = new Date(p.date).getTime();
    return [{ exerciseId: resolve(name), kg: lbToKg(p.weight), reps: Number(p.reps) || 0, e1rmKg: lbToKg(p.e1rm), date: Number.isFinite(date) ? date : now }];
  });

  const sum = <K extends 'xpEarned' | 'completedSets' | 'volumeKg'>(k: K) => workouts.reduce((n, w) => n + (w.legacy?.[k] as number), 0);
  return {
    workouts, skipped, customExercises: [...custom.values()],
    legacy: {
      id: 'me', prs, importedAt: now, updatedAt: now,
      // Totals v1 knew about beyond the surviving history rows (e.g. pruned entries) are preserved, not lost.
      carryXp: Math.max(0, (Number(data.xp) || 0) - sum('xpEarned')),
      carrySets: Math.max(0, (Number(data.totalSets) || 0) - sum('completedSets')),
      carryVolumeKg: Math.max(0, lbToKg(data.totalVolume) - sum('volumeKg')),
    },
  };
}
