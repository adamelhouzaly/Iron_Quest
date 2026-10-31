import type { Exercise, Goal, LegacyImport, Muscle, Profile, Workout } from './types';
import { buildRecordBook, chronological, e1rm, isHard, type RecordBook } from './records';
import { muscleSets, streaks, workoutDuration, workoutSets, workoutVolume } from './analytics';
import { addDays, clamp, dayKey, hash, startOfWeek, weekKey } from './util';

/**
 * THE XP RULES. All character progress is a pure replay of saved workouts — nothing is stored,
 * so editing or deleting a session recalculates everything, and there is no number to tamper with
 * except by changing the training log itself.
 *
 *  Anti-spam: XP rewards plausible training, not volume of clicks.
 *   - Sets are credited at most 1.5 per minute of session time, and at most 40 per session.
 *   - Sets 21+ earn half. Warm-ups earn 1 XP (first five only).
 *   - Completion bonus needs 3+ credited sets and 10+ minutes.
 *   - The second session in a day earns 50%, later ones 10%.
 *   - PR XP needs a previous baseline, is capped at 3 exercises per session, and is withheld for
 *     jumps over 30% (those are still shown as records, but they look like typos).
 *   - Load is deliberately worth nothing: a 40 kg lifter and a 200 kg lifter level at the same pace.
 *  Encouragement: nothing ever subtracts. A rest day, or a month off, costs no XP.
 */
export const XP = {
  SET: 6, SET_LATE: 3, SET_FULL_LIMIT: 20, SET_CAP: 40, SETS_PER_MIN: 1.5, WARMUP: 1, WARMUP_CAP: 5,
  COMPLETE: 40, COMPLETE_MIN_SETS: 3, COMPLETE_MIN_MINUTES: 10,
  PR: 20, PR_CAP: 3, PR_MAX_JUMP: 1.3, ROUTINE: 15,
  WEEK_RHYTHM: [10, 15, 25],
  W_THREE: 100, W_SETS: 60, W_SETS_TARGET: 30, W_PR: 50, W_ROUTINE: 40, DAILY: 25, OVERLOAD: 150,
} as const;

export interface XPItem { label: string; xp: number }
export interface LedgerEntry { id: string; at: number; workoutId?: string; title: string; total: number; items: XPItem[]; notes: string[] }

export const xpToNext = (level: number) => 300 + 60 * (level - 1);
export function levelFromXp(xp: number) {
  let level = 1, left = Math.max(0, xp);
  while (left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: xpToNext(level), pct: (left / xpToNext(level)) * 100 };
}

export const TITLES: { level: number; name: string }[] = [
  { level: 1, name: 'Initiate' }, { level: 3, name: 'Ash Walker' }, { level: 5, name: 'Ironbound' }, { level: 8, name: 'Forge Hand' }, { level: 10, name: 'Vanguard' },
  { level: 15, name: 'Plate Bearer' }, { level: 20, name: 'Warden' }, { level: 28, name: 'Siege Breaker' }, { level: 35, name: 'Titan' }, { level: 50, name: 'Mythic Colossus' }, { level: 75, name: 'Undying' },
];
export const ARMORS = [
  { id: 'recruit', name: 'Recruit Rig', level: 1, tier: 0, blurb: 'Salvaged plates and a cracked visor. Everyone starts here.' },
  { id: 'ironclad', name: 'Ironclad Frame', level: 5, tier: 1, blurb: 'Reinforced shoulders, forged from your first real weeks.' },
  { id: 'vanguard', name: 'Vanguard Plate', level: 10, tier: 2, blurb: 'A proper chestplate and a reactor that holds its charge.' },
  { id: 'warden', name: 'Warden Exo', level: 20, tier: 3, blurb: 'Heavy pauldrons and a mantle. People notice.' },
  { id: 'titan', name: 'Titan Shell', level: 35, tier: 4, blurb: 'Layered siege armour. The reactor burns white-hot.' },
  { id: 'mythic', name: 'Mythic Colossus', level: 50, tier: 5, blurb: 'A crown of arcs. Earned by years, not luck.' },
];
export const ACCENTS = [
  { id: 'ember', name: 'Ember', color: '#ff6b2c', need: 'Default' },
  { id: 'crimson', name: 'Crimson', color: '#e0364c', need: 'Reach level 3', level: 3 },
  { id: 'arc', name: 'Arc', color: '#5cc8ff', need: 'Hold an 8-week streak', achievement: 'streak-8' },
  { id: 'silver', name: 'Silversteel', color: '#d6dbe3', need: 'Complete 100 workouts', achievement: 'workouts-100' },
  { id: 'solar', name: 'Solar', color: '#ffc24b', need: 'Reach level 25', level: 25 },
];
export const RELICS = [
  { id: 'none', name: 'None', need: 'Default' },
  { id: 'hammer', name: 'Forge Hammer', need: 'Log your first PR', achievement: 'pr-1' },
  { id: 'banner', name: 'War Banner', need: 'Train 26 weeks in a row', achievement: 'streak-26' },
  { id: 'halo', name: 'Arc Halo', need: 'Spend a skill point in Will', skill: 'will-1' },
  { id: 'greatshield', name: 'Greatshield', need: 'Lift 100,000 kg total', achievement: 'volume-100k' },
];

export interface SkillNode { id: string; branch: 'iron' | 'wind' | 'will'; name: string; effect: string; requires?: string; title?: string }
/** Skill perks are cosmetic and motivational on purpose; they can't inflate XP. Points refund freely. */
export const SKILLS: SkillNode[] = [
  { id: 'iron-1', branch: 'iron', name: 'Tempered Grip', effect: 'Unlocks the title "Tempered".', title: 'Tempered' },
  { id: 'iron-2', branch: 'iron', name: 'Load Bearer', effect: 'Shows your all-time heaviest lift on the Chamber plinth.', requires: 'iron-1' },
  { id: 'iron-3', branch: 'iron', name: 'Breaker of Plateaus', effect: 'Title "Plateau Breaker".', requires: 'iron-2', title: 'Plateau Breaker' },
  { id: 'wind-1', branch: 'wind', name: 'Second Wind', effect: 'Title "Second Wind".', title: 'Second Wind' },
  { id: 'wind-2', branch: 'wind', name: 'Long Road', effect: 'Shows your total training hours on the Chamber plinth.', requires: 'wind-1' },
  { id: 'wind-3', branch: 'wind', name: 'Tireless', effect: 'Title "The Tireless".', requires: 'wind-2', title: 'The Tireless' },
  { id: 'will-1', branch: 'will', name: 'Quiet Resolve', effect: 'Unlocks the Arc Halo relic.' },
  { id: 'will-2', branch: 'will', name: 'Keeper of Days', effect: 'Shows your best weekly streak on the Chamber plinth.', requires: 'will-1' },
  { id: 'will-3', branch: 'will', name: 'Unbroken', effect: 'Title "Unbroken".', requires: 'will-2', title: 'Unbroken' },
];
export const skillPoints = (level: number) => Math.floor((level - 1) / 2);

export interface RunningStats {
  workouts: number; sets: number; volume: number; prs: number; distinctPrExercises: Set<string>; bestWeeks: number; bestDays: number;
  night: boolean; dawn: boolean; maxSessionVolume: number; longestMin: number; cardioMeters: number; timedSeconds: number; routines: number; muscles: Set<Muscle>;
  exercises: Set<string>; bestE1rm: number; rpeSets: number; supersets: number;
}
export interface Achievement { id: string; name: string; description: string; tier: 'bronze' | 'silver' | 'gold'; glyph: string; check: (s: RunningStats) => boolean; progress?: (s: RunningStats) => [number, number] }

const count = (id: string, name: string, description: string, tier: Achievement['tier'], glyph: string, target: number, get: (s: RunningStats) => number): Achievement =>
  ({ id, name, description, tier, glyph, check: (s) => get(s) >= target, progress: (s) => [Math.min(get(s), target), target] });

// ids first-set … night-warrior are the original badges; they keep their ids and meaning.
export const ACHIEVEMENTS: Achievement[] = [
  count('first-set', 'First Rep', 'Complete your first logged set.', 'bronze', 'spark', 1, (s) => s.sets),
  count('first-workout', 'Quest Started', 'Finish your first workout.', 'bronze', 'gate', 1, (s) => s.workouts),
  count('five-prs', 'Progressive Overload', 'Set personal records on five different exercises.', 'silver', 'chevron', 5, (s) => s.distinctPrExercises.size),
  count('volume-monster', 'Volume Monster', 'Move 22,680 kg (50,000 lb) of total volume.', 'silver', 'anvil', 22680, (s) => s.volume),
  count('iron-streak', 'Iron Streak', 'Train three days in a row.', 'bronze', 'flame', 3, (s) => s.bestDays),
  { id: 'night-warrior', name: 'Night Shift Warrior', description: 'Finish a workout after 8 PM.', tier: 'bronze', glyph: 'moon', check: (s) => s.night },
  { id: 'dawn-patrol', name: 'Dawn Patrol', description: 'Finish a workout before 7 AM.', tier: 'bronze', glyph: 'sun', check: (s) => s.dawn },
  count('workouts-10', 'Ten Battles', 'Complete 10 workouts.', 'bronze', 'gate', 10, (s) => s.workouts),
  count('workouts-25', 'Seasoned', 'Complete 25 workouts.', 'silver', 'gate', 25, (s) => s.workouts),
  count('workouts-50', 'Veteran', 'Complete 50 workouts.', 'silver', 'gate', 50, (s) => s.workouts),
  count('workouts-100', 'Centurion', 'Complete 100 workouts.', 'gold', 'crown', 100, (s) => s.workouts),
  count('workouts-250', 'Legion', 'Complete 250 workouts.', 'gold', 'crown', 250, (s) => s.workouts),
  count('pr-1', 'Beat Yourself', 'Log your first personal record.', 'bronze', 'chevron', 1, (s) => s.prs),
  count('pr-25', 'Record Keeper', 'Log 25 personal records.', 'silver', 'chevron', 25, (s) => s.prs),
  count('pr-100', 'Record Breaker', 'Log 100 personal records.', 'gold', 'chevron', 100, (s) => s.prs),
  count('streak-4', 'A Month Forged', 'Train four weeks in a row.', 'bronze', 'flame', 4, (s) => s.bestWeeks),
  count('streak-8', 'Habit of Steel', 'Train eight weeks in a row.', 'silver', 'flame', 8, (s) => s.bestWeeks),
  count('streak-12', 'The Long Quarter', 'Train twelve weeks in a row.', 'silver', 'flame', 12, (s) => s.bestWeeks),
  count('streak-26', 'Half-Year Oath', 'Train 26 weeks in a row.', 'gold', 'flame', 26, (s) => s.bestWeeks),
  count('streak-52', 'A Year of Iron', 'Train 52 weeks in a row.', 'gold', 'crown', 52, (s) => s.bestWeeks),
  count('volume-100k', 'Mover of Mountains', 'Move 100,000 kg of total volume.', 'silver', 'anvil', 100_000, (s) => s.volume),
  count('volume-1m', 'The Million', 'Move 1,000,000 kg of total volume.', 'gold', 'anvil', 1_000_000, (s) => s.volume),
  count('sets-1000', 'A Thousand Sets', 'Log 1,000 sets.', 'silver', 'spark', 1000, (s) => s.sets),
  count('session-5t', 'Heavy Day', 'Move 5,000 kg in a single session.', 'bronze', 'anvil', 5000, (s) => s.maxSessionVolume),
  count('session-90', 'The Long Haul', 'Train for 90 minutes in a single session.', 'bronze', 'moon', 90, (s) => s.longestMin),
  count('road-42', 'Marathon Road', 'Log 42.2 km of cardio.', 'silver', 'road', 42195, (s) => s.cardioMeters),
  count('hold-10', 'Stillness', 'Accumulate 10 minutes of timed holds.', 'bronze', 'sun', 600, (s) => s.timedSeconds),
  count('routines-10', 'By the Book', 'Complete 10 workouts from saved routines.', 'bronze', 'scroll', 10, (s) => s.routines),
  count('variety-30', 'The Arsenal', 'Log 30 different exercises.', 'silver', 'scroll', 30, (s) => s.exercises.size),
  count('muscles-all', 'Whole Machine', 'Train 15 different muscle groups.', 'silver', 'spark', 15, (s) => s.muscles.size),
  count('rpe-50', 'Honest Effort', 'Log RPE on 50 sets.', 'bronze', 'chevron', 50, (s) => s.rpeSets),
  count('super-10', 'Linked Up', 'Log 10 sets inside supersets or circuits.', 'bronze', 'spark', 10, (s) => s.supersets),
];

// ---------- Quests ----------
export interface QuestView { id: string; scope: 'daily' | 'weekly' | 'long'; title: string; detail: string; xp: number; current: number; target: number; done: boolean; unit?: string }
const DAILY_POOL = [
  { id: 'd-sets', title: 'Ten Honest Sets', detail: 'Log 10 hard sets today.', target: 10, get: (d: DaySummary) => d.hard },
  { id: 'd-minutes', title: 'Half an Hour of Iron', detail: 'Train for 30 minutes today.', target: 30, get: (d: DaySummary) => Math.floor(d.minutes) },
  { id: 'd-groups', title: 'Spread the Load', detail: 'Train 3 muscle groups today.', target: 3, get: (d: DaySummary) => d.muscles },
  { id: 'd-rpe', title: 'Rate the Fight', detail: 'Log RPE on 3 sets today.', target: 3, get: (d: DaySummary) => d.rpe },
];
interface DaySummary { hard: number; minutes: number; muscles: number; rpe: number }
const dailyFor = (key: string) => DAILY_POOL[hash(key) % DAILY_POOL.length];

const LONG_STREAKS: [number, number][] = [[4, 150], [8, 250], [12, 400], [26, 800], [52, 1500]];
const LONG_COUNTS: [number, number][] = [[10, 100], [25, 200], [50, 350], [100, 700], [250, 1500]];

export interface ProgressInput { workouts: Workout[]; lookup: (id: string) => Exercise | undefined; goals: Goal[]; legacy?: LegacyImport | null; profile?: Profile | null; now?: number }
export interface Attribute { key: string; name: string; value: number; description: string }
export interface Unlock { id: string; at: number }
export interface TimelineEvent { at: number; kind: 'level' | 'achievement' | 'pr' | 'first'; title: string; detail?: string }

export interface Progress {
  xp: number; level: ReturnType<typeof levelFromXp>; ledger: LedgerEntry[];
  attributes: Attribute[]; achievements: Map<string, number>; running: RunningStats;
  title: string; quests: QuestView[]; timeline: TimelineEvent[]; records: RecordBook;
  skillPoints: number; skillPointsFree: number; armorTier: number;
  unlockedAccents: Set<string>; unlockedRelics: Set<string>; unlockedArmors: Set<string>; unlockedTitles: string[];
}

const expScore = (x: number, k: number) => Math.round(100 * (1 - Math.exp(-x / k)));

export function computeProgress({ workouts, lookup, goals, legacy, profile, now = Date.now() }: ProgressInput): Progress {
  const list = chronological(workouts).filter((w) => w.completedAt <= now + 86_400_000);
  const records = buildRecordBook(list, (id) => lookup(id)?.mode, legacy);
  const ledger: LedgerEntry[] = [];
  const dayCounts = new Map<string, number>();
  const weekQual = new Map<string, number>();
  const weekHard = new Map<string, number>();
  const weekPR = new Map<string, number>();
  const weekRoutine = new Map<string, boolean>();
  const days = new Map<string, DaySummary>();
  const running: RunningStats = { workouts: 0, sets: legacy?.carrySets ?? 0, volume: legacy?.carryVolumeKg ?? 0, prs: 0, distinctPrExercises: new Set(), bestWeeks: 0, bestDays: 0, night: false, dawn: false, maxSessionVolume: 0, longestMin: 0, cardioMeters: 0, timedSeconds: 0, routines: 0, muscles: new Set(), exercises: new Set(), bestE1rm: 0, rpeSets: 0, supersets: 0 };
  const achievements = new Map<string, number>();
  const timeline: TimelineEvent[] = [];
  const firstE1rm = new Map<string, number>();
  let qualifiedCount = 0;
  let xp = legacy?.carryXp ?? 0;
  const seenWeeks: Workout[] = [];
  if (legacy?.carryXp) ledger.push({ id: 'carry', at: legacy.importedAt, title: 'Carried over from Iron Quest v1', total: legacy.carryXp, items: [{ label: 'v1 balance', xp: legacy.carryXp }], notes: [] });
  for (const p of legacy?.prs ?? []) { running.distinctPrExercises.add(p.exerciseId); running.bestE1rm = Math.max(running.bestE1rm, p.e1rmKg); }

  const addLedger = (e: LedgerEntry) => { if (e.total > 0 || e.notes.length) ledger.push(e); xp += e.total; };

  const creditedByStreak = new Set<number>();
  const creditedByCount = new Set<number>();
  let levelBefore = levelFromXp(xp).level;
  const noteLevels = (at: number) => {
    const l = levelFromXp(xp).level;
    for (let n = levelBefore + 1; n <= l; n++) timeline.push({ at, kind: 'level', title: `Reached level ${n}`, detail: TITLES.find((t) => t.level === n)?.name ? `New title: ${TITLES.find((t) => t.level === n)!.name}` : undefined });
    levelBefore = l;
  };

  for (const w of list) {
    const day = dayKey(w.completedAt), week = weekKey(w.completedAt);
    const items: XPItem[] = [], notes: string[] = [];
    const nthToday = (dayCounts.get(day) ?? 0) + 1;
    dayCounts.set(day, nthToday);
    let qualified = false;
    let prCredit = 0;
    const events = records.byWorkout.get(w.id) ?? [];

    if (w.legacy) {
      if (w.legacy.xpEarned) items.push({ label: 'Earned in Iron Quest v1', xp: w.legacy.xpEarned });
      qualified = w.legacy.completedSets > 0;
      weekHard.set(week, (weekHard.get(week) ?? 0) + w.legacy.completedSets);
      for (const p of w.legacy.newPRs) { running.prs++; running.distinctPrExercises.add(p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }
    } else {
      const minutes = workoutDuration(w) / 60;
      const working = w.exercises.flatMap((e) => e.sets.filter((s) => s.done && s.type !== 'warmup'));
      const warmups = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done && s.type === 'warmup').length, 0);
      const paceCap = Math.max(XP.COMPLETE_MIN_SETS, Math.floor(minutes * XP.SETS_PER_MIN));
      const credited = Math.min(working.length, paceCap, XP.SET_CAP);
      if (credited < working.length) notes.push(paceCap < XP.SET_CAP && credited === paceCap ? `Only ${credited} of ${working.length} sets credited: XP allows ${XP.SETS_PER_MIN} sets per minute of session time.` : `Sets beyond ${XP.SET_CAP} per session earn no XP.`);
      const mult = nthToday === 1 ? 1 : nthToday === 2 ? 0.5 : 0.1;
      if (mult < 1) notes.push(`Session ${nthToday} today: earns ${mult * 100}% of set and completion XP.`);
      const setXp = Math.min(credited, XP.SET_FULL_LIMIT) * XP.SET + Math.max(0, credited - XP.SET_FULL_LIMIT) * XP.SET_LATE;
      if (setXp) items.push({ label: `${credited} working set${credited === 1 ? '' : 's'}`, xp: Math.round(setXp * mult) });
      const wu = Math.min(warmups, XP.WARMUP_CAP) * XP.WARMUP;
      if (wu) items.push({ label: 'Warm-ups', xp: wu });
      qualified = credited >= XP.COMPLETE_MIN_SETS && minutes >= XP.COMPLETE_MIN_MINUTES;
      if (qualified) items.push({ label: 'Session complete', xp: Math.round(XP.COMPLETE * mult) });
      else if (credited > 0) notes.push(`Completion bonus needs ${XP.COMPLETE_MIN_SETS}+ sets and ${XP.COMPLETE_MIN_MINUTES}+ minutes.`);

      const prExercises = new Set<string>();
      for (const ev of events) {
        const genuine = ev.value <= ev.previous * XP.PR_MAX_JUMP;
        if (!genuine && ev.kind === 'e1rm') notes.push(`${lookup(ev.exerciseId)?.name ?? 'Exercise'}: the jump over 30% is recorded as a PR but earns no XP.`);
        if (genuine && ev.kind === 'e1rm' || genuine && !['weight', 'volume'].includes(ev.kind)) prExercises.add(ev.exerciseId);
      }
      prCredit = Math.min(prExercises.size, XP.PR_CAP);
      if (prCredit) items.push({ label: `${prCredit} personal record${prCredit === 1 ? '' : 's'}`, xp: prCredit * XP.PR });
      if (w.routineId && credited >= XP.COMPLETE_MIN_SETS) { items.push({ label: 'Followed a routine', xp: XP.ROUTINE }); weekRoutine.set(week, true); running.routines++; }

      // day summary for the daily quests
      const hard = w.exercises.reduce((n, e) => n + e.sets.filter(isHard).length, 0);
      const groups = new Set(w.exercises.flatMap((e) => (e.sets.some(isHard) ? lookup(e.exerciseId)?.primary ?? [] : [])));
      const ds = days.get(day) ?? { hard: 0, minutes: 0, muscles: 0, rpe: 0 };
      const before = { ...ds };
      ds.hard += Math.min(hard, credited); ds.minutes += minutes; ds.muscles = Math.max(ds.muscles, groups.size);
      ds.rpe += working.filter((s) => s.rpe !== undefined).length;
      days.set(day, ds);
      const q = dailyFor(day);
      if (q.get(before) < q.target && q.get(ds) >= q.target) items.push({ label: `Daily quest: ${q.title}`, xp: XP.DAILY });
      weekHard.set(week, (weekHard.get(week) ?? 0) + Math.min(hard, credited));
      if (prCredit) weekPR.set(week, (weekPR.get(week) ?? 0) + prCredit);

      // running stats
      for (const e of w.exercises) {
        const x = lookup(e.exerciseId);
        const done = e.sets.filter((s) => s.done);
        if (!done.length) continue;
        running.exercises.add(e.exerciseId);
        for (const m of x?.primary ?? []) running.muscles.add(m);
        for (const s of done) {
          running.cardioMeters += s.meters ?? 0;
          if (x?.mode === 'timed') running.timedSeconds += s.seconds ?? 0;
          if (s.rpe !== undefined) running.rpeSets++;
          if (e.groupId) running.supersets++;
          if (s.type !== 'warmup') {
            const v = e1rm(s.kg ?? 0, s.reps ?? 0);
            running.bestE1rm = Math.max(running.bestE1rm, v);
            if (v && !firstE1rm.has(e.exerciseId)) firstE1rm.set(e.exerciseId, v);
          }
        }
      }
      running.longestMin = Math.max(running.longestMin, minutes);
      for (const ev of events) if (ev.kind === 'e1rm' || !['weight', 'volume'].includes(ev.kind)) { running.prs++; running.distinctPrExercises.add(ev.exerciseId); }
    }

    if (qualified) {
      const n = (weekQual.get(week) ?? 0) + 1;
      weekQual.set(week, n);
      qualifiedCount++;
      const rhythm = XP.WEEK_RHYTHM[n - 1];
      if (rhythm && !w.legacy) items.push({ label: `Weekly rhythm: session ${n}`, xp: rhythm });
    }
    const total = items.reduce((s, i) => s + i.xp, 0);
    addLedger({ id: `w-${w.id}`, at: w.completedAt, workoutId: w.id, title: w.name, total, items, notes });

    // running totals + unlocks, evaluated in order so each unlock gets a real date.
    running.workouts++;
    running.sets += workoutSets(w);
    const vol = workoutVolume(w);
    running.volume += vol;
    running.maxSessionVolume = Math.max(running.maxSessionVolume, vol);
    const h = new Date(w.completedAt).getHours();
    if (h >= 20) running.night = true;
    if (h < 7) running.dawn = true;
    seenWeeks.push(w);
    const st = streaks(seenWeeks, w.completedAt);
    running.bestWeeks = Math.max(running.bestWeeks, st.bestWeeks);
    running.bestDays = Math.max(running.bestDays, st.bestDays);

    // Long-term quests pay out when first crossed.
    for (const [need, reward] of LONG_STREAKS) if (running.bestWeeks >= need && !creditedByStreak.has(need)) {
      creditedByStreak.add(need);
      addLedger({ id: `ls-${need}`, at: w.completedAt, title: `Long quest: ${need}-week streak`, total: reward, items: [{ label: `${need} weeks in a row`, xp: reward }], notes: [] });
    }
    for (const [need, reward] of LONG_COUNTS) if (qualifiedCount >= need && !creditedByCount.has(need)) {
      creditedByCount.add(need);
      addLedger({ id: `lc-${need}`, at: w.completedAt, title: `Long quest: ${need} sessions`, total: reward, items: [{ label: `${need} full sessions`, xp: reward }], notes: [] });
    }
    // Weekly quests pay out at the moment they complete, in date order.
    const wk = weekQual.get(week) ?? 0;
    const payWeekly = (id: string, title: string, cond: boolean, reward: number) => {
      const key = `wq-${id}-${week}`;
      if (cond && !ledger.some((l) => l.id === key)) addLedger({ id: key, at: w.completedAt, title: `Weekly quest: ${title}`, total: reward, items: [{ label: title, xp: reward }], notes: [] });
    };
    payWeekly('three', 'Three sessions', wk >= 3, XP.W_THREE);
    payWeekly('sets', `${XP.W_SETS_TARGET} hard sets`, (weekHard.get(week) ?? 0) >= XP.W_SETS_TARGET, XP.W_SETS);
    payWeekly('pr', 'Log a PR', (weekPR.get(week) ?? 0) > 0, XP.W_PR);
    payWeekly('routine', 'Follow a routine', weekRoutine.get(week) === true, XP.W_ROUTINE);

    // Chosen-exercise quests: +5% e1RM over the baseline from at least 4 later sessions.
    for (const g of goals) {
      if (g.kind !== 'overload' || !g.exerciseId || w.completedAt < g.startedAt) continue;
      const key = `ov-${g.id}`;
      if (ledger.some((l) => l.id === key)) continue;
      const state = overloadState(list.filter((x) => x.completedAt <= w.completedAt), g);
      if (state.done) addLedger({ id: key, at: w.completedAt, title: `Long quest: ${g.title}`, total: XP.OVERLOAD, items: [{ label: 'Improved 5% over time', xp: XP.OVERLOAD }], notes: [] });
    }

    for (const a of ACHIEVEMENTS) if (!achievements.has(a.id) && a.check(running)) {
      achievements.set(a.id, w.completedAt);
      timeline.push({ at: w.completedAt, kind: 'achievement', title: a.name, detail: a.description });
    }
    if (running.workouts === 1) timeline.push({ at: w.completedAt, kind: 'first', title: 'The quest began', detail: `First session: ${w.name}` });
    for (const ev of events) if (ev.kind === 'e1rm') timeline.push({ at: ev.at, kind: 'pr', title: `${lookup(ev.exerciseId)?.name ?? 'Exercise'} record` });
    noteLevels(w.completedAt);
  }

  const level = levelFromXp(xp);
  const st = streaks(list, now);
  const recent4 = muscleSets(list.filter((w) => w.completedAt >= addDays(now, -28).getTime()), lookup);
  const MAIN: Muscle[] = ['chest', 'lats', 'upper-back', 'front-delts', 'side-delts', 'biceps', 'triceps', 'abs', 'quads', 'hamstrings', 'glutes', 'calves'];
  const activeLast12 = new Set(list.filter((w) => w.completedAt >= addDays(now, -84).getTime()).map((w) => weekKey(w.completedAt))).size;
  const allWeeks = new Set(list.map((w) => weekKey(w.completedAt))).size;
  const highRep = list.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.filter((s) => s.done && (s.reps ?? 0) >= 15).length, 0), 0);
  const cardioMin = list.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.reduce((k, s) => k + (s.done ? (s.seconds ?? 0) / 60 : 0), 0), 0), 0);
  const hardTotal = list.reduce((n, w) => n + (w.legacy ? w.legacy.completedSets : w.exercises.reduce((m, e) => m + e.sets.filter(isHard).length, 0)), 0);
  const attributes: Attribute[] = [
    { key: 'strength', name: 'Strength', value: expScore(running.prs, 80), description: 'Grows with verified personal records, so it reflects your own progress rather than absolute load.' },
    { key: 'endurance', name: 'Endurance', value: expScore(cardioMin + highRep * 0.5, 800), description: 'Timed work and cardio minutes, plus sets of 15+ reps.' },
    { key: 'consistency', name: 'Consistency', value: Math.round(clamp((activeLast12 / 12) * 70 + (Math.min(allWeeks, 52) / 52) * 30, 0, 100)), description: 'Weeks trained in the last 12, plus lifetime active weeks.' },
    { key: 'fortitude', name: 'Fortitude', value: expScore(hardTotal, 2500), description: 'Total hard sets ever logged.' },
    { key: 'balance', name: 'Balance', value: Math.round((MAIN.filter((m) => (recent4.get(m) ?? 0) >= 4).length / MAIN.length) * 100), description: 'Major muscle groups given 4+ hard sets in the last 4 weeks.' },
  ];

  const profileSkills = profile?.skills ?? [];
  const points = skillPoints(level.level);
  const armorTier = ARMORS.filter((a) => a.level <= level.level).length - 1;
  const unlockedAccents = new Set(ACCENTS.filter((a) => (!a.level || a.level <= level.level) && (!a.achievement || achievements.has(a.achievement))).map((a) => a.id));
  const unlockedRelics = new Set(RELICS.filter((r) => (!r.achievement || achievements.has(r.achievement)) && (!r.skill || profileSkills.includes(r.skill))).map((r) => r.id));
  const unlockedArmors = new Set(ARMORS.filter((a) => a.level <= level.level).map((a) => a.id));
  const unlockedTitles = [...TITLES.filter((t) => t.level <= level.level).map((t) => t.name), ...SKILLS.filter((s) => s.title && profileSkills.includes(s.id)).map((s) => s.title!)];
  const defaultTitle = [...TITLES].reverse().find((t) => t.level <= level.level)!.name;
  const title = profile?.title && unlockedTitles.includes(profile.title) ? profile.title : defaultTitle;

  // ---------- current quest board ----------
  const today = dayKey(now), wkNow = weekKey(now);
  const dq = dailyFor(today);
  const dsNow = days.get(today) ?? { hard: 0, minutes: 0, muscles: 0, rpe: 0 };
  const quests: QuestView[] = [
    { id: dq.id, scope: 'daily', title: dq.title, detail: dq.detail, xp: XP.DAILY, current: Math.min(dq.get(dsNow), dq.target), target: dq.target, done: dq.get(dsNow) >= dq.target },
    { id: 'w-three', scope: 'weekly', title: 'Three Sessions', detail: 'Complete 3 full sessions this week (3+ sets, 10+ minutes).', xp: XP.W_THREE, current: Math.min(weekQual.get(wkNow) ?? 0, 3), target: 3, done: (weekQual.get(wkNow) ?? 0) >= 3 },
    { id: 'w-sets', scope: 'weekly', title: 'Thirty Hard Sets', detail: `Log ${XP.W_SETS_TARGET} hard sets this week.`, xp: XP.W_SETS, current: Math.min(weekHard.get(wkNow) ?? 0, XP.W_SETS_TARGET), target: XP.W_SETS_TARGET, done: (weekHard.get(wkNow) ?? 0) >= XP.W_SETS_TARGET },
    { id: 'w-pr', scope: 'weekly', title: 'Beat Your Past Self', detail: 'Log a personal record this week.', xp: XP.W_PR, current: Math.min(weekPR.get(wkNow) ?? 0, 1), target: 1, done: (weekPR.get(wkNow) ?? 0) > 0 },
    { id: 'w-routine', scope: 'weekly', title: 'Follow the Plan', detail: 'Complete a workout from a saved routine this week.', xp: XP.W_ROUTINE, current: weekRoutine.get(wkNow) ? 1 : 0, target: 1, done: weekRoutine.get(wkNow) === true },
  ];
  const nextStreak = LONG_STREAKS.find(([n]) => !creditedByStreak.has(n));
  if (nextStreak) quests.push({ id: `l-streak-${nextStreak[0]}`, scope: 'long', title: `${nextStreak[0]}-Week Oath`, detail: `Train at least once a week for ${nextStreak[0]} weeks in a row. Rest days never break this.`, xp: nextStreak[1], current: Math.min(st.currentWeeks, nextStreak[0]), target: nextStreak[0], done: false });
  const nextCount = LONG_COUNTS.find(([n]) => !creditedByCount.has(n));
  if (nextCount) quests.push({ id: `l-count-${nextCount[0]}`, scope: 'long', title: `${nextCount[0]} Sessions`, detail: `Complete ${nextCount[0]} full sessions.`, xp: nextCount[1], current: Math.min(qualifiedCount, nextCount[0]), target: nextCount[0], done: false });
  for (const g of goals.filter((x) => x.kind === 'overload')) {
    const s = overloadState(list, g);
    quests.push({ id: `ov-${g.id}`, scope: 'long', title: g.title, detail: s.baseline ? `Raise estimated 1RM 5% above ${Math.round(s.baseline)} kg across 4+ sessions (${s.sessions} so far).` : 'Log this exercise to set your baseline, then raise estimated 1RM by 5% across 4+ sessions.', xp: XP.OVERLOAD, current: s.done ? 100 : Math.round(s.pct), target: 100, done: s.done, unit: '%' });
  }

  void firstE1rm;
  return {
    xp, level, ledger, attributes, achievements, running, title, quests, timeline: timeline.sort((a, b) => b.at - a.at), records,
    skillPoints: points, skillPointsFree: points - profileSkills.length, armorTier, unlockedAccents, unlockedRelics, unlockedArmors, unlockedTitles,
  };
}

/** Progress on a "raise this lift by 5%" quest, from real sessions after the quest began. */
export function overloadState(list: Workout[], g: Goal) {
  const sessions = list.flatMap((w) => {
    if (w.completedAt < g.startedAt) return [];
    const vals = w.exercises.filter((e) => e.exerciseId === g.exerciseId).flatMap((e) => e.sets.filter((s) => s.done && s.type !== 'warmup').map((s) => e1rm(s.kg ?? 0, s.reps ?? 0)));
    const best = Math.max(0, ...vals);
    return best ? [{ at: w.completedAt, best }] : [];
  });
  if (!sessions.length) return { baseline: 0, best: 0, sessions: 0, pct: 0, done: false };
  const baseline = sessions[0].best;
  const best = Math.max(...sessions.map((s) => s.best));
  const target = baseline * 1.05;
  const pct = clamp(((best - baseline) / (target - baseline)) * 100, 0, 100);
  return { baseline, best, sessions: sessions.length, pct, done: best >= target && sessions.length >= 4 };
}

export { startOfWeek };

/** The armor tier to draw: what the player equipped, if still earned, else the best they've earned. */
export function equippedTier(armorId: string, p: Pick<Progress, 'unlockedArmors' | 'armorTier'>) {
  const a = ARMORS.find((x) => x.id === armorId && p.unlockedArmors.has(x.id));
  return a ? a.tier : p.armorTier;
}
