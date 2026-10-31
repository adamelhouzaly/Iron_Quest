import { useState } from 'react';
import { Timer } from 'lucide-react';
import { useStore } from '@/state/store';
import { useAllExercises, useLastPerformances, useLookup, useProgress } from '@/state/derived';
import { ORM_FORMULAS, plateBreakdown, warmupSets } from '@/domain/tools';
import { e1rm } from '@/domain/records';
import { recommend } from '@/domain/overload';
import { LB_PER_KG, fmt, fmtClock, fmtDate, round, toDisplay } from '@/domain/util';
import { Button, Field, PageHead } from '@/ui/kit';
import { startRest } from '../workout/RestTimer';
import { Link } from 'react-router-dom';

const n = (s: string) => { const v = Number(s.replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : 0; };
const Tool = ({ title, children, id }: { title: string; children: React.ReactNode; id: string }) => <section id={id} className="plate p-4" data-testid={`tool-${id}`}><h2 className="display mb-3 text-2xl">{title}</h2>{children}</section>;

const STD_LB = [45, 35, 25, 10, 5, 2.5];

function Plates() {
  const settings = useStore((s) => s.settings);
  const unit = settings.unit;
  const [target, setTarget] = useState('');
  const bar = round(toDisplay(settings.barKg, unit), 1);
  const barDisplay = unit === 'lb' && settings.barKg === 20 ? 45 : bar;
  const plates = unit === 'lb' ? STD_LB : settings.plates;
  const r = plateBreakdown(n(target), barDisplay, plates);
  return (
    <Tool title="Plate calculator" id="plates">
      <Field label={`Target weight (${unit})`}><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} data-testid="plate-target" /></Field>
      {n(target) > 0 && (r.belowBar ? <p className="mt-2 text-sm text-[#ffc24b]">That's less than the {barDisplay} {unit} bar.</p> : (
        <div className="mt-3">
          <p className="hud mb-1">Each side (bar {barDisplay} {unit})</p>
          {!r.plates.length && <p className="text-sm">Just the bar.</p>}
          <div className="flex flex-wrap items-center gap-1" data-testid="plate-result">
            {r.plates.map((p) => Array.from({ length: p.count }, (_, i) => <span key={`${p.plate}-${i}`} className="grid place-items-center bg-steel px-1.5 font-mono text-xs font-bold text-bone" style={{ height: `${Math.max(26, 26 + (p.plate / plates[0]) * 42)}px`, minWidth: 34 }}>{p.plate}</span>))}
          </div>
          {r.remainder !== 0 && <p className="mt-2 text-xs text-[#ffc24b]">Closest you can load is {r.loaded} {unit} ({fmt(Math.abs(r.remainder), 2)} {unit} {r.remainder > 0 ? 'short' : 'over'}).</p>}
        </div>
      ))}
      <p className="mt-2 text-xs text-muted">Bar and plate sizes come from <Link to="/app/profile" className="underline">Settings</Link>.</p>
    </Tool>
  );
}
function Warmups() {
  const settings = useStore((s) => s.settings);
  const unit = settings.unit;
  const [work, setWork] = useState('');
  const bar = unit === 'lb' && settings.barKg === 20 ? 45 : round(toDisplay(settings.barKg, unit), 1);
  const list = n(work) ? warmupSets(n(work), bar, unit === 'lb' ? 5 : 2.5) : [];
  return (
    <Tool title="Warm-up sets" id="warmup">
      <Field label={`Working weight (${unit})`}><input className="input" inputMode="decimal" value={work} onChange={(e) => setWork(e.target.value)} data-testid="warmup-work" /></Field>
      {!!list.length && <table className="mt-3 w-full text-sm" data-testid="warmup-result"><tbody>{list.map((s) => <tr key={s.kg} className="border-b border-line/50"><td className="py-1 text-muted">{s.label}</td><td className="num py-1 text-right text-bone">{s.kg} {unit}</td><td className="num py-1 text-right">× {s.reps}</td></tr>)}</tbody></table>}
      <p className="mt-2 text-xs text-muted">A common ramp. Adjust to how you feel.</p>
    </Tool>
  );
}
function OneRM() {
  const unit = useStore((s) => s.settings.unit);
  const [w, setW] = useState(''); const [r, setR] = useState('');
  const weight = n(w), reps = Math.floor(n(r));
  const valid = weight > 0 && reps > 0 && reps <= 30;
  const est = valid ? e1rm(weight, reps) : 0;
  return (
    <Tool title="One-rep max" id="orm">
      <div className="grid grid-cols-2 gap-2"><Field label={`Weight (${unit})`}><input className="input" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} data-testid="orm-weight" /></Field><Field label="Reps" error={reps > 30 ? 'Estimates fall apart past 30.' : null}><input className="input" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} data-testid="orm-reps" /></Field></div>
      {valid && (
        <>
          <div className="mt-3 stat" data-testid="orm-result">{fmt(est, 1)} {unit}</div>
          <p className="text-xs text-muted">{Object.entries(ORM_FORMULAS).map(([k, f]) => `${k} ${fmt(f(weight, reps), 1)}`).join(' · ')}. Estimates are least accurate at high reps.</p>
          <table className="mt-2 w-full text-sm"><tbody>{[1, 3, 5, 8, 10, 12].map((x) => <tr key={x} className="border-b border-line/50"><td className="py-0.5 text-muted">{x} rep{x > 1 ? 's' : ''}</td><td className="num py-0.5 text-right text-bone">{fmt(est / (1 + (x === 1 ? 0 : x) / 30), 1)} {unit}</td></tr>)}</tbody></table>
        </>
      )}
    </Tool>
  );
}
function Convert() {
  const [kg, setKg] = useState(''); const [lb, setLb] = useState('');
  return (
    <Tool title="kg / lb" id="convert">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Kilograms"><input className="input" inputMode="decimal" value={kg} data-testid="conv-kg" onChange={(e) => { setKg(e.target.value); setLb(e.target.value && n(e.target.value) ? String(round(n(e.target.value) * LB_PER_KG, 2)) : ''); }} /></Field>
        <Field label="Pounds"><input className="input" inputMode="decimal" value={lb} data-testid="conv-lb" onChange={(e) => { setLb(e.target.value); setKg(e.target.value && n(e.target.value) ? String(round(n(e.target.value) / LB_PER_KG, 2)) : ''); }} /></Field>
      </div>
    </Tool>
  );
}
function Volume() {
  const unit = useStore((s) => s.settings.unit);
  const [sets, setSets] = useState('3'); const [reps, setReps] = useState('10'); const [w, setW] = useState('');
  return (
    <Tool title="Volume calculator" id="volume">
      <div className="grid grid-cols-3 gap-2"><Field label="Sets"><input className="input" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} /></Field><Field label="Reps"><input className="input" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></Field><Field label={unit}><input className="input" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} data-testid="vol-weight" /></Field></div>
      <div className="stat mt-3" data-testid="vol-result">{fmt(n(sets) * n(reps) * n(w))} {unit}</div>
    </Tool>
  );
}
function Rest() {
  const active = useStore((s) => s.active);
  const def = useStore((s) => s.settings.defaultRestSec);
  return (
    <Tool title="Rest timer" id="rest">
      {!active ? <p className="text-sm text-muted">The timer runs with an active workout, so it can't fall out of step with your session. <Link to="/app/workout" className="underline">Start one</Link> to use it.</p> : (
        <div className="flex flex-wrap gap-1">{[def, 60, 90, 120, 180, 300].filter((v, i, a) => a.indexOf(v) === i).map((s) => <Button key={s} onClick={() => startRest(s, active.name)}><Timer size={13} /> {fmtClock(s)}</Button>)}</div>
      )}
    </Tool>
  );
}
function Compare() {
  const workouts = useStore((s) => s.workouts);
  const unit = useStore((s) => s.settings.unit);
  const exercises = useAllExercises();
  const lookup = useLookup();
  const last = useLastPerformances();
  const { records } = useProgress();
  const logged = exercises.filter((e) => last.has(e.id));
  const [id, setId] = useState('');
  const pick = id || logged[0]?.id;
  const ex = pick ? lookup(pick) : undefined;
  const perf = pick ? last.get(pick) : undefined;
  const rec = ex && pick ? recommend(ex, workouts.slice().sort((a, b) => a.completedAt - b.completedAt).flatMap((w) => w.exercises.filter((e) => e.exerciseId === pick)).slice(-2)) : null;
  return (
    <Tool title="Last time, next time" id="compare">
      {!logged.length ? <p className="text-sm text-muted">Log an exercise to see your last performance and a suggested next step.</p> : (
        <>
          <Field label="Exercise"><select className="input" value={pick} onChange={(e) => setId(e.target.value)}>{logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          {perf && <p className="mt-2 text-sm"><span className="hud block">{fmtDate(perf.at)}</span><span className="num text-bone">{perf.sets.map((s) => (s.kg ? `${toDisplay(s.kg, unit)}×${s.reps}` : s.reps ? `${s.reps}` : s.seconds ? fmtClock(s.seconds) : '')).join(', ')}</span></p>}
          {pick && !!records.bests.get(pick)?.e1rm && <p className="mt-1 text-xs text-muted">Best est. 1RM {fmt(toDisplay(records.bests.get(pick)!.e1rm, unit), 1)} {unit}</p>}
          {rec && <div className="mt-2 border-l-2 border-[var(--accent)] pl-2"><p className="text-sm font-semibold text-bone">Optional: {rec.headline}{rec.kg !== undefined ? ` · ${round(toDisplay(rec.kg, unit), 1)} ${unit}` : ''}{rec.reps !== undefined ? ` × ${rec.reps}` : ''}</p><ul className="m-0 list-disc pl-4 text-xs text-muted">{rec.reasons.map((r) => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-xs text-muted">A rule-of-thumb from your own log, not a prescription.</p></div>}
        </>
      )}
    </Tool>
  );
}

export default function ToolsPage() {
  return (
    <div className="page">
      <PageHead kicker="The workshop" title="Tools" />
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Plates /><Warmups /><OneRM /><Compare /><Rest /><Convert /><Volume />
      </div>
    </div>
  );
}
