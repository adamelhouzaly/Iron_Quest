import { useMemo } from 'react';
import { EXERCISES, EXERCISE_BY_ID } from '@/data/exercises';
import { computeProgress } from '@/domain/progression';
import { lastPerformances } from '@/domain/records';
import { streaks, totals } from '@/domain/analytics';
import type { Exercise } from '@/domain/types';
import { useStore } from './store';

export function useLookup() {
  const custom = useStore((s) => s.customExercises);
  return useMemo(() => {
    const map = new Map(custom.map((e) => [e.id, e]));
    return (id: string): Exercise | undefined => map.get(id) ?? EXERCISE_BY_ID.get(id);
  }, [custom]);
}

export function useAllExercises() {
  const custom = useStore((s) => s.customExercises);
  return useMemo(() => [...custom, ...EXERCISES].sort((a, b) => a.name.localeCompare(b.name)), [custom]);
}

export const exerciseName = (lookup: (id: string) => Exercise | undefined, id: string) => lookup(id)?.name ?? 'Deleted exercise';

/** Single entry point for derived character state: recomputed from the log whenever the log changes. */
export function useProgress() {
  const workouts = useStore((s) => s.workouts);
  const goals = useStore((s) => s.goals);
  const legacy = useStore((s) => s.legacy);
  const profile = useStore((s) => s.profile);
  const lookup = useLookup();
  return useMemo(() => computeProgress({ workouts, goals, legacy, profile, lookup }), [workouts, goals, legacy, profile, lookup]);
}

export function useTotals() {
  const workouts = useStore((s) => s.workouts);
  const legacy = useStore((s) => s.legacy);
  return useMemo(() => totals(workouts, legacy ? { sets: legacy.carrySets, volumeKg: legacy.carryVolumeKg } : undefined), [workouts, legacy]);
}

export function useStreaks() {
  const workouts = useStore((s) => s.workouts);
  return useMemo(() => streaks(workouts), [workouts]);
}

export function useLastPerformances() {
  const workouts = useStore((s) => s.workouts);
  return useMemo(() => lastPerformances(workouts), [workouts]);
}
