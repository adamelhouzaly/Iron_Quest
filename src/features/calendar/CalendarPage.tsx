import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useStore } from '@/state/store';
import { workoutFromRoutine } from '@/domain/workout-ops';
import { workoutSets, workoutVolume } from '@/domain/analytics';
import { WEEKDAYS, addDays, dayKey, fmtDate, fmtVolume, startOfWeek, weekday } from '@/domain/util';
import { Button, PageHead, cx } from '@/ui/kit';

export default function CalendarPage() {
  const workouts = useStore((s) => s.workouts);
  const routines = useStore((s) => s.routines);
  const unit = useStore((s) => s.settings.unit);
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);
  const nav = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(dayKey(Date.now()));
  const byDay = useMemo(() => { const m = new Map<string, typeof workouts>(); for (const w of workouts) { const k = dayKey(w.completedAt); (m.get(k) ?? m.set(k, []).get(k)!).push(w); } return m; }, [workouts]);
  const start = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = dayKey(Date.now());
  const sel = new Date(`${selected}T12:00:00`);
  const selWorkouts = byDay.get(selected) ?? [];
  const selPlan = routines.filter((r) => r.days.includes(weekday(sel)));
  const monthCount = workouts.filter((w) => { const d = new Date(w.completedAt); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); }).length;
  return (
    <div className="page">
      <PageHead kicker="Campaign map" title="Calendar">
        <Button icon aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></Button>
        <Button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today); }}>Today</Button>
        <Button icon aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></Button>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-3xl" data-testid="cal-month">{fmtDate(month, { month: 'long', year: 'numeric' })}</h2><span className="hud">{monthCount} session{monthCount === 1 ? '' : 's'}</span></div>
          <div className="grid grid-cols-7 gap-px border border-line bg-line">
            {WEEKDAYS.map((d) => <div key={d} className="hud bg-ink py-1 text-center text-[9px]">{d}</div>)}
            {cells.map((d) => {
              const k = dayKey(d);
              const inMonth = d.getMonth() === month.getMonth();
              const n = byDay.get(k)?.length ?? 0;
              const planned = k >= today && routines.some((r) => r.days.includes(weekday(d)));
              return (
                <button key={k} type="button" onClick={() => setSelected(k)} aria-pressed={k === selected} aria-label={`${fmtDate(d)}${n ? `, ${n} workout${n === 1 ? '' : 's'}` : ''}${planned ? ', planned' : ''}`} className={cx('relative aspect-square min-h-11 bg-ink p-1 text-left align-top transition-colors hover:bg-char', !inMonth && 'bg-void', k === selected && 'outline outline-2 -outline-offset-2 outline-[var(--accent)]')} data-testid={n ? 'cal-trained' : undefined}>
                  <span className={cx('num text-xs', k === today ? 'font-bold text-[var(--accent)]' : inMonth ? 'text-silver' : 'text-muted/50')}>{d.getDate()}</span>
                  {n > 0 && <span className="absolute inset-x-1 bottom-1 h-1.5 bg-[var(--accent)]" />}
                  {!n && planned && inMonth && <span className="absolute inset-x-1 bottom-1 h-1.5 border border-dashed border-muted/50" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted"><i className="inline-block h-1.5 w-4 bg-[var(--accent)]" /> trained <i className="ml-2 inline-block h-1.5 w-4 border border-dashed border-muted" /> planned. Set training days on any routine.</p>
        </section>
        <aside>
          <h2 className="display mb-2 text-3xl">{fmtDate(sel, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          {!selWorkouts.length && !selPlan.length && <p className="text-sm text-muted">Nothing here. {selected <= today ? 'A rest day counts too.' : 'Nothing is planned.'}</p>}
          <ul className="m-0 list-none p-0">{selWorkouts.map((w) => <li key={w.id}><Link to={`/app/history/${w.id}`} className="block border-b border-line py-2"><span className="font-semibold text-bone hover:text-[var(--accent)]">{w.name}</span><span className="block text-xs text-muted">{workoutSets(w)} sets · {fmtVolume(workoutVolume(w), unit)}</span></Link></li>)}</ul>
          {selected >= today && selPlan.map((r) => (
            <div key={r.id} className="mt-2 flex items-center gap-2 border border-dashed border-line p-2.5">
              <div className="min-w-0 flex-1"><div className="hud">Planned</div><div className="truncate font-semibold text-bone">{r.name}</div></div>
              {selected === today && <Button size="sm" variant="primary" disabled={!!active} onClick={() => { setActive(workoutFromRoutine(r)); nav('/app/workout'); }}><Play size={13} /> Start</Button>}
            </div>
          ))}
          {selected === today && !!active && selPlan.length > 0 && <p className="mt-2 text-xs text-muted">Finish your current workout to start another.</p>}
          <Link to="/app/profile#reminders" className="hud mt-4 block hover:text-bone">Set up reminders</Link>
        </aside>
      </div>
    </div>
  );
}
