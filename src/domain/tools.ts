import { round } from './util';

export function plateBreakdown(target: number, bar: number, plates: number[]) {
  let perSide = Math.max(0, (target - bar) / 2);
  const out: { plate: number; count: number }[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const n = Math.floor((perSide + 1e-9) / p);
    if (n > 0) { out.push({ plate: p, count: n }); perSide = round(perSide - n * p, 4); }
  }
  const loaded = bar + 2 * out.reduce((s, x) => s + x.plate * x.count, 0);
  return { plates: out, loaded: round(loaded, 3), remainder: round(target - loaded, 3), belowBar: target < bar };
}

export function warmupSets(workKg: number, bar: number, step: number) {
  const scheme = [
    { pct: 0, reps: 10, label: 'Empty bar' },
    { pct: 0.4, reps: 8, label: '40%' },
    { pct: 0.6, reps: 5, label: '60%' },
    { pct: 0.75, reps: 3, label: '75%' },
    { pct: 0.9, reps: 1, label: '90%' },
  ];
  const seen = new Set<number>();
  return scheme.flatMap((s) => {
    const kg = s.pct === 0 ? bar : Math.max(bar, Math.round((workKg * s.pct) / step) * step);
    if (kg >= workKg || seen.has(kg)) return [];
    seen.add(kg);
    return [{ ...s, kg: round(kg, 2) }];
  });
}

/** Common 1RM estimators. They diverge at higher reps, which is why we show the range. */
export const ORM_FORMULAS = {
  Epley: (w: number, r: number) => (r === 1 ? w : w * (1 + r / 30)),
  Brzycki: (w: number, r: number) => (r >= 37 ? NaN : (w * 36) / (37 - r)),
  Lombardi: (w: number, r: number) => w * r ** 0.1,
};
export const pctOf1RM = (reps: number) => 1 / (1 + reps / 30);
