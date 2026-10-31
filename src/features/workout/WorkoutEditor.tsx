import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Copy, Link2, Link2Off, MoreHorizontal, NotebookPen, Plus, Sparkles, Timer, Trash2 } from 'lucide-react';
import type { Exercise, GroupType, SetType, Workout, WorkoutExercise, WorkoutSet } from '@/domain/types';
import { addSet, duplicateSet, linkWithNext, moveExercise, removeExercise, removeSet, restAfter, setProblem, unlink, updateExercise, updateSet, type EditableWorkout } from '@/domain/workout-ops';
import { applySet, checkSet, emptyBests, lastPerformances, PR_LABEL, type Bests, type LastPerformance } from '@/domain/records';
import { recommend } from '@/domain/overload';
import { displayToMeters, fmtClock, fmtDate, metersToDisplay, toDisplay, toKg, round } from '@/domain/util';
import { useStore } from '@/state/store';
import { exerciseName, useLookup, useProgress } from '@/state/derived';
import { Button, Dialog, confirmAction, cx } from '@/ui/kit';
import { startRest } from './RestTimer';

const TYPE_META: Record<SetType, { short: string; label: string; cls: string }> = {
  warmup: { short: 'W', label: 'Warm-up', cls: 'text-[#ffc24b]' },
  normal: { short: '', label: 'Working', cls: 'text-bone' },
  drop: { short: 'D', label: 'Drop set', cls: 'text-arc' },
  failure: { short: 'F', label: 'To failure', cls: 'text-crimson' },
};

/** Parses a typed value. An empty string clears; anything unparseable reports invalid and stores nothing. */
function parseNum(raw: string): { value?: number; invalid: boolean } {
  const t = raw.trim().replace(',', '.');
  if (!t) return { value: undefined, invalid: false };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n, invalid: false } : { invalid: true };
}
function parseTime(raw: string): { value?: number; invalid: boolean } {
  const t = raw.trim();
  if (!t) return { value: undefined, invalid: false };
  if (t.includes(':')) {
    const parts = t.split(':').map(Number);
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return { invalid: true };
    return { value: parts.reduce((acc, p) => acc * 60 + p, 0), invalid: false };
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n, invalid: false } : { invalid: true };
}

const NumCell = memo(function NumCell({ value, format, parse, onCommit, label, placeholder, mode = 'decimal', max }: {
  value: number | undefined; format: (v: number) => string; parse: (s: string) => { value?: number; invalid: boolean }; onCommit: (v: number | undefined) => void;
  label: string; placeholder?: string; mode?: 'decimal' | 'numeric' | 'text'; max?: number;
}) {
  const [text, setText] = useState(value === undefined ? '' : format(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  // Follow outside changes (autofill, duplicate, unit switch) but never fight the person typing.
  useEffect(() => { if (!focused.current) { setText(value === undefined ? '' : format(value)); setBad(false); } }, [value, format]);
  return (
    <input className="set-input" type="text" inputMode={mode} enterKeyHint="next" aria-label={label} aria-invalid={bad} placeholder={placeholder} value={text} autoComplete="off"
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => {
        setText(e.target.value);
        const p = parse(e.target.value);
        const over = max !== undefined && p.value !== undefined && p.value > max;
        setBad(p.invalid || over);
        if (!p.invalid && !over) onCommit(p.value);
      }}
      onBlur={() => { focused.current = false; if (bad) { setText(value === undefined ? '' : format(value)); setBad(false); } }} />
  );
});

interface Ctx<T extends EditableWorkout> { value: T; onChange: (next: T) => void; live: boolean; lookup: (id: string) => Exercise | undefined; bests: Map<string, Bests>; last: Map<string, LastPerformance>; workouts: Workout[]; excludeId?: string }

function SetRow<T extends EditableWorkout>({ ctx, ex, set, index, exercise }: { ctx: Ctx<T>; ex: WorkoutExercise; set: WorkoutSet; index: number; exercise: Exercise | undefined }) {
  const settings = useStore((s) => s.settings);
  const toast = useStore((s) => s.toast);
  const [menu, setMenu] = useState(false);
  const unit = settings.unit;
  const mode = exercise?.mode ?? 'strength';
  const prevSet = ctx.last.get(ex.exerciseId)?.sets[index];
  const change = (patch: Partial<WorkoutSet>) => ctx.onChange(updateSet(ctx.value, ex.id, set.id, patch));
  const fw = useMemo(() => (v: number) => String(toDisplay(v, unit)), [unit]);
  const pw = useMemo(() => (s: string) => { const p = parseNum(s); return p.value === undefined ? p : { ...p, value: toKg(p.value, unit) }; }, [unit]);
  const fr = useMemo(() => (v: number) => String(v), []);
  const pr = useMemo(() => (s: string) => { const p = parseNum(s); return p.value !== undefined && !Number.isInteger(p.value) ? { invalid: true } : p; }, []);
  const ft = useMemo(() => (v: number) => fmtClock(v), []);
  const fd = useMemo(() => (v: number) => String(metersToDisplay(v, settings.distance)), [settings.distance]);
  const pd = useMemo(() => (s: string) => { const p = parseNum(s); return p.value === undefined ? p : { ...p, value: displayToMeters(p.value, settings.distance) }; }, [settings.distance]);
  const maxWeight = unit === 'kg' ? 1500 : 3307;

  const prevText = !prevSet ? '—'
    : mode === 'timed' ? fmtClock(prevSet.seconds ?? 0)
    : mode === 'cardio' ? `${prevSet.meters ? `${metersToDisplay(prevSet.meters, settings.distance)}${settings.distance}` : fmtClock(prevSet.seconds ?? 0)}`
    : prevSet.kg ? `${toDisplay(prevSet.kg, unit)}×${prevSet.reps ?? 0}` : `${prevSet.reps ?? 0} reps`;

  const toggle = () => {
    if (set.done) { change({ done: false, doneAt: undefined }); return; }
    // An empty cell means "same as the hint you can see", the fastest way to log between sets.
    const filled: WorkoutSet = { ...set, kg: set.kg ?? (mode === 'strength' || mode === 'bodyweight' ? prevSet?.kg : undefined), reps: set.reps ?? prevSet?.reps, seconds: set.seconds ?? prevSet?.seconds, meters: set.meters ?? prevSet?.meters };
    const problem = setProblem(filled, mode);
    if (problem) { toast({ kind: 'error', text: problem }); return; }
    const doneSet = { ...filled, done: true, doneAt: Date.now() };
    ctx.onChange(updateSet(ctx.value, ex.id, set.id, doneSet));
    if (!ctx.live) return;
    // Live PR alert: history bests plus earlier sets from this session.
    const running: Bests = { ...(ctx.bests.get(ex.exerciseId) ?? emptyBests()) };
    let seen = ctx.bests.has(ex.exerciseId);
    for (const s of ex.sets) { if (s.id === set.id) break; if (s.done && s.type !== 'warmup') { applySet(running, s); seen = true; } }
    const hits = checkSet(mode, doneSet, running, seen);
    if (hits.length) toast({ kind: 'pr', text: 'New personal record', detail: `${exercise?.name ?? 'Exercise'}: ${hits.map((h) => PR_LABEL[h.kind]).join(', ')}` });
    if (settings.autoRest) { const rest = restAfter(ctx.value, ex.id, settings.defaultRestSec); if (rest > 0) startRest(rest, exercise?.name ?? 'Next set'); }
  };

  const workingIndex = ex.sets.slice(0, index + 1).filter((s) => s.type !== 'warmup').length;
  const meta = TYPE_META[set.type];
  const oneField = mode === 'timed';
  return (
    <div className={cx('set-grid mt-1.5', oneField && 'one-field', set.done && 'set-done')} data-testid="set-row">
      <button type="button" className={cx('h-11 font-mono text-sm font-bold', meta.cls)} aria-label={`Set ${index + 1} options, ${meta.label}`} onClick={() => setMenu(true)} data-testid="set-menu">
        {meta.short || workingIndex}{set.rpe !== undefined && <sup className="ml-px text-[9px] font-normal text-muted">{set.rpe}</sup>}
      </button>
      <span className="num truncate text-center text-[11px] text-muted" title="Previous">{prevText}</span>
      {mode === 'timed' ? (
        <NumCell label={`Set ${index + 1} time`} value={set.seconds} format={ft} parse={parseTime} onCommit={(v) => change({ seconds: v })} placeholder={prevSet?.seconds ? fmtClock(prevSet.seconds) : '0:00'} mode="text" max={86400} />
      ) : mode === 'cardio' ? (
        <>
          <NumCell label={`Set ${index + 1} distance in ${settings.distance}`} value={set.meters} format={fd} parse={pd} onCommit={(v) => change({ meters: v })} placeholder={prevSet?.meters ? String(metersToDisplay(prevSet.meters, settings.distance)) : settings.distance} max={1_000_000} />
          <NumCell label={`Set ${index + 1} time`} value={set.seconds} format={ft} parse={parseTime} onCommit={(v) => change({ seconds: v })} placeholder={prevSet?.seconds ? fmtClock(prevSet.seconds) : '0:00'} mode="text" max={86400} />
        </>
      ) : (
        <>
          <NumCell label={`Set ${index + 1} ${mode === 'bodyweight' ? 'added weight' : 'weight'} in ${unit}`} value={set.kg} format={fw} parse={pw} onCommit={(v) => change({ kg: v })} placeholder={prevSet?.kg !== undefined ? String(toDisplay(prevSet.kg, unit)) : mode === 'bodyweight' ? '+0' : unit} max={maxWeight} />
          <NumCell label={`Set ${index + 1} reps`} value={set.reps} format={fr} parse={pr} onCommit={(v) => change({ reps: v })} placeholder={prevSet?.reps !== undefined ? String(prevSet.reps) : 'reps'} mode="numeric" max={2000} />
        </>
      )}
      <button type="button" className="set-check" aria-pressed={set.done} aria-label={`${set.done ? 'Undo' : 'Complete'} set ${index + 1}`} onClick={toggle} data-testid="set-check"><Check size={20} strokeWidth={3} /></button>

      <Dialog open={menu} onClose={() => setMenu(false)} title={`Set ${index + 1}`}>
        <div className="hud mb-1">Type</div>
        <div className="mb-4 flex flex-wrap gap-1">
          {(Object.keys(TYPE_META) as SetType[]).map((t) => <button key={t} type="button" className="chip" aria-pressed={set.type === t} onClick={() => change({ type: t })}>{TYPE_META[t].label}</button>)}
        </div>
        <div className="hud mb-1">RPE (how hard it felt)</div>
        <div className="mb-1 flex flex-wrap gap-1">
          {[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => <button key={r} type="button" className="chip" aria-pressed={set.rpe === r} onClick={() => change({ rpe: set.rpe === r ? undefined : r })}>{r}</button>)}
        </div>
        <p className="mb-4 text-xs text-muted">10 = no reps left. 8 = about two left. Optional.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { ctx.onChange(duplicateSet(ctx.value, ex.id, set.id)); setMenu(false); }}><Copy size={14} /> Duplicate</Button>
          <Button variant="danger" onClick={() => { ctx.onChange(removeSet(ctx.value, ex.id, set.id)); setMenu(false); }} data-testid="set-delete"><Trash2 size={14} /> Delete set</Button>
        </div>
      </Dialog>
    </div>
  );
}

function Suggestion<T extends EditableWorkout>({ ctx, ex, exercise }: { ctx: Ctx<T>; ex: WorkoutExercise; exercise: Exercise }) {
  const unit = useStore((s) => s.settings.unit);
  const [open, setOpen] = useState(false);
  const rec = useMemo(() => {
    const recent = ctx.workouts.filter((w) => w.id !== ctx.excludeId).sort((a, b) => a.completedAt - b.completedAt).flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.exerciseId)).slice(-2);
    return recommend(exercise, recent, { min: ex.targetRepsMin, max: ex.targetRepsMax });
  }, [ctx.workouts, ctx.excludeId, ex.exerciseId, ex.targetRepsMin, ex.targetRepsMax, exercise]);
  if (!rec) return null;
  const canApply = rec.kg !== undefined || rec.reps !== undefined;
  const apply = () => {
    let next = ctx.value;
    for (const s of ex.sets) if (!s.done && s.type === 'normal') next = updateSet(next, ex.id, s.id, { ...(rec.kg !== undefined && { kg: rec.kg }), ...(rec.reps !== undefined && exercise.mode !== 'timed' && { reps: rec.reps }) });
    ctx.onChange(next);
    setOpen(false);
  };
  return (
    <div className="mt-2 border-l-2 border-[var(--accent)]/60 bg-white/[.03] px-2 py-1.5">
      <button type="button" className="flex min-h-8 w-full items-center gap-2 text-left text-xs text-silver" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="suggestion">
        <Sparkles size={13} className="shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="min-w-0 flex-1"><b className="font-semibold text-bone">Optional:</b> {rec.headline}{rec.kg !== undefined ? ` · ${round(toDisplay(rec.kg, unit), 1)} ${unit}` : ''}{rec.reps !== undefined ? ` × ${rec.reps}` : ''}</span>
        <span className="hud">{open ? 'Hide' : 'Why'}</span>
      </button>
      {open && (
        <div className="pt-1 text-xs text-muted">
          <ul className="m-0 list-disc space-y-0.5 pl-4">{rec.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mt-1">Based only on your log. Listen to your body; this isn't a prescription.</p>
          {canApply && <Button size="sm" className="mt-2" onClick={apply}>Fill empty sets</Button>}
        </div>
      )}
    </div>
  );
}

function ExerciseBlock<T extends EditableWorkout>({ ctx, ex, index }: { ctx: Ctx<T>; ex: WorkoutExercise; index: number }) {
  const unit = useStore((s) => s.settings.unit);
  const settings = useStore((s) => s.settings);
  const exercise = ctx.lookup(ex.exerciseId);
  const [notes, setNotes] = useState(!!ex.notes);
  const [more, setMore] = useState(false);
  const mode = exercise?.mode ?? 'strength';
  const next = ctx.value.exercises[index + 1];
  const best = ctx.bests.get(ex.exerciseId);
  const last = ctx.last.get(ex.exerciseId);
  const remove = async () => {
    if (ex.sets.some((s) => s.done) && !(await confirmAction({ title: 'Remove exercise?', body: `Your completed sets for ${exercise?.name ?? 'this exercise'} will be removed.`, confirm: 'Remove', danger: true }))) return;
    ctx.onChange(removeExercise(ctx.value, ex.id));
  };
  const link = (t: GroupType) => { ctx.onChange(linkWithNext(ctx.value, ex.id, t)); setMore(false); };
  return (
    <article className="plate p-3 pb-3.5" style={{ '--cut': '10px' } as React.CSSProperties} data-testid="exercise-card">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <Link to={`/app/exercises/${ex.exerciseId}`} className="display block truncate text-2xl hover:text-[var(--accent)]">{exercise?.name ?? exerciseName(ctx.lookup, ex.exerciseId)}</Link>
          <p className="truncate text-xs text-muted">
            {best?.e1rm ? `Best est. 1RM ${round(toDisplay(best.e1rm, unit), 1)} ${unit}` : 'No record yet'}{last ? ` · last ${fmtDate(last.at, { month: 'short', day: 'numeric' })}` : ''}
          </p>
        </div>
        <Button icon size="sm" variant="ghost" aria-label={`Add note to ${exercise?.name}`} onClick={() => setNotes((n) => !n)} className={ex.notes ? 'text-[var(--accent)]' : ''}><NotebookPen size={16} /></Button>
        <Button icon size="sm" variant="ghost" aria-label={`More options for ${exercise?.name}`} onClick={() => setMore(true)} data-testid="exercise-menu"><MoreHorizontal size={18} /></Button>
      </div>
      {notes && <textarea className="input mt-2 min-h-16 text-sm" placeholder="Seat height, cues, how it felt…" maxLength={4000} aria-label="Exercise notes" value={ex.notes ?? ''} onChange={(e) => ctx.onChange(updateExercise(ctx.value, ex.id, { notes: e.target.value || undefined }))} />}
      {ctx.live && exercise && <Suggestion ctx={ctx} ex={ex} exercise={exercise} />}

      <div className={cx('set-grid mt-2', mode === 'timed' && 'one-field')} aria-hidden>
        <span className="hud text-center text-[9px]">Set</span><span className="hud text-center text-[9px]">Prev</span>
        {mode === 'timed' ? <span className="hud text-center text-[9px]">Time</span>
          : mode === 'cardio' ? <><span className="hud text-center text-[9px]">{settings.distance}</span><span className="hud text-center text-[9px]">Time</span></>
          : <><span className="hud text-center text-[9px]">{mode === 'bodyweight' ? `+${unit}` : unit}</span><span className="hud text-center text-[9px]">Reps</span></>}
        <span />
      </div>
      {ex.sets.map((s, i) => <SetRow key={s.id} ctx={ctx} ex={ex} set={s} index={i} exercise={exercise} />)}
      <Button size="sm" className="mt-2 w-full" onClick={() => ctx.onChange(addSet(ctx.value, ex.id))} data-testid="add-set"><Plus size={14} /> Add set</Button>

      <Dialog open={more} onClose={() => setMore(false)} title={exercise?.name ?? 'Exercise'}>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={index === 0} onClick={() => { ctx.onChange(moveExercise(ctx.value, ex.id, -1)); setMore(false); }} data-testid="move-up"><ArrowUp size={14} /> Move up</Button>
          <Button disabled={!next} onClick={() => { ctx.onChange(moveExercise(ctx.value, ex.id, 1)); setMore(false); }} data-testid="move-down"><ArrowDown size={14} /> Move down</Button>
          <Button disabled={!next} onClick={() => link('superset')} data-testid="link-superset"><Link2 size={14} /> Superset next</Button>
          <Button disabled={!next} onClick={() => link('circuit')}><Link2 size={14} /> Circuit next</Button>
          {ex.groupId && <Button onClick={() => { ctx.onChange(unlink(ctx.value, ex.id)); setMore(false); }}><Link2Off size={14} /> Unlink</Button>}
        </div>
        <div className="mt-4">
          <span className="hud label"><Timer size={11} className="mr-1 inline" /> Rest after this exercise</span>
          <div className="flex flex-wrap gap-1">
            {[0, 30, 60, 90, 120, 180, 240, 300].map((s) => <button key={s} type="button" className="chip" aria-pressed={(ex.restSec ?? settings.defaultRestSec) === s} onClick={() => ctx.onChange(updateExercise(ctx.value, ex.id, { restSec: s }))}>{s === 0 ? 'Off' : fmtClock(s)}</button>)}
          </div>
        </div>
        {ctx.live && <Button className="mt-4 w-full" onClick={() => { startRest(ex.restSec ?? settings.defaultRestSec, exercise?.name ?? 'Next set'); setMore(false); }}><Timer size={14} /> Start rest now</Button>}
        <Button variant="danger" className="mt-4 w-full" onClick={() => { setMore(false); void remove(); }} data-testid="remove-exercise"><Trash2 size={14} /> Remove exercise</Button>
      </Dialog>
    </article>
  );
}

/** The set-logging surface. Shared by live workouts and editing saved sessions. */
export function WorkoutEditor<T extends EditableWorkout>({ value, onChange, live, excludeId }: { value: T; onChange: (next: T) => void; live: boolean; excludeId?: string }) {
  const lookup = useLookup();
  const progress = useProgress();
  const workouts = useStore((s) => s.workouts);
  const others = useMemo(() => (excludeId ? workouts.filter((w) => w.id !== excludeId) : workouts), [workouts, excludeId]);
  const last = useMemo(() => lastPerformances(others), [others]);
  const ctx: Ctx<T> = { value, onChange, live, lookup, bests: progress.records.bests, last, workouts: others, excludeId };

  return (
    <div className="space-y-3">
      {value.exercises.map((ex, i) => {
        const groupedPrev = !!ex.groupId && value.exercises[i - 1]?.groupId === ex.groupId;
        const groupedNext = !!ex.groupId && value.exercises[i + 1]?.groupId === ex.groupId;
        return (
          <div key={ex.id} className={cx(ex.groupId && 'relative pl-3', groupedPrev && '-mt-1.5')}>
            {ex.groupId && <span aria-hidden className={cx('absolute bottom-0 left-0 top-0 w-1 bg-arc', !groupedPrev && 'top-2', !groupedNext && 'bottom-2')} />}
            {ex.groupId && !groupedPrev && <p className="hud mb-1 text-arc">{ex.groupType === 'circuit' ? 'Circuit' : 'Superset'}: rest after the last exercise</p>}
            <ExerciseBlock ctx={ctx} ex={ex} index={i} />
          </div>
        );
      })}
    </div>
  );
}
