import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useInView } from 'motion/react';
import { ArrowDown, Check } from 'lucide-react';
import { useStore } from '@/state/store';
import { useProgress } from '@/state/derived';
import { EXERCISES } from '@/data/exercises';
import { PROGRAMS } from '@/data/templates';
import { ACHIEVEMENTS, ARMORS, XP } from '@/domain/progression';
import { Logo, Sigil, WarriorArt } from '@/ui/art';
import { cx, useReducedMotion } from '@/ui/kit';
import { canRunWebGL, isSmallScreen } from '@/three/support';
import type { Stage } from '@/three/stage';

const CHAPTERS = ['The Beginning', 'The Warrior', 'The Training System', 'The Progression', 'The Arsenal', 'Enter the Quest'];

/** Drawn fallback for no-WebGL, reduced motion and slow devices. Also what paints before 3D is ready. */
function FallbackWorld({ scrollRef, reduced }: { scrollRef: React.RefObject<number>; reduced: boolean }) {
  const warrior = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const fog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced) return;
    let raf = 0; let px = 0;
    // Paint only when something moved. An idle page should cost nothing on a weak device.
    const paint = () => {
      raf = 0;
      const s = scrollRef.current ?? 0;
      if (warrior.current) warrior.current.style.transform = `translate3d(${px * -10}px, ${s * -60}px, 0) scale(${1 + s * 0.18})`;
      if (far.current) far.current.style.transform = `translate3d(${px * -24}px, ${s * -30}px, 0)`;
      if (fog.current) fog.current.style.transform = `translate3d(${px * 18}px, ${s * -120}px, 0)`;
    };
    const request = () => { raf ||= requestAnimationFrame(paint); };
    const onMove = (e: PointerEvent) => { px = (e.clientX / innerWidth) * 2 - 1; request(); };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('scroll', request, { passive: true });
    request();
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); removeEventListener('scroll', request); };
  }, [reduced, scrollRef]);
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" data-testid="fallback-world">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#030405_0%,#0a0c0f_38%,#2a1208_52%,#6a2a10_54%,#120a07_58%,#050607_100%)]" />
      <div ref={far} className="absolute inset-0 will-change-transform">
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
          <g fill="#0b0d10">
            {[[60, 300], [170, 420], [290, 250], [410, 380], [1110, 360], [1240, 240], [1360, 420], [1490, 280]].map(([x, h]) => <rect key={x} x={x} y={490 - h} width="76" height={h + 400} />)}
          </g>
          <circle cx="800" cy="360" r="280" fill="none" stroke="#14171b" strokeWidth="38" strokeDasharray="200 22" />
          <circle cx="800" cy="360" r="256" fill="none" stroke="var(--color-ember)" strokeWidth="3" strokeDasharray="200 44" opacity=".7" />
          <text x="800" y="300" textAnchor="middle" fill="#c8ced6" opacity=".13" fontFamily="var(--font-display)" fontWeight="900" fontSize="330">IRON QUEST</text>
        </svg>
      </div>
      <div ref={warrior} className="absolute inset-x-0 bottom-[2%] flex h-[62%] justify-center will-change-transform md:h-[78%] md:justify-end md:pr-[9%]"><WarriorArt tier={3} accent="#ff6b2c" relic="hammer" className="h-full" /></div>
      <div ref={fog} className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_60%_at_30%_100%,rgba(140,150,160,.22),transparent),radial-gradient(60%_50%_at_75%_100%,rgba(255,107,44,.16),transparent)] will-change-transform" />
    </div>
  );
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-12% 0px' });
  const reduced = useReducedMotion();
  return <motion.div ref={ref} className={className} initial={reduced ? false : { opacity: 0, y: 28, filter: 'blur(6px)' }} animate={seen || reduced ? { opacity: 1, y: 0, filter: 'blur(0px)' } : undefined} transition={{ duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>;
}

function Chapter({ n, title, children, align = 'left', id }: { n: number; title: string; children: ReactNode; align?: 'left' | 'right' | 'center'; id: string }) {
  return (
    <section id={id} className={cx('relative flex min-h-[135vh] items-center px-4 py-24 md:px-10', align === 'right' && 'md:justify-end', align === 'center' && 'justify-center text-center')} aria-labelledby={`${id}-t`}>
      <div className={cx('relative w-full max-w-xl lg:max-w-2xl', align === 'center' && 'max-w-3xl')}>
        <Reveal><p className="hud mb-3 text-ember">Chapter {String(n).padStart(2, '0')}</p></Reveal>
        <Reveal delay={0.06}><h2 id={`${id}-t`} className="display text-[clamp(3.25rem,8.5vw,7.25rem)] [text-shadow:0_4px_40px_rgba(0,0,0,.8)]">{title}</h2></Reveal>
        <Reveal delay={0.14} className="mt-5">{children}</Reveal>
      </div>
    </section>
  );
}

const Backing = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('glass border border-line/70 p-4', className)}>{children}</div>;

/** A working miniature of the logger. It is a real interaction, and clearly labelled as a demo. */
function DemoLogger() {
  const [kg, setKg] = useState('60');
  const [reps, setReps] = useState('10');
  const [done, setDone] = useState<boolean[]>([false, false, false]);
  const count = done.filter(Boolean).length;
  const xp = count * XP.SET;
  return (
    <Backing>
      <div className="flex items-baseline justify-between"><span className="display text-2xl">Bench Press</span><span className="hud">Try it · not saved</span></div>
      <div className="mt-2 space-y-1.5">
        {done.map((d, i) => (
          <div key={i} className={cx('grid grid-cols-[28px_1fr_1fr_44px] items-center gap-1.5', d && 'set-done')}>
            <span className="num text-center text-sm text-bone">{i + 1}</span>
            <input aria-label={`Demo set ${i + 1} weight`} className="set-input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
            <input aria-label={`Demo set ${i + 1} reps`} className="set-input" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
            <button type="button" aria-pressed={d} aria-label={`Complete demo set ${i + 1}`} className="set-check" onClick={() => setDone((v) => v.map((x, j) => (j === i ? !x : x)))} data-testid="demo-check"><Check size={20} strokeWidth={3} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-sm"><span className="num">{(Number(kg) || 0) * (Number(reps) || 0) * count} vol.</span><span className="num text-ember" data-testid="demo-xp">+{xp} XP</span></div>
    </Backing>
  );
}

function ArmorLine() {
  const [i, setI] = useState(3);
  const a = ARMORS[i];
  return (
    <div>
      <div className="flex h-72 items-end justify-center">{<WarriorArt tier={a.tier} accent="#ff6b2c" className="h-full" title={a.name} />}</div>
      <div className="mt-3 grid grid-cols-6 gap-1" role="group" aria-label="Armor stages">
        {ARMORS.map((x, j) => <button key={x.id} type="button" aria-pressed={i === j} aria-label={`${x.name}, level ${x.level}`} onClick={() => setI(j)} className={cx('h-11 border font-mono text-xs', i === j ? 'border-ember bg-ember text-black' : 'border-line bg-black/50 text-silver')} data-testid="armor-stage">{x.level}</button>)}
      </div>
      <p className="display mt-3 text-2xl">{a.name}</p>
      <p className="text-sm">{a.blurb} <span className="text-muted">Level {a.level}.</span></p>
    </div>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const scroll = useRef(0);
  const [mode, setMode] = useState<'pending' | '3d' | 'fallback'>(() => (!reduced && canRunWebGL() ? 'pending' : 'fallback'));
  const [leaving, setLeaving] = useState(false);
  const workouts = useStore((s) => s.workouts.length);
  const active = useStore((s) => s.active);
  const name = useStore((s) => s.profile.name);
  const progress = useProgress();
  const marquee = useRef<HTMLDivElement>(null);
  const names = useMemo(() => EXERCISES.map((e) => e.name), []);
  const returning = workouts > 0 || !!active;

  useEffect(() => { document.documentElement.style.setProperty('--accent', '#ff6b2c'); }, []);

  // Lazy-load 3D only after the page has painted, and give up gracefully on any failure.
  useEffect(() => {
    if (mode !== 'pending') return;
    let cancelled = false;
    const start = () => import('@/three/stage').then(({ Stage }) => {
      if (cancelled || !canvas.current) return;
      stage.current = new Stage(canvas.current, { mode: 'landing', small: isSmallScreen(), tier: 3, accent: '#ff6b2c', relic: 'hammer', onSlow: () => setMode('fallback') });
      setMode('3d');
    }).catch((e) => { console.warn('3D unavailable, using drawn scene', e); if (!cancelled) setMode('fallback'); });
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o: object) => number }).requestIdleCallback;
    if (idle) idle(() => void start(), { timeout: 700 }); else setTimeout(() => void start(), 200);
    return () => { cancelled = true; };
  }, [mode]);
  useEffect(() => { if (mode === 'fallback' && stage.current) { stage.current.dispose(); stage.current = null; } }, [mode]);
  useEffect(() => () => { stage.current?.dispose(); stage.current = null; }, []);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      scroll.current = max > 0 ? scrollY / max : 0;
      stage.current?.setScroll(scroll.current);
      if (marquee.current && !reduced) marquee.current.style.transform = `translate3d(${-scroll.current * 2600}px,0,0)`;
    };
    const onMove = (e: PointerEvent) => stage.current?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    const onResize = () => { stage.current?.resize(); onScroll(); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('resize', onResize);
    onScroll();
    return () => { removeEventListener('scroll', onScroll); removeEventListener('pointermove', onMove); removeEventListener('resize', onResize); };
  }, [reduced, mode]);

  const enter = () => {
    if (reduced) { nav(active ? '/app/workout' : '/app'); return; }
    setLeaving(true);
    setTimeout(() => nav(active ? '/app/workout' : '/app'), 620);
  };
  const cta = active ? `Resume ${active.name}` : returning ? 'Continue your quest' : 'Begin your quest';

  return (
    <div className="relative bg-void text-silver">
      {/* World: one fixed layer behind every chapter, so the story is a single continuous shot. */}
      <div className="fixed inset-0 z-0">
        {mode !== '3d' && <FallbackWorld scrollRef={scroll} reduced={reduced} />}
        {mode !== 'fallback' && <canvas ref={canvas} className={cx('absolute inset-0 h-full w-full transition-opacity duration-1000', mode === '3d' ? 'opacity-100' : 'opacity-0')} aria-hidden data-testid="hero-canvas" />}
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,7,.55)_0%,transparent_22%,transparent_45%,rgba(5,6,7,.82)_100%)]" />
      </div>

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-2.5 pt-[calc(var(--safe-t)+.625rem)] backdrop-blur-sm md:px-6">
        <Link to="/" aria-label="Iron Quest"><Logo /></Link>
        <nav aria-label="Chapters" className="hidden gap-5 lg:flex">
          {CHAPTERS.slice(0, 5).map((c, i) => <a key={c} href={`#ch${i + 1}`} onClick={(e) => { e.preventDefault(); document.getElementById(`ch${i + 1}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); }} className="hud transition-colors hover:text-bone">{c.replace('The ', '')}</a>)}
        </nav>
        <button type="button" onClick={enter} className="btn btn-ghost btn-sm !font-mono !text-bone" data-testid="nav-enter">[ {returning ? 'Enter' : 'Launch app'} ]</button>
      </header>

      <main className="relative z-10">
        <section className="relative flex min-h-[100dvh] flex-col justify-end px-4 pb-8 pt-20 md:px-10" aria-labelledby="hero-title">
          <motion.div initial={reduced ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }} className="max-w-4xl">
            <p className="hud mb-3 !text-bone [text-shadow:0_1px_8px_#000]">A fitness RPG · Free for everyone</p>
            <h1 id="hero-title" className="display text-[clamp(4rem,11.5vw,10rem)] [text-shadow:0_6px_60px_rgba(0,0,0,.85)]">Forge your<br /><span className="text-ember">strength.</span></h1>
            <p className="mt-4 max-w-xl text-lg text-bone [text-shadow:0_1px_12px_#000]">Every rep writes your story. Track your training. Build your strength. Become legendary.</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button type="button" onClick={enter} className="btn btn-primary !min-h-14 !px-7 !text-sm" data-testid="begin">{cta}</button>
              {returning && <span className="hud !text-bone">{name || 'Warrior'} · Level {progress.level.level}</span>}
            </div>
          </motion.div>
          <div className="mt-8 flex items-center justify-between border-t border-white/15 pt-2.5">
            <span className="hud hidden sm:block">No account needed. Works offline.</span>
            <button type="button" className="hud ml-auto flex min-h-11 items-center gap-2 hover:text-bone" onClick={() => document.getElementById('ch1')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}><ArrowDown size={14} aria-hidden /> Scroll to explore</button>
          </div>
        </section>

        <Chapter n={1} id="ch1" title="The Beginning">
          <Backing>
            <p className="text-lg text-bone">The world ended quietly, one skipped session at a time. What's left is a forge, a cold reactor, and you.</p>
            <p className="mt-3">Iron Quest is a real workout tracker with a story wrapped around it. Log your sets the way you always would. Your character grows only from the training you actually do.</p>
          </Backing>
        </Chapter>

        <Chapter n={2} id="ch2" title="The Warrior" align="right">
          <Backing>
            <p className="mb-4">Your character starts in salvaged plates. Train, and new armor is forged piece by piece, up to the crown of arcs. Choose a stage:</p>
            <ArmorLine />
          </Backing>
        </Chapter>

        <Chapter n={3} id="ch3" title="The Training System">
          <p className="mb-4 text-lg text-bone [text-shadow:0_1px_12px_#000]">Built for tired hands between sets. Previous numbers beside every row, one tap to complete, rest timers, supersets, RPE, live record alerts. Drafts survive a closed tab.</p>
          <DemoLogger />
        </Chapter>

        <Chapter n={4} id="ch4" title="The Progression" align="right">
          <Backing>
            <p>XP comes from verified training, not clicks. It can't be farmed by tapping through a hundred sets, and load earns nothing extra, so everyone levels at the same pace. Rest days never cost you anything.</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-3">
              <div><dt className="hud">Working set</dt><dd className="stat m-0 mt-1">{XP.SET}<span className="text-base text-muted"> XP</span></dd></div>
              <div><dt className="hud">Full session</dt><dd className="stat m-0 mt-1">{XP.COMPLETE}<span className="text-base text-muted"> XP</span></dd></div>
              <div><dt className="hud">Three a week</dt><dd className="stat m-0 mt-1">{XP.W_THREE}<span className="text-base text-muted"> XP</span></dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">{ACHIEVEMENTS.filter((_, i) => i % 3 === 0).slice(0, 8).map((a) => <span key={a.id} title={a.name}><Sigil glyph={a.glyph} tier={a.tier} size={46} /></span>)}</div>
            <p className="mt-3 text-sm text-muted">{ACHIEVEMENTS.length} achievements, daily and weekly quests, skill paths, titles and unlockable gear.</p>
          </Backing>
        </Chapter>

        <section id="ch5" className="relative flex min-h-[135vh] flex-col justify-center overflow-hidden py-24" aria-labelledby="ch5-t">
          <div className="px-4 md:px-10">
            <Reveal><p className="hud mb-3 text-ember">Chapter 05</p></Reveal>
            <Reveal delay={0.06}><h2 id="ch5-t" className="display text-[clamp(3.5rem,11vw,8.5rem)] [text-shadow:0_4px_40px_rgba(0,0,0,.8)]">The Arsenal</h2></Reveal>
          </div>
          <div aria-hidden className="my-6 overflow-hidden whitespace-nowrap border-y border-white/15 bg-black/40 py-3 backdrop-blur-sm">
            <div ref={marquee} className="display inline-block text-4xl text-bone/90 will-change-transform md:text-6xl">{names.slice(0, 60).map((n) => <span key={n} className="mr-8">{n} <span className="text-ember">/</span></span>)}</div>
          </div>
          <div className="px-4 md:px-10">
            <Backing className="max-w-xl">
              <p className="text-bone">{EXERCISES.length} curated exercises with instructions, form cues and muscle maps, plus unlimited custom ones. {PROGRAMS.length} program templates to start from, and unlimited routines and folders of your own.</p>
              <p className="mt-2 text-sm">Plate, warm-up and one-rep-max calculators. Progress analytics calculated from your log, with nothing invented. Export everything, any time.</p>
            </Backing>
          </div>
        </section>

        <section id="ch6" className="relative flex min-h-[110vh] flex-col items-center justify-center px-4 text-center" aria-labelledby="ch6-t">
          <Reveal><p className="hud mb-3 text-ember">Chapter 06</p></Reveal>
          <Reveal delay={0.06}><h2 id="ch6-t" className="display text-[clamp(4rem,15vw,13rem)] [text-shadow:0_6px_60px_rgba(0,0,0,.85)]">Enter<br />the quest</h2></Reveal>
          <Reveal delay={0.14} className="mt-6">
            <button type="button" onClick={enter} className="btn btn-primary !min-h-14 !px-8 !text-sm" data-testid="begin-bottom">{cta}</button>
            <p className="mt-3 text-sm text-bone">Free. No subscription, no limits, no sign-up.</p>
          </Reveal>
        </section>
        <footer className="relative border-t border-white/10 bg-black/60 px-4 py-5 text-center text-xs text-muted">Iron Quest is a training log, not medical advice. All art in this site is original and generated in your browser.</footer>
      </main>

      {leaving && <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.55, ease: 'easeIn' }} className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_50%_55%,#ff6b2c_0%,#3a1408_18%,#050607_55%)]" />}
    </div>
  );
}
