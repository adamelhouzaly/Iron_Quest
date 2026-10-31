import type { DistanceUnit, Unit } from './types';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const LB_PER_KG = 2.2046226218;
export const M_PER_MI = 1609.344;

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const round = (n: number, dp = 2) => { const f = 10 ** dp; return Math.round(n * f) / f; };

/** Stored kg → display unit. Rounded so 225 lb entered round-trips to exactly 225. */
export const toDisplay = (kg: number, unit: Unit) => round(unit === 'kg' ? kg : kg * LB_PER_KG, 2);
export const toKg = (value: number, unit: Unit) => (unit === 'kg' ? value : value / LB_PER_KG);
export const metersToDisplay = (m: number, d: DistanceUnit) => round(d === 'km' ? m / 1000 : m / M_PER_MI, 2);
export const displayToMeters = (v: number, d: DistanceUnit) => (d === 'km' ? v * 1000 : v * M_PER_MI);

export const fmt = (n: number, dp = 0) => n.toLocaleString(undefined, { maximumFractionDigits: dp });
export const fmtWeight = (kg: number, unit: Unit, dp = 1) => `${fmt(toDisplay(kg, unit), dp)} ${unit}`;
/** Large aggregate volumes read better compact: 12.4k lb. */
export const fmtVolume = (kg: number, unit: Unit) => {
  const v = toDisplay(kg, unit);
  return v >= 100_000 ? `${fmt(v / 1000, 0)}k ${unit}` : v >= 10_000 ? `${fmt(v / 1000, 1)}k ${unit}` : `${fmt(v)} ${unit}`;
};
export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
export const fmtDuration = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

// ---- Dates: everything groups on the user's LOCAL calendar, not UTC. ----
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (t: number | Date) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const parseDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const startOfDay = (t: number | Date) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
/** Monday-based weekday: 0 = Monday … 6 = Sunday. */
export const weekday = (t: number | Date) => (new Date(t).getDay() + 6) % 7;
export const startOfWeek = (t: number | Date) => { const d = startOfDay(t); d.setDate(d.getDate() - weekday(d)); return d; };
export const weekKey = (t: number | Date) => dayKey(startOfWeek(t));
export const monthKey = (t: number | Date) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const addDays = (t: number | Date, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d; };
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const fmtDate = (t: number | Date, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(t).toLocaleDateString(undefined, opts);

export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
