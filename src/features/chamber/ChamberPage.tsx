import { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock } from 'lucide-react';
import { useStore } from '@/state/store';
import { useProgress, useStreaks, useTotals } from '@/state/derived';
import { ACCENTS, ACHIEVEMENTS, ARMORS, RELICS, SKILLS, TITLES, type SkillNode } from '@/domain/progression';
import { fmtDate, fmtDuration, fmtVolume, toDisplay, fmt } from '@/domain/util';
import { Bar, Button, Field, Segmented, cx, useReducedMotion } from '@/ui/kit';
import { Sigil, WarriorArt } from '@/ui/art';
import { canRunWebGL } from '@/three/support';

const ChamberScene = lazy(() => import('@/three/ChamberScene'));

export default function ChamberPage() {
  const profile = useStore((s) => s.profile);
  const saveProfile = useStore((s) => s.saveProfile);
  const unit = useStore((s) => s.settings.unit);
  const p = useProgress();
  const t = useTotals();
  const st = useStreaks();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<'loadout' | 'skills' | 'timeline'>('loadout');
  // Armor defaults to the best you've earned; pick an earlier set if you prefer it.
  const armor = ARMORS.find((a) => a.id === profile.equipped.armor && p.unlockedArmors.has(a.id)) ?? ARMORS[p.armorTier];
  const accent = ACCENTS.find((a) => a.id === profile.equipped.accent && p.unlockedAccents.has(a.id))?.color ?? '#ff6b2c';
  const relic = p.unlockedRelics.has(profile.equipped.relic) ? profile.equipped.relic : 'none';
  const earned = ACHIEVEMENTS.filter((a) => p.achievements.has(a.id)).sort((a, b) => p.achievements.get(b.id)! - p.achievements.get(a.id)!);
  const [slow, setSlow] = useState(false);
  const webgl = !reduced && !slow && canRunWebGL();
  const plinth = [
    profile.skills.includes('iron-2') && p.records.bests.size ? { label: 'Heaviest lift', value: `${fmt(toDisplay(Math.max(...[...p.records.bests.values()].map((b) => b.weight)), unit), 1)} ${unit}` } : null,
    profile.skills.includes('wind-2') ? { label: 'Time in the forge', value: fmtDuration(t.seconds) } : null,
    profile.skills.includes('will-2') ? { label: 'Best streak', value: `${st.bestWeeks} weeks` } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  // The chamber itself evolves: more light and lit pylons with each armor tier.
  const lit = armor.tier;

  return (
    <div>
      <section className="relative min-h-[560px] overflow-hidden border-b border-line bg-void lg:min-h-[640px]">
        <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(50% 60% at 50% 72%, color-mix(in srgb, ${accent} ${14 + lit * 5}%, transparent), transparent 70%), linear-gradient(180deg,#07090b,#050607 60%,#0b0d10)` }} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(transparent,rgba(0,0,0,.7))]" />
        <div className="absolute inset-0 flex items-end justify-center">
          {webgl ? (
            <Suspense fallback={<WarriorArt tier={armor.tier} accent={accent} relic={relic} className="h-[88%]" />}><ChamberScene tier={armor.tier} accent={accent} relic={relic} onSlow={() => setSlow(true)} /></Suspense>
          ) : (
            <>
              {Array.from({ length: 6 }).map((_, i) => {
                const on = i < lit + 1; const left = i < 3;
                return <span key={i} aria-hidden className="absolute bottom-[8%] w-3" style={{ [left ? 'left' : 'right']: `${6 + (i % 3) * 11}%`, height: `${40 + (i % 3) * 14}%`, background: on ? `linear-gradient(180deg, ${accent}, transparent)` : '#14181c', opacity: on ? 0.55 : 0.8 }} />;
              })}
              <WarriorArt tier={armor.tier} accent={accent} relic={relic} className="relative h-[88%]" />
            </>
          )}
        </div>
        <div className="pointer-events-none relative mx-auto flex min-h-[560px] max-w-[1240px] flex-col justify-between p-4 lg:min-h-[640px] lg:p-10">
          <div>
            <p className="hud text-[var(--accent)]">Character Chamber</p>
            <h1 className="display mt-1 text-6xl md:text-8xl" data-testid="char-name">{profile.name || 'Unnamed'}</h1>
            <p className="display mt-1 text-2xl text-silver" data-testid="char-title">{p.title}</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="glass w-full max-w-xs border border-line/70 p-3">
              <div className="flex items-baseline gap-2"><span className="hud">Level</span><span className="stat !text-6xl" data-testid="char-level">{p.level.level}</span></div>
              <Bar pct={p.level.pct} className="xp-bar mt-1 h-2" label="XP to next level" />
              <div className="num mt-1 text-xs text-muted" data-testid="char-xp">{p.level.into} / {p.level.need} XP · {p.xp.toLocaleString()} total</div>
              <p className="hud mt-1">{armor.name}</p>
            </div>
            {!!plinth.length && <dl className="glass m-0 space-y-1 border border-line px-3 py-2 text-right">{plinth.map((x) => <div key={x.label}><dt className="hud">{x.label}</dt><dd className="num m-0 text-bone">{x.value}</dd></div>)}</dl>}
          </div>
        </div>
      </section>

      <div className="page">
        <section aria-label="Attributes" className="grid gap-x-8 gap-y-4 border-b border-line pb-6 sm:grid-cols-2 lg:grid-cols-5">
          {p.attributes.map((a) => (
            <div key={a.key} data-testid={`attr-${a.key}`}>
              <div className="flex items-baseline justify-between"><span className="display text-xl">{a.name}</span><span className="num text-bone">{a.value}</span></div>
              <Bar pct={a.value} className="mt-1" label={a.name} />
              <p className="mt-1 text-xs text-muted">{a.description}</p>
            </div>
          ))}
        </section>

        <div className="my-5"><Segmented label="Chamber section" value={tab} onChange={setTab} options={[{ value: 'loadout', label: 'Loadout' }, { value: 'skills', label: `Skills${p.skillPointsFree > 0 ? ` · ${p.skillPointsFree}` : ''}` }, { value: 'timeline', label: 'Timeline' }]} /></div>

        {tab === 'loadout' && (
          <div className="space-y-6">
            <section><h2 className="display mb-2 text-2xl">Armor</h2>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {ARMORS.map((a) => {
                  const open = p.unlockedArmors.has(a.id);
                  return (
                    <li key={a.id}><button type="button" disabled={!open} aria-pressed={armor.id === a.id} onClick={() => void saveProfile({ equipped: { ...profile.equipped, armor: a.id } })} className={cx('flex h-full w-full items-center gap-3 border p-2 text-left', armor.id === a.id ? 'border-[var(--accent)]' : 'border-line', !open && 'opacity-50')} data-testid="armor-option">
                      <WarriorArt tier={a.tier} accent={open ? accent : '#3a424b'} className="h-20 w-14 shrink-0" title={a.name} />
                      <span className="min-w-0"><span className="display block text-lg">{a.name}</span><span className="block text-xs text-muted">{open ? a.blurb : `Reach level ${a.level}`}</span></span>
                    </button></li>
                  );
                })}
              </ul>
            </section>
            <div className="grid gap-6 lg:grid-cols-3">
              <section><h2 className="display mb-2 text-2xl">Accent</h2>
                <ul className="m-0 list-none space-y-1 p-0">{ACCENTS.map((a) => { const open = p.unlockedAccents.has(a.id); return <li key={a.id}><button type="button" disabled={!open} aria-pressed={profile.equipped.accent === a.id} onClick={() => void saveProfile({ equipped: { ...profile.equipped, accent: a.id } })} className={cx('flex min-h-11 w-full items-center gap-2 border-b border-line/60 text-left text-sm', !open && 'opacity-50')}><i className="h-4 w-4" style={{ background: a.color }} /><span className="flex-1 text-bone">{a.name}</span>{open ? profile.equipped.accent === a.id && <Check size={15} className="text-[var(--accent)]" /> : <span className="flex items-center gap-1 text-xs text-muted"><Lock size={11} /> {a.need}</span>}</button></li>; })}</ul>
              </section>
              <section><h2 className="display mb-2 text-2xl">Relic</h2>
                <ul className="m-0 list-none space-y-1 p-0">{RELICS.map((r) => { const open = p.unlockedRelics.has(r.id); return <li key={r.id}><button type="button" disabled={!open} aria-pressed={relic === r.id} onClick={() => void saveProfile({ equipped: { ...profile.equipped, relic: r.id } })} className={cx('flex min-h-11 w-full items-center gap-2 border-b border-line/60 text-left text-sm', !open && 'opacity-50')}><span className="flex-1 text-bone">{r.name}</span>{open ? relic === r.id && <Check size={15} className="text-[var(--accent)]" /> : <span className="flex items-center gap-1 text-xs text-muted"><Lock size={11} /> {r.need}</span>}</button></li>; })}</ul>
              </section>
              <section><h2 className="display mb-2 text-2xl">Identity</h2>
                <div className="space-y-3">
                  <Field label="Name"><input className="input" maxLength={40} value={profile.name} onChange={(e) => void saveProfile({ name: e.target.value })} data-testid="char-name-input" /></Field>
                  <Field label="Title"><select className="input" value={p.title} onChange={(e) => void saveProfile({ title: e.target.value })}>{p.unlockedTitles.map((t2) => <option key={t2} value={t2}>{t2}</option>)}</select></Field>
                  <p className="text-xs text-muted">Next title: {TITLES.find((t2) => t2.level > p.level.level)?.name ?? 'None. You hold them all.'}{TITLES.find((t2) => t2.level > p.level.level) ? ` at level ${TITLES.find((t2) => t2.level > p.level.level)!.level}` : ''}</p>
                </div>
              </section>
            </div>
            {!!earned.length && <section><div className="mb-2 flex items-baseline justify-between"><h2 className="display text-2xl">Honors</h2><Link to="/app/achievements" className="hud hover:text-bone">All achievements</Link></div><div className="flex flex-wrap gap-2">{earned.slice(0, 12).map((a) => <span key={a.id} title={a.name}><Sigil glyph={a.glyph} tier={a.tier} size={48} /></span>)}</div></section>}
          </div>
        )}
        {tab === 'skills' && <Skills />}
        {tab === 'timeline' && (
          <ol className="m-0 max-w-2xl list-none border-l border-line p-0 pl-4" data-testid="timeline">
            {!p.timeline.length && <li className="text-sm text-muted">Your timeline starts with your first workout.</li>}
            {p.timeline.slice(0, 60).map((e, i) => (
              <li key={i} className="relative pb-4"><span aria-hidden className={cx('absolute -left-[21px] top-1.5 h-2.5 w-2.5 rotate-45', e.kind === 'level' ? 'bg-[var(--accent)]' : e.kind === 'achievement' ? 'bg-[#ffc24b]' : 'bg-line')} />
                <div className="hud">{fmtDate(e.at)}</div><div className="font-semibold text-bone">{e.title}</div>{e.detail && <div className="text-xs text-muted">{e.detail}</div>}</li>
            ))}
          </ol>
        )}
        <p className="mt-8 text-xs text-muted">{fmtVolume(t.volume, unit)} moved across {t.workouts} sessions. Every point above is calculated from your saved training log.</p>
      </div>
    </div>
  );
}

function Skills() {
  const profile = useStore((s) => s.profile);
  const save = useStore((s) => s.saveProfile);
  const p = useProgress();
  const buy = (n: SkillNode) => void save({ skills: [...profile.skills, n.id] });
  const refund = () => void save({ skills: [], title: undefined });
  const branch: Record<SkillNode['branch'], string> = { iron: 'Path of Iron', wind: 'Path of Wind', will: 'Path of Will' };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><p className="text-sm"><b className="text-bone" data-testid="skill-points">{p.skillPointsFree}</b> of {p.skillPoints} points free. You get one every 2 levels.</p>{!!profile.skills.length && <Button size="sm" variant="ghost" onClick={refund}>Refund all</Button>}</div>
      <p className="mb-4 text-xs text-muted">Skills are optional and cosmetic: they unlock titles, relics and Chamber displays, and never change XP.</p>
      <div className="grid gap-6 md:grid-cols-3">
        {(Object.keys(branch) as SkillNode['branch'][]).map((b) => (
          <section key={b}><h2 className="display mb-2 text-2xl">{branch[b]}</h2>
            <ol className="m-0 list-none space-y-2 p-0">{SKILLS.filter((s) => s.branch === b).map((s) => {
              const owned = profile.skills.includes(s.id);
              const ready = !s.requires || profile.skills.includes(s.requires);
              return (
                <li key={s.id} className={cx('border p-2.5', owned ? 'border-[var(--accent)]' : 'border-line', !ready && 'opacity-50')} data-testid="skill-node">
                  <div className="font-semibold text-bone">{s.name}</div><p className="mt-0.5 text-xs text-muted">{s.effect}</p>
                  {!owned && <Button size="sm" className="mt-2" disabled={!ready || p.skillPointsFree < 1} onClick={() => buy(s)}>Learn</Button>}
                </li>
              );
            })}</ol>
          </section>
        ))}
      </div>
    </div>
  );
}
