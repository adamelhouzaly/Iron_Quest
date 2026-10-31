import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Share2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup, useProgress } from '@/state/derived';
import { ACHIEVEMENTS, TITLES, computeProgress, equippedTier } from '@/domain/progression';
import { PR_LABEL } from '@/domain/records';
import { workoutDuration, workoutSets, workoutVolume } from '@/domain/analytics';
import { fmtDuration, fmtVolume, fmt, toDisplay } from '@/domain/util';
import { Bar, Button, Stat, useReducedMotion } from '@/ui/kit';
import { Sigil, WarriorArt } from '@/ui/art';

/** The payoff screen. All numbers come from comparing character state with and without this session. */
export default function CompletePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const workouts = useStore((s) => s.workouts);
  const goals = useStore((s) => s.goals);
  const legacy = useStore((s) => s.legacy);
  const profile = useStore((s) => s.profile);
  const unit = useStore((s) => s.settings.unit);
  const lookup = useLookup();
  const progress = useProgress();
  const reduced = useReducedMotion();
  const w = workouts.find((x) => x.id === id);

  const before = useMemo(() => computeProgress({ workouts: workouts.filter((x) => x.id !== id), goals, legacy, profile, lookup }), [workouts, id, goals, legacy, profile, lookup]);
  const gained = progress.xp - before.xp;
  const [shown, setShown] = useState(reduced ? gained : 0);
  useEffect(() => {
    if (reduced) { setShown(gained); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / 1200); setShown(Math.round(gained * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gained, reduced]);

  useEffect(() => { if (!w) nav('/app', { replace: true }); }, [w, nav]);
  if (!w) return null;
  const leveled = progress.level.level > before.level.level;
  const newTitle = leveled ? [...TITLES].reverse().find((t) => t.level <= progress.level.level && t.level > before.level.level) : undefined;
  const prs = (progress.records.byWorkout.get(w.id) ?? []).filter((e) => !(['weight', 'volume'] as string[]).includes(e.kind));
  const unlocked = ACHIEVEMENTS.filter((a) => progress.achievements.has(a.id) && !before.achievements.has(a.id));
  const items = progress.ledger.filter((l) => !before.ledger.some((b) => b.id === l.id));
  const notes = items.flatMap((l) => l.notes);
  const ease = { duration: reduced ? 0 : 0.5, ease: [0.2, 0.8, 0.2, 1] as const };

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_0%,rgba(255,107,44,.22),transparent_70%)]" />
      <div className="page relative">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={ease} className="hud text-[var(--accent)]">Session recorded</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...ease, delay: reduced ? 0 : 0.1 }} className="display mt-1 text-6xl md:text-8xl">{leveled ? `Level ${progress.level.level}` : 'Forged.'}</motion.h1>
        {leveled && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 0.5 }} className="mt-2 text-lg text-bone" data-testid="level-up">You leveled up{newTitle ? <> and earned the title <b>{newTitle.name}</b></> : null}.</motion.p>}

        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,240px)_1fr]">
          <motion.div initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...ease, delay: reduced ? 0 : 0.2 }} className="mx-auto w-44 md:w-full">
            <WarriorArt tier={equippedTier(profile.equipped.armor, progress)} accent="var(--accent)" relic={progress.unlockedRelics.has(profile.equipped.relic) ? profile.equipped.relic : 'none'} />
          </motion.div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="display text-7xl text-[var(--accent)]" data-testid="xp-gained">+{fmt(shown)}</span><span className="hud">XP earned</span>
            </div>
            <div className="mt-2"><Bar pct={progress.level.pct} className="xp-bar" label="XP to next level" /><div className="num mt-1 text-xs text-muted">Level {progress.level.level} · {progress.level.into} / {progress.level.need} XP</div></div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-y border-line py-4">
              <Stat label="Volume" value={fmtVolume(workoutVolume(w), unit)} />
              <Stat label="Sets" value={workoutSets(w)} />
              <Stat label="Time" value={fmtDuration(workoutDuration(w))} />
            </div>

            <div className="mt-4">
              <h2 className="hud mb-1">Where it came from</h2>
              <ul className="m-0 list-none p-0 text-sm">
                {items.flatMap((l) => l.items.map((i) => ({ ...i, key: l.id + i.label }))).map((i) => (
                  <li key={i.key} className="flex justify-between gap-3 border-b border-line/50 py-1.5"><span>{i.label}</span><span className="num text-bone">+{i.xp}</span></li>
                ))}
              </ul>
              {notes.map((n) => <p key={n} className="mt-1 text-xs text-muted">{n}</p>)}
            </div>
          </div>
        </div>

        {prs.length > 0 && (
          <section className="mt-8">
            <h2 className="display mb-2 text-3xl">Personal records</h2>
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {prs.map((p, i) => (
                <motion.li key={p.setId + p.kind} initial={{ opacity: 0, x: reduced ? 0 : -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduced ? 0 : 0.5 + i * 0.1 }} className="border border-[var(--accent)]/60 bg-[#1a0f0a] p-3" data-testid="pr-row">
                  <p className="font-semibold text-bone">{lookup(p.exerciseId)?.name}</p>
                  <p className="text-xs text-silver">{PR_LABEL[p.kind]}{p.kind === 'e1rm' ? `: ${fmt(toDisplay(p.value, unit), 1)} ${unit}` : ''}{p.kg ? ` · ${toDisplay(p.kg, unit)} ${unit} × ${p.reps}` : ''}</p>
                </motion.li>
              ))}
            </ul>
          </section>
        )}

        {unlocked.length > 0 && (
          <section className="mt-8">
            <h2 className="display mb-2 text-3xl">Unlocked</h2>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
              {unlocked.map((a) => <li key={a.id} className="flex items-center gap-3"><Sigil glyph={a.glyph} tier={a.tier} /><div><p className="font-semibold text-bone">{a.name}</p><p className="text-xs text-muted">{a.description}</p></div></li>)}
            </ul>
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/app" className="btn btn-primary" data-testid="complete-done">Return to command</Link>
          <Link to={`/app/history/${w.id}`} className="btn">View session</Link>
          <Link to={`/app/history/${w.id}?share=1`} className="btn"><Share2 size={14} /> Share</Link>
          <Button variant="ghost" onClick={() => nav('/app/chamber')}>See your character</Button>
        </div>
      </div>
    </div>
  );
}
