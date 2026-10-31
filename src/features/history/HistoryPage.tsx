import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Plus, Search } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup, useProgress } from '@/state/derived';
import { workoutDuration, workoutSets, workoutVolume } from '@/domain/analytics';
import { fmtDate, fmtDuration, fmtVolume, monthKey } from '@/domain/util';
import { Empty, PageHead } from '@/ui/kit';
import type { Workout } from '@/domain/types';

export default function HistoryPage() {
  const workouts = useStore((s) => s.workouts);
  const unit = useStore((s) => s.settings.unit);
  const lookup = useLookup();
  const { records, ledger } = useProgress();
  const [q, setQ] = useState('');
  const [prOnly, setPrOnly] = useState(false);
  const list = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return [...workouts].sort((a, b) => b.completedAt - a.completedAt).filter((w) =>
      (!prOnly || (records.byWorkout.get(w.id)?.length ?? 0) > 0 || (w.legacy?.newPRs.length ?? 0) > 0) &&
      (!needle || w.name.toLowerCase().includes(needle) || w.exercises.some((e) => lookup(e.exerciseId)?.name.toLowerCase().includes(needle))));
  }, [workouts, q, prOnly, lookup, records]);
  const groups = useMemo(() => { const m = new Map<string, Workout[]>(); for (const w of list) { const k = monthKey(w.completedAt); (m.get(k) ?? m.set(k, []).get(k)!).push(w); } return [...m.entries()]; }, [list]);

  return (
    <div className="page">
      <PageHead kicker="The chronicle" title="History"><Link to="/app/history/new" className="btn" data-testid="log-past"><Plus size={14} /> Log past workout</Link></PageHead>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1"><Search size={15} aria-hidden className="absolute left-3 top-3.5 text-muted" /><input type="search" className="input pl-9" aria-label="Search history" placeholder="Workout or exercise" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button type="button" className="chip" aria-pressed={prOnly} onClick={() => setPrOnly((p) => !p)}>PRs only</button>
      </div>
      {!workouts.length && <Empty title="An unwritten chronicle" art={<History size={28} />} action={<Link to="/app/workout" className="btn btn-primary">Start training</Link>}>Every session you finish is kept here, ready to review or correct.</Empty>}
      {!!workouts.length && !list.length && <Empty title="No match">Try another search.</Empty>}
      {groups.map(([k, items]) => (
        <section key={k} className="mb-6">
          <h2 className="hud sticky top-[calc(var(--safe-t)+45px)] z-10 bg-void py-1.5 lg:top-0">{fmtDate(new Date(`${k}-15T12:00:00`), { month: 'long', year: 'numeric' })} · {items.length}</h2>
          <ul className="m-0 list-none p-0">
            {items.map((w) => {
              const prs = (records.byWorkout.get(w.id) ?? []).filter((e) => !['weight', 'volume'].includes(e.kind)).length + (w.legacy?.newPRs.length ?? 0);
              const xp = ledger.find((l) => l.workoutId === w.id)?.total ?? 0;
              return (
                <li key={w.id} className="lazy-row">
                  <Link to={`/app/history/${w.id}`} className="group flex min-h-16 items-center gap-3 border-b border-line py-2.5" data-testid="history-row">
                    <div className="w-11 shrink-0 text-center"><div className="display text-2xl leading-none">{new Date(w.completedAt).getDate()}</div><div className="hud text-[9px]">{fmtDate(w.completedAt, { weekday: 'short' })}</div></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-bone group-hover:text-[var(--accent)]">{w.name}{w.legacy && <span className="tag ml-2 align-middle">v1</span>}</div>
                      <div className="truncate text-xs text-muted">{workoutSets(w)} sets · {fmtVolume(workoutVolume(w), unit)}{workoutDuration(w) ? ` · ${fmtDuration(workoutDuration(w))}` : ''}{w.exercises.length ? ` · ${w.exercises.map((e) => lookup(e.exerciseId)?.name).slice(0, 3).join(', ')}` : ''}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      {prs > 0 && <div className="num text-[var(--accent)]">{prs} PR{prs === 1 ? '' : 's'}</div>}
                      {xp > 0 && <div className="num text-muted">+{xp} XP</div>}
                    </div>
                    <ArrowRight size={15} aria-hidden className="text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
