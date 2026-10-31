import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Link2, Link2Off, Plus, Save, Trash2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup } from '@/state/derived';
import type { Routine, RoutineExercise, RoutineSet, SetType } from '@/domain/types';
import { WEEKDAYS, fmtClock, toDisplay, toKg, uid } from '@/domain/util';
import { Button, Empty, Field, PageHead, cx } from '@/ui/kit';
import { useUnsavedGuard } from '@/ui/useUnsavedGuard';
import { ExercisePicker } from '../workout/ExercisePicker';

const TYPES: { v: SetType; l: string }[] = [{ v: 'normal', l: 'Work' }, { v: 'warmup', l: 'Warm' }, { v: 'drop', l: 'Drop' }, { v: 'failure', l: 'Fail' }];
const num = (s: string, max: number) => { const n = Number(s.replace(',', '.')); return s.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : Math.min(n, max); };

export default function RoutineEditor() {
  const { id } = useParams();
  const stored = useStore((s) => s.routines.find((r) => r.id === id));
  const folders = useStore((s) => s.folders);
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const unit = useStore((s) => s.settings.unit);
  const lookup = useLookup();
  const nav = useNavigate();
  const [r, setR] = useState<Routine | null>(stored ?? null);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  useEffect(() => { if (stored && !r) setR(stored); }, [stored, r]);
  const set = (next: Routine) => { setR(next); setDirty(true); };
  const up = (ex: RoutineExercise, patch: Partial<RoutineExercise>) => set({ ...r!, exercises: r!.exercises.map((e) => (e.id === ex.id ? { ...e, ...patch } : e)) });
  const upSet = (ex: RoutineExercise, i: number, patch: Partial<RoutineSet>) => up(ex, { sets: ex.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  useUnsavedGuard(dirty, 'Your edits to this routine have not been saved.');
  const valid = useMemo(() => !!r?.name.trim(), [r]);

  if (!r) return <div className="page"><Empty title="Routine not found" action={<Link to="/app/routines" className="btn">Back to routines</Link>}>It may have been deleted.</Empty></div>;

  const move = (ex: RoutineExercise, d: -1 | 1) => {
    const i = r.exercises.indexOf(ex), j = i + d;
    if (j < 0 || j >= r.exercises.length) return;
    const list = [...r.exercises]; [list[i], list[j]] = [list[j], list[i]];
    set({ ...r, exercises: list });
  };
  const linkNext = (ex: RoutineExercise) => {
    const i = r.exercises.indexOf(ex); const next = r.exercises[i + 1];
    if (!next) return;
    const groupId = ex.groupId ?? next.groupId ?? uid();
    set({ ...r, exercises: r.exercises.map((e) => (e === ex || e === next ? { ...e, groupId, groupType: 'superset' as const } : e)) });
  };
  const persist = async () => { await save('routines', { ...r, name: r.name.trim() }); setDirty(false); toast({ kind: 'success', text: 'Routine saved' }); };
  const leave = () => nav('/app/routines');

  return (
    <div className="page max-w-3xl">
      <PageHead kicker="Routine builder" title={r.name || 'Untitled'}>
        <Button variant="ghost" onClick={leave}><X size={14} /> Close</Button>
        <Button variant="primary" disabled={!valid || !dirty} onClick={() => void persist()} data-testid="save-routine"><Save size={14} /> Save</Button>
      </PageHead>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={valid ? null : 'Give it a name.'}><input className="input" maxLength={120} value={r.name} onChange={(e) => set({ ...r, name: e.target.value })} data-testid="routine-name" /></Field>
        <Field label="Folder"><select className="input" value={r.folderId ?? ''} onChange={(e) => set({ ...r, folderId: e.target.value || undefined })}><option value="">Unfiled</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      </div>
      <div className="mt-3"><span className="hud label">Training days</span>
        <div className="grid grid-cols-7 gap-1">{WEEKDAYS.map((d, i) => <button key={d} type="button" className="chip justify-center !px-0" aria-pressed={r.days.includes(i)} onClick={() => set({ ...r, days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i] })}>{d}</button>)}</div>
      </div>
      <div className="mt-3"><Field label="Notes"><textarea className="input min-h-16 text-sm" maxLength={4000} value={r.notes ?? ''} onChange={(e) => set({ ...r, notes: e.target.value || undefined })} /></Field></div>

      <div className="mt-6 space-y-3">
        {r.exercises.map((ex, i) => {
          const x = lookup(ex.exerciseId);
          const timed = x?.mode === 'timed'; const cardio = x?.mode === 'cardio';
          const prevLinked = ex.groupId && r.exercises[i - 1]?.groupId === ex.groupId;
          return (
            <article key={ex.id} className={cx('plate p-3', ex.groupId && 'border-l-4 border-arc')} style={{ '--cut': '10px' } as React.CSSProperties} data-testid="routine-exercise">
              {ex.groupId && !prevLinked && <p className="hud mb-1 text-arc">Superset with next</p>}
              <div className="flex items-center gap-1">
                <h3 className="display min-w-0 flex-1 truncate text-2xl">{x?.name ?? 'Deleted exercise'}</h3>
                <Button icon size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(ex, -1)}><ArrowUp size={15} /></Button>
                <Button icon size="sm" variant="ghost" aria-label="Move down" disabled={i === r.exercises.length - 1} onClick={() => move(ex, 1)}><ArrowDown size={15} /></Button>
                {ex.groupId ? <Button icon size="sm" variant="ghost" aria-label="Unlink superset" onClick={() => up(ex, { groupId: undefined, groupType: undefined })}><Link2Off size={15} /></Button>
                  : <Button icon size="sm" variant="ghost" aria-label="Superset with next" disabled={i === r.exercises.length - 1} onClick={() => linkNext(ex)}><Link2 size={15} /></Button>}
                <Button icon size="sm" variant="ghost" aria-label={`Remove ${x?.name}`} onClick={() => set({ ...r, exercises: r.exercises.filter((e) => e !== ex) })}><Trash2 size={15} /></Button>
              </div>
              <div className="mt-2 grid grid-cols-[56px_1fr_1fr_1fr_36px] gap-1 text-center"><span className="hud text-[9px]">Type</span>
                {timed ? <><span className="hud col-span-2 text-[9px]">Target sec</span><span /></> : cardio ? <><span className="hud col-span-3 text-[9px]">Logged live</span></> : <><span className="hud text-[9px]">Min reps</span><span className="hud text-[9px]">Max reps</span><span className="hud text-[9px]">{unit} (opt.)</span></>}
                <span />
              </div>
              {ex.sets.map((s, j) => (
                <div key={j} className="mt-1 grid grid-cols-[56px_1fr_1fr_1fr_36px] gap-1">
                  <select className="input !min-h-10 !px-1 text-xs" aria-label={`Set ${j + 1} type`} value={s.type} onChange={(e) => upSet(ex, j, { type: e.target.value as SetType })}>{TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
                  {timed ? <><input className="set-input col-span-2 !h-10" inputMode="numeric" aria-label={`Set ${j + 1} seconds`} value={s.seconds ?? ''} onChange={(e) => upSet(ex, j, { seconds: num(e.target.value, 86400) })} /><span /></>
                    : cardio ? <span className="col-span-3 self-center text-center text-xs text-muted">Distance and time</span>
                    : <>
                      <input className="set-input !h-10" inputMode="numeric" aria-label={`Set ${j + 1} minimum reps`} value={s.repsMin ?? ''} onChange={(e) => upSet(ex, j, { repsMin: num(e.target.value, 2000) })} data-testid="reps-min" />
                      <input className="set-input !h-10" inputMode="numeric" aria-label={`Set ${j + 1} maximum reps`} value={s.repsMax ?? ''} onChange={(e) => upSet(ex, j, { repsMax: num(e.target.value, 2000) })} />
                      <input className="set-input !h-10" inputMode="decimal" aria-label={`Set ${j + 1} target weight in ${unit}`} defaultValue={s.kg !== undefined ? toDisplay(s.kg, unit) : ''} onChange={(e) => { const v = num(e.target.value, 3307); upSet(ex, j, { kg: v === undefined ? undefined : toKg(v, unit) }); }} />
                    </>}
                  <Button icon size="sm" variant="ghost" aria-label={`Remove set ${j + 1}`} className="!min-h-10 !min-w-9" onClick={() => up(ex, { sets: ex.sets.filter((_, k) => k !== j) })}><X size={14} /></Button>
                </div>
              ))}
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" onClick={() => up(ex, { sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] ?? { type: 'normal' }) }] })} data-testid="routine-add-set"><Plus size={13} /> Set</Button>
                <label className="ml-auto flex items-center gap-2"><span className="hud">Rest</span>
                  <select className="input !min-h-9 w-24 !py-0 text-xs" value={ex.restSec ?? ''} onChange={(e) => up(ex, { restSec: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">Default</option>{[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{s ? fmtClock(s) : 'Off'}</option>)}</select>
                </label>
              </div>
            </article>
          );
        })}
      </div>
      {!r.exercises.length && <Empty title="No exercises">Add at least one to be able to start this routine.</Empty>}
      <Button className="mt-3 w-full" onClick={() => setPicker(true)} data-testid="routine-add-exercise"><Plus size={15} /> Add exercises</Button>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(list) => set({ ...r, exercises: [...r.exercises, ...list.map((e): RoutineExercise => ({
        id: uid(), exerciseId: e.id, sets: e.mode === 'cardio' ? [{ type: 'normal' }] : e.mode === 'timed' ? Array.from({ length: 3 }, () => ({ type: 'normal' as const, seconds: 30 })) : Array.from({ length: 3 }, () => ({ type: 'normal' as const, repsMin: 8, repsMax: 12 })),
      }))] })} />
    </div>
  );
}
