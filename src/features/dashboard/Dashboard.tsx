import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Dumbbell, Flame, Play, Scroll } from 'lucide-react';
import { useStore } from '@/state/store';
import { useProgress, useStreaks, useTotals } from '@/state/derived';
import { workoutFromRoutine, blankWorkout } from '@/domain/workout-ops';
import { workoutDuration, workoutSets, workoutVolume } from '@/domain/analytics';
import { ACHIEVEMENTS, ACCENTS, equippedTier } from '@/domain/progression';
import { WEEKDAYS, addDays, dayKey, fmtDate, fmtDuration, fmtVolume, startOfWeek, weekday } from '@/domain/util';
import { Bar, Button, Empty, cx } from '@/ui/kit';
import { Sigil, WarriorArt } from '@/ui/art';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const profile = useStore((s) => s.profile);
  const workouts = useStore((s) => s.workouts);
  const routines = useStore((s) => s.routines);
  const unit = useStore((s) => s.settings.unit);
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);
  const nav = useNavigate();
  const p = useProgress();
  const t = useTotals();
  const st = useStreaks();

  const today = weekday(new Date());
  const due = routines.filter((r) => r.days.includes(today));
  const recent = useMemo(() => [...workouts].sort((a, b) => b.completedAt - a.completedAt).slice(0, 5), [workouts]);
  const trainedToday = workouts.some((w) => dayKey(w.completedAt) === dayKey(Date.now()));
  const weekDays = Array.from({ length: 7 }, (_, i) => dayKey(addDays(startOfWeek(Date.now()), i)));
  const trainedKeys = new Set(workouts.map((w) => dayKey(w.completedAt)));
  const quests = p.quests.filter((q) => !q.done).slice(0, 3);
  const nextAch = ACHIEVEMENTS.filter((a) => !p.achievements.has(a.id) && a.progress).map((a) => ({ a, pr: a.progress!(p.running) })).sort((x, y) => y.pr[0] / y.pr[1] - x.pr[0] / x.pr[1])[0];
  const accent = ACCENTS.find((a) => a.id === profile.equipped.accent && p.unlockedAccents.has(a.id))?.color ?? '#ff6b2c';

  const begin = (id?: string) => {
    if (!active) { const r = routines.find((x) => x.id === id); setActive(r ? workoutFromRoutine(r) : blankWorkout()); }
    nav('/app/workout');
  };

  return (
    <div>
      {/* Hero band: character on the right, editorial type on the left */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(45%_90%_at_78%_60%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%),linear-gradient(180deg,#0c0e11,#050607)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50" />
        <div className="relative mx-auto flex max-w-[1240px] items-end gap-4 px-4 pt-6 lg:px-10">
          <div className="min-w-0 flex-1 pb-6">
            <p className="hud text-[var(--accent)]">{p.title} · Level {p.level.level}</p>
            <h1 className="display mt-1 break-words text-[clamp(3rem,10vw,6.5rem)]">{profile.name || 'Warrior'}</h1>
            <div className="mt-3 max-w-md">
              <Bar pct={p.level.pct} className="xp-bar h-2" label="XP to next level" />
              <div className="num mt-1 flex justify-between text-xs text-muted"><span>{p.level.into} / {p.level.need} XP</span><span>{p.xp.toLocaleString()} total</span></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {active ? (
                <Link to="/app/workout" className="btn btn-primary"><Play size={15} /> Resume {active.name}</Link>
              ) : due[0] && !trainedToday ? (
                <Button variant="primary" onClick={() => begin(due[0].id)}><Play size={15} /> Start {due[0].name}</Button>
              ) : (
                <Button variant="primary" onClick={() => begin()} data-testid="dash-start"><Dumbbell size={15} /> Start workout</Button>
              )}
              <Link to="/app/routines" className="btn"><Scroll size={15} /> Routines</Link>
            </div>
          </div>
          <Link to="/app/chamber" aria-label="Open the Character Chamber" className="w-32 shrink-0 translate-y-1 sm:w-44 md:w-60">
            <WarriorArt tier={equippedTier(profile.equipped.armor, p)} accent={accent} relic={p.unlockedRelics.has(profile.equipped.relic) ? profile.equipped.relic : 'none'} />
          </Link>
        </div>
      </section>

      <div className="page">
        {/* This week */}
        <section aria-label="This week" className="grid gap-px border border-line bg-line sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="bg-ink p-3">
            <div className="hud mb-2">This week</div>
            <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0">
              {weekDays.map((k, i) => {
                const hit = trainedKeys.has(k); const isToday = i === today;
                const plan = routines.some((r) => r.days.includes(i));
                return (
                  <li key={k} className="text-center">
                    <div className={cx('mx-auto grid aspect-square w-full max-w-9 place-items-center border text-[10px]', hit ? 'border-[var(--accent)] bg-[var(--accent)] text-black' : isToday ? 'border-bone text-bone' : plan ? 'border-dashed border-line text-muted' : 'border-line/50 text-muted/70')} aria-label={`${WEEKDAYS[i]}${hit ? ', trained' : plan ? ', planned' : ''}`}>{hit ? <Flame size={13} /> : WEEKDAYS[i][0]}</div>
                  </li>
                );
              })}
            </ol>
          </div>
          <Kpi label="Week streak" value={st.currentWeeks} hint={`best ${st.bestWeeks}`} to="/app/calendar" testid="kpi-streak" />
          <Kpi label="Workouts" value={t.workouts} hint={`${t.sets.toLocaleString()} sets`} to="/app/history" testid="kpi-workouts" />
          <Kpi label="Total volume" value={fmtVolume(t.volume, unit)} hint={`${p.running.prs} personal record${p.running.prs === 1 ? '' : 's'}`} to="/app/analytics" testid="kpi-volume" />
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <section>
            <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-3xl">Recent battles</h2><Link to="/app/history" className="hud hover:text-bone">All history</Link></div>
            {!recent.length && <Empty title="Your story starts with one set" art={<Dumbbell size={28} />} action={<Button variant="primary" onClick={() => begin()}>Log your first workout</Button>}>Finish a session and it will show up here. XP, records and analytics all come from what you log.</Empty>}
            <ul className="m-0 list-none p-0">
              {recent.map((w) => (
                <li key={w.id}>
                  <Link to={`/app/history/${w.id}`} className="group flex min-h-16 items-center gap-3 border-b border-line py-2.5 transition-colors hover:border-[#48525d]" data-testid="recent-row">
                    <div className="w-12 shrink-0 text-center"><div className="display text-2xl leading-none">{new Date(w.completedAt).getDate()}</div><div className="hud text-[9px]">{fmtDate(w.completedAt, { month: 'short' })}</div></div>
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold text-bone">{w.name}</div><div className="truncate text-xs text-muted">{workoutSets(w)} sets · {fmtVolume(workoutVolume(w), unit)}{workoutDuration(w) ? ` · ${fmtDuration(workoutDuration(w))}` : ''}</div></div>
                    {(p.ledger.find((l) => l.workoutId === w.id)?.total ?? 0) > 0 && <span className="num text-xs text-[var(--accent)]">+{p.ledger.find((l) => l.workoutId === w.id)!.total} XP</span>}
                    <ArrowRight size={15} className="text-muted group-hover:text-bone" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <aside className="space-y-8">
            <section>
              <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-3xl">Active quests</h2><Link to="/app/quests" className="hud hover:text-bone">Board</Link></div>
              <ul className="m-0 list-none space-y-3 p-0">
                {quests.map((q) => (
                  <li key={q.id}>
                    <div className="flex justify-between gap-2 text-sm"><span className="truncate font-semibold text-bone">{q.title}</span><span className="num shrink-0 text-xs text-[var(--accent)]">+{q.xp} XP</span></div>
                    <Bar pct={(q.current / q.target) * 100} className="mt-1" label={q.title} />
                    <div className="num mt-0.5 text-[11px] text-muted">{q.current} / {q.target}{q.unit ?? ''} · {q.scope}</div>
                  </li>
                ))}
              </ul>
            </section>
            {nextAch && (
              <section className="flex items-center gap-3 border-t border-line pt-4">
                <Sigil glyph={nextAch.a.glyph} tier={nextAch.a.tier} locked />
                <div className="min-w-0 flex-1">
                  <div className="hud">Next achievement</div>
                  <Link to="/app/achievements" className="font-semibold text-bone hover:text-[var(--accent)]">{nextAch.a.name}</Link>
                  <Bar pct={(nextAch.pr[0] / nextAch.pr[1]) * 100} className="mt-1" label={nextAch.a.name} />
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, to, testid }: { label: string; value: React.ReactNode; hint: string; to: string; testid?: string }) {
  return (
    <Link to={to} className="block bg-ink p-3 transition-colors hover:bg-char">
      <div className="hud">{label}</div>
      <div className="stat mt-1 truncate" data-testid={testid}>{value}</div>
      <div className="mt-1 truncate text-xs text-muted">{hint}</div>
    </Link>
  );
}
