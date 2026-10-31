import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, BarChart3 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useAllExercises, useLookup, useProgress, useStreaks, useTotals } from '@/state/derived';
import { MUSCLES, MUSCLE_LABEL, RANGES, inRange, monthlySummaries, muscleSets, pctChange, rangeBounds, totals, weeklySeries, workoutDuration, yearlySummaries, type RangeKey } from '@/domain/analytics';
import { PR_LABEL, exerciseHistory, type PRKind } from '@/domain/records';
import { WEEKDAYS, addDays, dayKey, fmt, fmtDate, fmtDuration, fmtVolume, startOfWeek, toDisplay, weekday } from '@/domain/util';
import { Button, Empty, PageHead, Segmented, Stat, cx } from '@/ui/kit';
import { BarsChart, LinesChart } from '@/ui/charts';

type Tab = 'overview' | 'exercise' | 'muscles' | 'records' | 'reports';

export default function AnalyticsPage() {
  const workouts = useStore((s) => s.workouts);
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<RangeKey>('12w');
  return (
    <div className="page">
      <PageHead kicker="Intelligence" title="Analytics">
        <Link to="/app/body" className="btn">Body metrics</Link>
      </PageHead>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Analytics section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'exercise', label: 'Exercise' }, { value: 'muscles', label: 'Muscles' }, { value: 'records', label: 'Records' }, { value: 'reports', label: 'Reports' }]} />
        {tab !== 'records' && tab !== 'reports' && <Segmented label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} />}
      </div>
      {!workouts.length ? (
        <Empty title="No data to read yet" art={<BarChart3 size={28} />} action={<Link to="/app/workout" className="btn btn-primary">Log a workout</Link>}>Every chart here is calculated from sessions you've logged. Nothing is estimated until there's something to estimate from.</Empty>
      ) : tab === 'overview' ? <Overview range={range} /> : tab === 'exercise' ? <ExerciseTab range={range} /> : tab === 'muscles' ? <MusclesTab range={range} /> : tab === 'records' ? <RecordsTab /> : <ReportsTab />}
    </div>
  );
}

function Delta({ now, prev }: { now: number; prev: number | null }) {
  if (prev === null) return null;
  const pct = pctChange(now, prev);
  if (pct === null) return <span>no earlier data</span>;
  const up = pct >= 0;
  // Past +300% a percentage stops meaning much (usually a near-empty previous period).
  return <span className="inline-flex items-center gap-0.5">{up ? <ArrowUp size={11} aria-label="up" /> : <ArrowDown size={11} aria-label="down" />}{pct > 300 ? 'well up' : `${Math.abs(Math.round(pct))}%`} vs previous</span>;
}

function Overview({ range }: { range: RangeKey }) {
  const workouts = useStore((s) => s.workouts);
  const unit = useStore((s) => s.settings.unit);
  const all = useTotals();
  const st = useStreaks();
  const { from, prevFrom } = rangeBounds(range);
  const cur = useMemo(() => inRange(workouts, from), [workouts, from]);
  const prev = useMemo(() => (prevFrom === null ? null : inRange(workouts, prevFrom, from)), [workouts, prevFrom, from]);
  const t = totals(cur), pt = prev ? totals(prev) : null;
  const weeks = useMemo(() => weeklySeries(workouts, from), [workouts, from]);
  const data = weeks.map((w) => ({ week: w.start, volume: toDisplay(w.volume, unit), workouts: w.workouts, sets: w.sets, minutes: Math.round(w.minutes) }));
  const wk = (v: string | number) => fmtDate(Number(v), { month: 'short', day: 'numeric' });
  const fv = (v: number) => `${fmt(v)} ${unit}`;
  const timed = cur.filter((w) => workoutDuration(w) > 0);
  return (
    <div className="space-y-6">
      <section aria-label="Summary for the selected range" className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-line py-4 md:grid-cols-4">
        <Stat label="Workouts" value={<span data-testid="a-workouts">{t.workouts}</span>} hint={<Delta now={t.workouts} prev={pt?.workouts ?? null} />} />
        <Stat label="Sets" value={<span data-testid="a-sets">{t.sets.toLocaleString()}</span>} hint={<Delta now={t.sets} prev={pt?.sets ?? null} />} />
        <Stat label="Volume" value={<span data-testid="a-volume">{fmtVolume(t.volume, unit)}</span>} hint={<Delta now={t.volume} prev={pt?.volume ?? null} />} />
        <Stat label="Avg session" value={timed.length ? fmtDuration(timed.reduce((n, w) => n + workoutDuration(w), 0) / timed.length) : '—'} hint={`${fmtDuration(t.seconds)} total`} />
      </section>
      <div className="grid gap-3 xl:grid-cols-2">
        <BarsChart title="Training volume" subtitle="Per week" data={data} x="week" xFormat={wk} y={{ key: 'volume', label: 'Volume', format: fv }} />
        <BarsChart title="Weekly frequency" subtitle="Workouts per week" data={data} x="week" xFormat={wk} y={{ key: 'workouts', label: 'Workouts' }} />
        <BarsChart title="Sets" subtitle="Per week" data={data} x="week" xFormat={wk} y={{ key: 'sets', label: 'Sets' }} />
        <BarsChart title="Training time" subtitle="Minutes per week" data={data} x="week" xFormat={wk} y={{ key: 'minutes', label: 'Minutes', format: (v) => `${v} min` }} />
      </div>
      <section>
        <h2 className="display mb-1 text-3xl">Consistency</h2>
        <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Week streak" value={st.currentWeeks} hint="Rest days never break it" />
          <Stat label="Best streak" value={`${st.bestWeeks}w`} />
          <Stat label="Best day run" value={`${st.bestDays}d`} />
          <Stat label="Active days" value={st.activeDays} hint={`${all.workouts} all-time workouts`} />
        </div>
        <Heatmap />
      </section>
    </div>
  );
}

function Heatmap() {
  const workouts = useStore((s) => s.workouts);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const w of workouts) { const k = dayKey(w.completedAt); m.set(k, (m.get(k) ?? 0) + 1); } return m; }, [workouts]);
  const start = addDays(startOfWeek(Date.now()), -7 * 25);
  const today = dayKey(Date.now());
  const days = Array.from({ length: 26 * 7 }, (_, i) => addDays(start, i));
  return (
    <div className="overflow-x-auto" role="img" aria-label={`Training calendar for the last 26 weeks, ${[...counts.keys()].filter((k) => k >= dayKey(start)).length} active days`}>
      <div className="inline-grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 13px)' }}>
        {days.map((d) => {
          const k = dayKey(d); const n = counts.get(k) ?? 0;
          if (k > today) return <span key={k} />;
          return <Link key={k} to="/app/calendar" title={`${fmtDate(d)}: ${n} workout${n === 1 ? '' : 's'}`} aria-hidden tabIndex={-1} className={cx('h-[13px] w-[13px]', n === 0 ? 'bg-[#15191d]' : n === 1 ? 'bg-[#a8421a]' : 'bg-[var(--accent)]', k === today && 'outline outline-1 outline-bone')} />;
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><span>{WEEKDAYS[weekday(start)]} to {WEEKDAYS[6]} top to bottom.</span><i className="inline-block h-2.5 w-2.5 bg-[#15191d]" /> rest <i className="ml-1 inline-block h-2.5 w-2.5 bg-[#a8421a]" /> 1 <i className="ml-1 inline-block h-2.5 w-2.5 bg-[var(--accent)]" /> 2+</p>
    </div>
  );
}

function ExerciseTab({ range }: { range: RangeKey }) {
  const workouts = useStore((s) => s.workouts);
  const unit = useStore((s) => s.settings.unit);
  const exercises = useAllExercises();
  const { records } = useProgress();
  const logged = useMemo(() => exercises.filter((e) => workouts.some((w) => w.exercises.some((x) => x.exerciseId === e.id && x.sets.some((s) => s.done)))), [exercises, workouts]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const id = a || logged[0]?.id || '';
  const { from } = rangeBounds(range);
  const merged = useMemo(() => {
    const m = new Map<number, Record<string, number | null | string>>();
    for (const h of exerciseHistory(workouts, id).filter((x) => x.at >= from)) m.set(h.at, { at: h.at, a: toDisplay(h.bestE1rm, unit) || null, volume: toDisplay(h.volume, unit) });
    if (b) for (const h of exerciseHistory(workouts, b).filter((x) => x.at >= from)) m.set(h.at, { at: h.at, ...(m.get(h.at) ?? {}), b: toDisplay(h.bestE1rm, unit) || null });
    return [...m.values()].sort((x, y) => Number(x.at) - Number(y.at));
  }, [workouts, id, b, from, unit]);
  if (!logged.length) return <Empty title="No per-exercise records yet">Imported v1 sessions only contain totals. Log a session here to unlock exercise charts.</Empty>;
  const name = (x: string) => logged.find((e) => e.id === x)?.name ?? '';
  const f = (v: number) => `${fmt(v, 1)} ${unit}`;
  const dt = (v: string | number) => fmtDate(Number(v), { month: 'short', day: 'numeric' });
  const best = records.bests.get(id);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label><span className="hud label">Exercise</span><select className="input" value={id} onChange={(e) => setA(e.target.value)} data-testid="an-exercise">{logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label><span className="hud label">Compare with</span><select className="input" value={b} onChange={(e) => setB(e.target.value)}><option value="">Nothing</option>{logged.filter((e) => e.id !== id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      </div>
      {best && <div className="grid grid-cols-3 gap-4 border-y border-line py-3"><Stat label="Best e1RM" value={f(toDisplay(best.e1rm, unit))} /><Stat label="Heaviest" value={f(toDisplay(best.weight, unit))} /><Stat label="Best set" value={fmtVolume(best.volume, unit)} /></div>}
      {!merged.length ? <Empty title="Nothing in this range">Try a longer time range.</Empty> : (
        <div className="grid gap-3 xl:grid-cols-2">
          <LinesChart title="Estimated 1RM" subtitle="Best set per session (Epley estimate, not a tested max)" data={merged as never} x="at" xFormat={dt} series={b ? [{ key: 'a', label: name(id), format: f }, { key: 'b', label: name(b), format: f }] : [{ key: 'a', label: name(id), format: f }]} />
          <LinesChart title={`${name(id)} volume`} subtitle="Per session" data={merged as never} x="at" xFormat={dt} series={[{ key: 'volume', label: 'Volume', format: f }]} />
        </div>
      )}
      <Link to={`/app/exercises/${id}`} className="btn">Full history for {name(id)}</Link>
    </div>
  );
}

function MusclesTab({ range }: { range: RangeKey }) {
  const workouts = useStore((s) => s.workouts);
  const lookup = useLookup();
  const { from } = rangeBounds(range);
  const cur = useMemo(() => inRange(workouts, from), [workouts, from]);
  const weeks = useMemo(() => Math.max(1, weeklySeries(workouts, from).length), [workouts, from]);
  const sets = useMemo(() => muscleSets(cur, lookup), [cur, lookup]);
  const rows = MUSCLES.map((m) => ({ m, total: sets.get(m) ?? 0, perWeek: (sets.get(m) ?? 0) / weeks })).filter((r) => r.m !== 'cardio').sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.perWeek));
  const [week, setWeek] = useState(0);
  const start = addDays(startOfWeek(Date.now()), -7 * week);
  const thisWeek = useMemo(() => muscleSets(inRange(workouts, start.getTime(), addDays(start, 7).getTime()), lookup), [workouts, start, lookup]);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section data-testid="muscle-avg">
        <h2 className="display text-3xl">Average per week</h2>
        <p className="mb-3 text-xs text-muted">Hard sets: completed working sets. A primary mover counts 1, a secondary mover 0.5.</p>
        <ul className="m-0 list-none space-y-1.5 p-0">
          {rows.map((r) => (
            <li key={r.m} className="grid grid-cols-[92px_1fr_40px] items-center gap-2 text-sm">
              <span className="truncate text-xs">{MUSCLE_LABEL[r.m]}</span>
              <div className="h-3 bg-[#14181c]"><div className="h-full bg-[#e85a20]" style={{ width: `${(r.perWeek / max) * 100}%` }} /></div>
              <span className="num text-right text-xs text-bone">{fmt(r.perWeek, 1)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="display text-3xl">Week of {fmtDate(start, { month: 'short', day: 'numeric' })}</h2>
          <div className="flex gap-1"><Button size="sm" aria-label="Previous week" onClick={() => setWeek((w) => w + 1)}>←</Button><Button size="sm" aria-label="Next week" disabled={week === 0} onClick={() => setWeek((w) => w - 1)}>→</Button></div>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 text-sm sm:grid-cols-3">
          {MUSCLES.filter((m) => m !== 'cardio').map((m) => <li key={m} className="flex justify-between border-b border-line/50 py-1"><span className="truncate text-xs">{MUSCLE_LABEL[m]}</span><span className={cx('num text-xs', (thisWeek.get(m) ?? 0) ? 'text-bone' : 'text-muted')}>{fmt(thisWeek.get(m) ?? 0, 1)}</span></li>)}
        </ul>
      </section>
    </div>
  );
}

function RecordsTab() {
  const unit = useStore((s) => s.settings.unit);
  const lookup = useLookup();
  const { records } = useProgress();
  const legacy = useStore((s) => s.legacy);
  const rows = [...records.bests.entries()].filter(([, b]) => b.e1rm > 0 || b.reps > 0 || b.time > 0).map(([id, b]) => ({ id, b, name: lookup(id)?.name ?? 'Deleted exercise' })).sort((a, b) => b.b.e1rm - a.b.e1rm || a.name.localeCompare(b.name));
  const recent = [...records.events].filter((e) => !(['weight', 'volume'] as PRKind[]).includes(e.kind)).sort((a, b) => b.at - a.at).slice(0, 12);
  if (!rows.length) return <Empty title="No records yet">Your first performance on an exercise sets the bar. Beat it next time.</Empty>;
  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <section className="min-w-0">
        <h2 className="display mb-2 text-3xl">All-time bests</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm" data-testid="records-table">
          <thead><tr className="hud text-left"><th className="py-1 font-medium">Exercise</th><th className="py-1 text-right font-medium">e1RM</th><th className="py-1 text-right font-medium">Heaviest</th><th className="py-1 text-right font-medium">Best set</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-line/60"><td className="py-2 pr-2"><Link to={`/app/exercises/${r.id}`} className="font-semibold text-bone hover:text-[var(--accent)]">{r.name}</Link></td>
              <td className="num py-2 text-right" data-testid="record-e1rm">{r.b.e1rm ? fmt(toDisplay(r.b.e1rm, unit), 1) : '—'}</td><td className="num py-2 text-right">{r.b.weight ? fmt(toDisplay(r.b.weight, unit), 1) : '—'}</td><td className="num py-2 text-right">{r.b.volume ? fmt(toDisplay(r.b.volume, unit)) : '—'}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-muted">Weights in {unit}.{legacy?.prs.length ? ' Includes records carried over from v1.' : ''}</p>
      </section>
      <section>
        <h2 className="display mb-2 text-3xl">Latest</h2>
        {!recent.length && <p className="text-sm text-muted">No new records yet. A first attempt is a baseline; the second can be a record.</p>}
        <ul className="m-0 list-none p-0">{recent.map((e) => <li key={e.setId + e.kind} className="border-b border-line/60 py-2"><div className="truncate text-sm font-semibold text-bone">{lookup(e.exerciseId)?.name}</div><div className="flex justify-between text-xs text-muted"><span>{PR_LABEL[e.kind]}</span><span>{fmtDate(e.at)}</span></div></li>)}</ul>
      </section>
    </div>
  );
}

function ReportsTab() {
  const workouts = useStore((s) => s.workouts);
  const unit = useStore((s) => s.settings.unit);
  const months = useMemo(() => monthlySummaries(workouts), [workouts]);
  const years = useMemo(() => yearlySummaries(workouts), [workouts]);
  const T = ({ rows, label, fmtKey }: { rows: typeof months; label: string; fmtKey: (k: string) => string }) => (
    <section className="min-w-0"><h2 className="display mb-2 text-3xl">{label}</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-sm">
        <thead><tr className="hud text-left"><th className="py-1 font-medium">Period</th><th className="py-1 text-right font-medium">Workouts</th><th className="py-1 text-right font-medium">Days</th><th className="py-1 text-right font-medium">Sets</th><th className="py-1 text-right font-medium">Volume</th><th className="py-1 text-right font-medium">Time</th></tr></thead>
        <tbody>{rows.map((m) => <tr key={m.month} className="border-t border-line/60"><td className="py-2 text-bone">{fmtKey(m.month)}</td><td className="num py-2 text-right">{m.workouts}</td><td className="num py-2 text-right">{m.days}</td><td className="num py-2 text-right">{m.sets.toLocaleString()}</td><td className="num py-2 text-right">{fmtVolume(m.volume, unit)}</td><td className="num py-2 text-right">{fmtDuration(m.minutes * 60)}</td></tr>)}</tbody>
      </table></div></section>
  );
  return <div className="space-y-8"><T rows={years} label="Yearly" fmtKey={(k) => k} /><T rows={months} label="Monthly" fmtKey={(k) => fmtDate(new Date(`${k}-15T12:00:00`), { month: 'long', year: 'numeric' })} /></div>;
}
