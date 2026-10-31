import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, BookOpen, Calculator, CalendarDays, Dumbbell, History, Home, ListChecks, Menu, Scale, Scroll, Settings, Shield, Trophy, Users, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useProgress } from '@/state/derived';
import { ACCENTS } from '@/domain/progression';
import { fmtClock } from '@/domain/util';
import { Bar, Button, Field, Loading, Dialog, cx, useNow } from './kit';
import { Logo } from './art';
import { RestTimerBar, useRestWatcher } from '@/features/workout/RestTimer';
import { useReminders } from '@/features/calendar/useReminders';

const NAV = [
  { to: '/app', label: 'Command', icon: Home, end: true },
  { to: '/app/workout', label: 'Train', icon: Dumbbell },
  { to: '/app/exercises', label: 'Arsenal', icon: BookOpen },
  { to: '/app/routines', label: 'Routines', icon: Scroll },
  { to: '/app/history', label: 'History', icon: History },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/body', label: 'Body', icon: Scale },
  { to: '/app/chamber', label: 'Chamber', icon: Shield },
  { to: '/app/quests', label: 'Quests', icon: ListChecks },
  { to: '/app/achievements', label: 'Achievements', icon: Trophy },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/tools', label: 'Tools', icon: Calculator },
  { to: '/app/community', label: 'Community', icon: Users },
  { to: '/app/profile', label: 'Profile', icon: Settings },
];
const TABS = [NAV[0], NAV[1], NAV[5], NAV[7]];

export function AppShell() {
  const progress = useProgress();
  const profile = useStore((s) => s.profile);
  const active = useStore((s) => s.active);
  const storageError = useStore((s) => s.storageError);
  const migrated = useStore((s) => s.migrated);
  const dismissMigration = useStore((s) => s.dismissMigration);
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useRestWatcher();
  useReminders();
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const accent = ACCENTS.find((a) => a.id === profile.equipped.accent && progress.unlockedAccents.has(a.id))?.color ?? '#ff6b2c';
  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);
  const onWorkout = loc.pathname === '/app/workout';

  return (
    <div className="min-h-dvh lg:pl-56">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="btn btn-primary fixed left-2 top-2 z-[80] -translate-y-20 focus:translate-y-0">Skip to content</a>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-ink lg:flex">
        <Link to="/" className="px-4 py-4" aria-label="Iron Quest home"><Logo /></Link>
        <LevelBlock />
        <nav aria-label="Primary" className="scrollbar-none mt-1 flex-1 overflow-y-auto pb-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-10 items-center gap-3 border-l-2 px-4 py-2 font-mono text-xs uppercase tracking-[.1em] transition-colors', isActive ? 'border-[var(--accent)] bg-white/5 text-bone' : 'border-transparent text-muted hover:text-bone')}>
              <n.icon size={16} aria-hidden /> {n.label}
              {n.to === '/app/workout' && active && <span className="ml-auto h-1.5 w-1.5 bg-[var(--accent)]" aria-label="workout in progress" />}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile top strip */}
      <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-line px-3 pb-1.5 pt-[calc(var(--safe-t)+.375rem)] lg:hidden">
        <Link to="/" aria-label="Iron Quest home"><Logo /></Link>
        <Link to="/app/chamber" className="ml-auto flex min-h-9 min-w-0 items-center gap-2" aria-label={`Level ${progress.level.level}, open Chamber`}>
          <span className="num text-xs text-bone">LV {progress.level.level}</span>
          <Bar pct={progress.level.pct} className="xp-bar w-20" label="XP progress" />
        </Link>
      </header>

      {storageError && (
        <div role="alert" className="flex items-start gap-2 border-b border-crimson bg-[#21090e] px-4 py-2 text-sm text-bone"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-crimson" /><span>{storageError}</span></div>
      )}
      {migrated && (
        <div className="flex flex-wrap items-center gap-3 border-b border-ember/50 bg-[#1a0f0a] px-4 py-2 text-sm text-bone" role="status">
          <span className="flex-1">Your earlier Iron Quest data came with you: {migrated.sessions} session{migrated.sessions === 1 ? '' : 's'} imported, with XP and records intact.{migrated.skipped ? ` ${migrated.skipped} unreadable row${migrated.skipped === 1 ? ' was' : 's were'} skipped.` : ''}</span>
          <Button size="sm" onClick={dismissMigration}>Got it</Button>
        </div>
      )}

      <main id="main" tabIndex={-1} className="outline-none">
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>

      <div className="fixed inset-x-0 bottom-[calc(var(--safe-b)+60px)] z-30 flex flex-col lg:bottom-0 lg:left-56">
        {active && !onWorkout && <ActiveStrip />}
        <RestTimerBar />
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Primary" className="glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line pb-[var(--safe-b)] lg:hidden">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex h-[60px] flex-col items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-[.06em]', isActive ? 'text-[var(--accent)]' : 'text-muted')}>
            <n.icon size={20} aria-hidden /> {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} aria-expanded={more} className="flex h-[60px] flex-col items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-[.06em] text-muted"><Menu size={20} aria-hidden /> More</button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 lg:hidden" onClick={() => setMore(false)}>
          <nav aria-label="All sections" className="border-t border-line bg-char p-3 pb-[calc(var(--safe-b)+.75rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><span className="hud">All sections</span><Button icon variant="ghost" aria-label="Close menu" onClick={() => setMore(false)}><X size={18} /></Button></div>
            <div className="grid grid-cols-3 gap-1.5">
              {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex min-h-[72px] flex-col items-center justify-center gap-1.5 border p-2 text-center font-mono text-[10px] uppercase tracking-[.06em]', isActive ? 'border-[var(--accent)] text-bone' : 'border-line text-silver')}><n.icon size={20} aria-hidden /> {n.label}</NavLink>)}
            </div>
          </nav>
        </div>
      )}
      <Onboarding />
    </div>
  );
}

function LevelBlock() {
  const p = useProgress();
  const name = useStore((s) => s.profile.name);
  return (
    <Link to="/app/chamber" className="mx-3 mb-2 block border border-line p-3 transition-colors hover:border-[#48525d]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-bone">{name || 'Unnamed'}</span>
        <span className="num text-xs text-bone">LV {p.level.level}</span>
      </div>
      <div className="hud mt-0.5 truncate">{p.title}</div>
      <Bar pct={p.level.pct} className="xp-bar mt-2" label="XP progress" />
      <div className="num mt-1 text-right text-[10px] text-muted">{p.level.into} / {p.level.need} XP</div>
    </Link>
  );
}

function ActiveStrip() {
  const active = useStore((s) => s.active)!;
  const now = useNow();
  const done = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return (
    <Link to="/app/workout" className="flex min-h-12 items-center gap-3 border-t border-[var(--accent)] bg-[#1a0f0a]/95 px-4 py-2 text-sm text-bone" data-testid="resume-strip">
      <Activity size={16} className="text-[var(--accent)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold">{active.name}</span>
      <span className="num text-xs">{done} sets</span>
      <span className="num text-xs">{fmtClock((now - active.startedAt) / 1000)}</span>
      <span className="hud text-[var(--accent)]">Resume</span>
    </Link>
  );
}

function Onboarding() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const workouts = useStore((s) => s.workouts.length);
  const save = useStore((s) => s.saveProfile);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [name, setName] = useState('');
  if (onboarded) return null;
  const finish = (n: string) => void save({ name: n.trim().slice(0, 40), onboarded: true });
  return (
    <Dialog open title={workouts ? 'Name your character' : 'Create your character'} onClose={() => finish('')}
      footer={<><Button variant="ghost" onClick={() => finish('')}>Skip for now</Button><Button variant="primary" onClick={() => finish(name)} data-testid="onboard-go">Enter the forge</Button></>}>
      <div className="space-y-4">
        <p className="text-sm">No account needed. Everything you log stays on this device unless you choose to sync it later.</p>
        <Field label="Character name"><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kael" autoFocus /></Field>
        <div>
          <span className="hud label">You lift in</span>
          <div className="flex gap-1">
            {(['kg', 'lb'] as const).map((u) => <button key={u} type="button" className="chip" aria-pressed={settings.unit === u} onClick={() => void saveSettings({ unit: u, distance: u === 'lb' ? 'mi' : 'km' })}>{u}</button>)}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
