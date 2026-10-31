import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { CATEGORY_LABEL, EQUIPMENT_LABEL } from '@/data/exercises';
import { MUSCLES, MUSCLE_LABEL } from '@/domain/analytics';
import { toDisplay, fmt, slug, uid } from '@/domain/util';
import type { Category, Equipment, Exercise, Muscle, TrackingMode } from '@/domain/types';
import { useStore } from '@/state/store';
import { useAllExercises, useProgress } from '@/state/derived';
import { Button, Dialog, Empty, Field, PageHead } from '@/ui/kit';
import { matches } from '../workout/ExercisePicker';

export default function ExercisesPage() {
  const all = useAllExercises();
  const unit = useStore((s) => s.settings.unit);
  const { records } = useProgress();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  const [cat, setCat] = useState('');
  const [scope, setScope] = useState<'all' | 'custom' | 'logged'>('all');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (params.get('new')) { setCreating(true); setParams({}, { replace: true }); } }, [params, setParams]);
  const list = useMemo(() => all.filter((e) =>
    (!q || matches(e, q)) && (!muscle || e.primary.includes(muscle as Muscle) || e.secondary.includes(muscle as Muscle)) && (!equip || e.equipment === equip) && (!cat || e.category === cat)
    && (scope === 'all' || (scope === 'custom' ? e.custom : records.seen.has(e.id)))), [all, q, muscle, equip, cat, scope, records]);
  return (
    <div className="page">
      <PageHead kicker="The Arsenal" title="Exercises"><Button variant="primary" onClick={() => setCreating(true)} data-testid="new-exercise"><Plus size={15} /> Custom exercise</Button></PageHead>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="relative"><Search size={15} aria-hidden className="absolute left-3 top-3.5 text-muted" /><input type="search" className="input pl-9" placeholder="Search" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ex-search" /></div>
        <select className="input" aria-label="Muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)}><option value="">All muscles</option>{MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}</select>
        <select className="input" aria-label="Equipment" value={equip} onChange={(e) => setEquip(e.target.value)}><option value="">All equipment</option>{Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input" aria-label="Movement" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All movements</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="mb-4 flex items-center gap-1">
        {(['all', 'logged', 'custom'] as const).map((s) => <button key={s} type="button" className="chip" aria-pressed={scope === s} onClick={() => setScope(s)}>{s}</button>)}
        <span className="hud ml-auto" data-testid="ex-count">{list.length} shown</span>
      </div>
      {!list.length && <Empty title="Nothing in the rack" action={<Button onClick={() => setCreating(true)}>Create it</Button>}>{scope === 'custom' ? 'You have no custom exercises yet.' : scope === 'logged' ? 'Log a workout and your exercises gather here.' : 'No exercise fits those filters.'}</Empty>}
      <ul className="m-0 grid list-none gap-x-6 p-0 md:grid-cols-2">
        {list.map((e) => {
          const best = records.bests.get(e.id);
          return (
            <li key={e.id} className="lazy-row border-b border-line">
              <Link to={`/app/exercises/${e.id}`} className="group flex min-h-16 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-bone group-hover:text-[var(--accent)]">{e.name}{e.custom && <span className="tag ml-2 align-middle">Custom</span>}</div>
                  <div className="truncate text-xs text-muted">{e.primary.map((m) => MUSCLE_LABEL[m] ?? m).join(', ') || 'Unassigned'} · {EQUIPMENT_LABEL[e.equipment]} · {CATEGORY_LABEL[e.category]}</div>
                </div>
                {!!best?.e1rm && <div className="text-right"><div className="num text-sm text-bone">{fmt(toDisplay(best.e1rm, unit))} {unit}</div><div className="hud text-[9px]">Est. 1RM</div></div>}
              </Link>
            </li>
          );
        })}
      </ul>
      {creating && <ExerciseForm onClose={() => setCreating(false)} />}
    </div>
  );
}

export function ExerciseForm({ onClose, existing }: { onClose: () => void; existing?: Exercise }) {
  const save = useStore((s) => s.save);
  const all = useAllExercises();
  const nav = useNavigate();
  const [name, setName] = useState(existing?.name ?? '');
  const [primary, setPrimary] = useState<Muscle>((existing?.primary[0] as Muscle) ?? 'chest');
  const [secondary, setSecondary] = useState<Muscle[]>(existing?.secondary ?? []);
  const [equipment, setEquipment] = useState<Equipment>(existing?.equipment ?? 'barbell');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'isolation');
  const [mode, setMode] = useState<TrackingMode>(existing?.mode ?? 'strength');
  const [steps, setSteps] = useState(existing?.steps.join('\n') ?? '');
  const [form, setForm] = useState(existing?.form.join('\n') ?? '');
  const clean = name.trim();
  const dup = !!clean && all.some((e) => e.id !== existing?.id && e.name.toLowerCase() === clean.toLowerCase());
  const err = dup ? 'An exercise with this name already exists.' : null;
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const submit = async () => {
    const id = existing?.id ?? `custom-${slug(clean) || 'exercise'}-${uid().slice(0, 6)}`;
    await save('exercises', { id, name: clean, primary: [primary], secondary: secondary.filter((m) => m !== primary), equipment, category, mode, steps: lines(steps), form: lines(form), custom: true, updatedAt: Date.now() });
    onClose();
    if (!existing) nav(`/app/exercises/${id}`);
  };
  return (
    <Dialog open onClose={onClose} title={existing ? 'Edit exercise' : 'Custom exercise'} wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!clean || dup} onClick={() => void submit()} data-testid="save-exercise">Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Name" error={err}><input className="input" autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-testid="exercise-name" aria-invalid={!!err} /></Field></div>
        <Field label="Primary muscle"><select className="input" value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)}>{MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}</select></Field>
        <Field label="Tracks"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as TrackingMode)}><option value="strength">Weight & reps</option><option value="bodyweight">Bodyweight reps (+ optional load)</option><option value="timed">Time</option><option value="cardio">Distance & time</option></select></Field>
        <Field label="Equipment"><select className="input" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>{Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Movement"><select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="sm:col-span-2">
          <span className="hud label">Secondary muscles</span>
          <div className="flex flex-wrap gap-1">{MUSCLES.filter((m) => m !== primary).map((m) => <button key={m} type="button" className="chip" aria-pressed={secondary.includes(m)} onClick={() => setSecondary((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}>{MUSCLE_LABEL[m]}</button>)}</div>
        </div>
        <Field label="Instructions (one step per line)"><textarea className="input min-h-24 text-sm" maxLength={4000} value={steps} onChange={(e) => setSteps(e.target.value)} /></Field>
        <Field label="Form notes (one per line)"><textarea className="input min-h-24 text-sm" maxLength={4000} value={form} onChange={(e) => setForm(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
