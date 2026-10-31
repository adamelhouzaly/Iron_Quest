import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup, useProgress } from '@/state/derived';
import { exerciseHistory, e1rm } from '@/domain/records';
import { MUSCLE_LABEL } from '@/domain/analytics';
import { CATEGORY_LABEL, EQUIPMENT_LABEL } from '@/data/exercises';
import { fmt, fmtClock, fmtDate, fmtVolume, metersToDisplay, toDisplay } from '@/domain/util';
import { Button, Empty, PageHead, Stat, confirmAction } from '@/ui/kit';
import { MuscleMap } from '@/ui/art';
import { LinesChart } from '@/ui/charts';
import { ExerciseForm } from './ExercisesPage';

export default function ExerciseDetail() {
  const { id = '' } = useParams();
  const lookup = useLookup();
  const workouts = useStore((s) => s.workouts);
  const settings = useStore((s) => s.settings);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const { records } = useProgress();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const e = lookup(id);
  const history = useMemo(() => exerciseHistory(workouts, id), [workouts, id]);
  const unit = settings.unit;
  if (!e) return <div className="page"><Empty title="Exercise not found" action={<Link to="/app/exercises" className="btn">Back to the Arsenal</Link>}>It may have been deleted.</Empty></div>;
  const best = records.bests.get(id);
  const strength = e.mode === 'strength' || e.mode === 'bodyweight';
  const fw = (v: number) => `${fmt(v, 1)} ${unit}`;
  const data = history.map((h) => ({ at: h.at, e1rm: toDisplay(h.bestE1rm, unit) || null, top: toDisplay(h.topKg, unit) || null, volume: toDisplay(h.volume, unit), reps: h.reps, minutes: Math.round(h.seconds / 6) / 10, km: metersToDisplay(h.meters, settings.distance) }));
  const dateFmt = (v: string | number) => fmtDate(Number(v), { month: 'short', day: 'numeric' });
  const del = async () => {
    if (!(await confirmAction({ title: 'Delete exercise?', body: history.length ? `It appears in ${history.length} logged session${history.length === 1 ? '' : 's'}. Those sets stay in your totals but will show as "Deleted exercise".` : 'This cannot be undone.', confirm: 'Delete', danger: true }))) return;
    await remove('exercises', id); toast({ kind: 'info', text: 'Exercise deleted' }); nav('/app/exercises');
  };
  return (
    <div className="page">
      <PageHead kicker={`${CATEGORY_LABEL[e.category]} · ${EQUIPMENT_LABEL[e.equipment]}`} title={e.name}>
        {e.custom && <><Button onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button><Button variant="danger" onClick={() => void del()}><Trash2 size={14} /> Delete</Button></>}
      </PageHead>
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside>
          <MuscleMap primary={e.primary} secondary={e.secondary} />
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="hud">Primary</dt><dd className="text-bone">{e.primary.map((m) => MUSCLE_LABEL[m]).join(', ') || 'Not set'}</dd></div>
            {!!e.secondary.length && <div><dt className="hud">Secondary</dt><dd>{e.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}</dd></div>}
          </dl>
        </aside>
        <div className="min-w-0 space-y-8">
          {(!!e.steps.length || !!e.form.length) && (
            <section className="grid gap-6 md:grid-cols-2">
              {!!e.steps.length && <div><h2 className="display mb-2 text-2xl">Execution</h2><ol className="m-0 list-none space-y-2 p-0 text-sm">{e.steps.map((s, i) => <li key={i} className="flex gap-3"><span className="num text-[var(--accent)]">{String(i + 1).padStart(2, '0')}</span><span>{s}</span></li>)}</ol></div>}
              {!!e.form.length && <div><h2 className="display mb-2 text-2xl">Form</h2><ul className="m-0 list-none space-y-2 p-0 text-sm">{e.form.map((s, i) => <li key={i} className="border-l-2 border-line pl-3">{s}</li>)}</ul></div>}
            </section>
          )}
          <section>
            <h2 className="display mb-3 text-3xl">Your records</h2>
            {!history.length && !best ? <Empty title="No performances yet">Log this exercise and its records and charts appear here.</Empty> : (
              <div className="grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4">
                {strength && !!best?.e1rm && <Stat label="Est. 1RM" value={fw(toDisplay(best.e1rm, unit))} />}
                {strength && !!best?.weight && <Stat label="Heaviest" value={fw(toDisplay(best.weight, unit))} />}
                {!!best?.reps && <Stat label="Most reps" value={best.reps} />}
                {strength && !!best?.volume && <Stat label="Best set" value={fmtVolume(best.volume, unit)} />}
                {!!best?.time && <Stat label="Longest" value={fmtClock(best.time)} />}
                {!!best?.distance && <Stat label="Farthest" value={`${metersToDisplay(best.distance, settings.distance)} ${settings.distance}`} />}
                <Stat label="Sessions" value={history.length} />
              </div>
            )}
          </section>
          {history.length > 1 && (
            <section className="grid gap-3 xl:grid-cols-2">
              {strength && data.some((d) => d.e1rm) && <LinesChart area title="Estimated 1RM" subtitle="Best set each session (Epley)" data={data} x="at" xFormat={dateFmt} series={[{ key: 'e1rm', label: 'Est. 1RM', format: fw }]} />}
              {strength && data.some((d) => d.volume) && <LinesChart title="Session volume" data={data} x="at" xFormat={dateFmt} series={[{ key: 'volume', label: 'Volume', format: fw }]} />}
              {strength && !data.some((d) => d.volume) && <LinesChart title="Total reps" data={data} x="at" xFormat={dateFmt} series={[{ key: 'reps', label: 'Reps' }]} />}
              {!strength && <LinesChart area title="Time" subtitle="Minutes per session" data={data} x="at" xFormat={dateFmt} series={[{ key: 'minutes', label: 'Minutes' }]} />}
              {e.mode === 'cardio' && <LinesChart title="Distance" data={data} x="at" xFormat={dateFmt} series={[{ key: 'km', label: settings.distance }]} />}
            </section>
          )}
          {!!history.length && (
            <section>
              <h2 className="display mb-2 text-3xl">History</h2>
              <ul className="m-0 list-none p-0">
                {[...history].reverse().slice(0, 30).map((h) => (
                  <li key={h.workout.id + h.entry.id} className="border-b border-line py-2.5">
                    <Link to={`/app/history/${h.workout.id}`} className="flex items-baseline justify-between gap-3"><span className="font-semibold text-bone hover:text-[var(--accent)]">{h.workout.name}</span><span className="hud shrink-0">{fmtDate(h.at)}</span></Link>
                    <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {h.entry.sets.map((s) => <span key={s.id} className={s.type === 'warmup' ? 'text-muted' : ''}>{s.seconds && !s.reps ? fmtClock(s.seconds) : s.meters ? `${metersToDisplay(s.meters, settings.distance)} ${settings.distance}` : s.kg ? `${toDisplay(s.kg, unit)}×${s.reps}` : `${s.reps} reps`}{s.rpe ? ` @${s.rpe}` : ''}</span>)}
                    </div>
                    {!!h.bestE1rm && <div className="mt-0.5 text-[11px] text-muted">Top e1RM {fmt(toDisplay(Math.max(...h.entry.sets.filter((s) => s.type !== 'warmup').map((s) => e1rm(s.kg ?? 0, s.reps ?? 0))), unit), 1)} {unit}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      {editing && <ExerciseForm existing={e} onClose={() => setEditing(false)} />}
    </div>
  );
}
