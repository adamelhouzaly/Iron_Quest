import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flag, Plus, Scroll, Trash2, Zap } from 'lucide-react';
import { useStore } from '@/state/store';
import { addExercises, blankWorkout, countDone, countPending, finalize, workoutFromRoutine } from '@/domain/workout-ops';
import { fmtClock, fmtVolume, weekday } from '@/domain/util';
import { Button, Dialog, Empty, Field, PageHead, Plate, confirmAction, useNow } from '@/ui/kit';
import { ExercisePicker } from './ExercisePicker';
import { WorkoutEditor } from './WorkoutEditor';
import type { ActiveWorkout } from '@/domain/types';
import { PROGRAMS, instantiateProgram } from '@/data/templates';

export default function WorkoutPage() {
  const active = useStore((s) => s.active);
  return active ? <Live active={active} /> : <StartScreen />;
}

function StartScreen() {
  const routines = useStore((s) => s.routines);
  const setActive = useStore((s) => s.setActive);
  const today = weekday(new Date());
  const scheduled = routines.filter((r) => r.days.includes(today));
  const rest = routines.filter((r) => !r.days.includes(today)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="page">
      <PageHead kicker="Train" title="Choose your fight" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Plate hot className="p-5">
            <p className="hud text-[var(--accent)]">Freestyle</p>
            <h2 className="display mt-1 text-3xl">Open session</h2>
            <p className="mt-1 text-sm">Start empty and add exercises as you go.</p>
            <Button variant="primary" className="mt-4 w-full" onClick={() => setActive(blankWorkout())} data-testid="start-blank"><Zap size={15} /> Start empty workout</Button>
          </Plate>
          <div className="mt-6">
            <h2 className="display mb-2 text-2xl">Quick templates</h2>
            <ul className="m-0 list-none space-y-px p-0">
              {PROGRAMS.slice(0, 3).flatMap((p) => instantiateProgram(p).routines.slice(0, p.key === 'fb' ? 1 : 3)).map((r) => (
                <li key={r.id}><button type="button" className="flex min-h-12 w-full items-center justify-between gap-2 border-b border-line px-1 py-2 text-left hover:text-bone" onClick={() => setActive({ ...workoutFromRoutine(r), routineId: undefined })}><span className="font-semibold text-silver">{r.name}</span><span className="hud">{r.exercises.length} exercises</span></button></li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between"><h2 className="display text-2xl">Your routines</h2><Link to="/app/routines" className="hud hover:text-bone">Manage</Link></div>
          {!routines.length && <Empty title="No routines yet" action={<Link to="/app/routines" className="btn">Build one</Link>} art={<Scroll size={28} />}>Save a plan once, then start it in one tap whenever you train.</Empty>}
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {[...scheduled, ...rest].map((r) => (
              <li key={r.id}>
                <button type="button" className="block h-full w-full border border-line p-3 text-left transition-colors hover:border-[var(--accent)]" onClick={() => setActive(workoutFromRoutine(r))} data-testid="start-routine">
                  {r.days.includes(today) && <span className="hud mb-1 block text-[var(--accent)]">Scheduled today</span>}
                  <span className="display block text-xl">{r.name}</span>
                  <span className="mt-1 block text-xs text-muted">{r.exercises.length} exercises · {r.exercises.reduce((n, e) => n + e.sets.length, 0)} sets</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Live({ active }: { active: ActiveWorkout }) {
  const setActive = useStore((s) => s.setActive);
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const unit = useStore((s) => s.settings.unit);
  const nav = useNavigate();
  const now = useNow();
  const [picker, setPicker] = useState(false);
  const [review, setReview] = useState(false);
  const volume = useMemo(() => active.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + (s.done ? (s.kg ?? 0) * (s.reps ?? 0) : 0), 0), 0), [active]);
  const done = countDone(active);

  const discard = async () => {
    if (done && !(await confirmAction({ title: 'Discard workout?', body: `${done} completed set${done === 1 ? '' : 's'} will be lost. This cannot be undone.`, confirm: 'Discard', danger: true }))) return;
    setActive(null);
  };

  return (
    <div className="pb-48 lg:pb-32">
      <div className="glass sticky top-[calc(var(--safe-t)+45px)] z-20 border-b border-line lg:top-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <input className="display w-full truncate bg-transparent text-2xl outline-none focus:text-[var(--accent)]" aria-label="Workout name" maxLength={120} value={active.name} onChange={(e) => setActive({ ...active, name: e.target.value })} />
            <div className="num flex gap-3 text-xs text-muted">
              <span data-testid="elapsed">{fmtClock((now - active.startedAt) / 1000)}</span>
              <span><b className="text-bone" data-testid="done-count">{done}</b> sets</span>
              <span className="truncate" data-testid="live-volume">{fmtVolume(volume, unit)}</span>
            </div>
          </div>
          <Button variant="primary" onClick={() => (done ? setReview(true) : toast({ kind: 'error', text: 'Complete at least one set first', detail: 'Tap the check on a set once it is done.' }))} data-testid="finish"><Flag size={15} /> Finish</Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-3 py-4">
        {!active.exercises.length && <Empty title="An empty arena" art={<Zap size={28} />} action={<Button variant="primary" onClick={() => setPicker(true)} data-testid="add-first"><Plus size={15} /> Add exercise</Button>}>Add your first exercise. The timer is already running, and this draft saves as you type.</Empty>}
        <WorkoutEditor value={active} onChange={setActive} live />
        {!!active.exercises.length && <Button className="mt-3 w-full" onClick={() => setPicker(true)} data-testid="add-exercise"><Plus size={15} /> Add exercise</Button>}
        <label className="mt-6 block"><span className="hud label">Workout notes</span>
          <textarea className="input min-h-20 text-sm" maxLength={8000} value={active.notes ?? ''} onChange={(e) => setActive({ ...active, notes: e.target.value || undefined })} placeholder="Sleep, energy, anything worth remembering" /></label>
        <Button variant="danger" className="mt-3 w-full" onClick={() => void discard()} data-testid="discard"><Trash2 size={14} /> Discard workout</Button>
      </div>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(list) => setActive(addExercises(active, list))} />
      {review && <ReviewDialog active={active} onClose={() => setReview(false)} onSave={async (name, notes, minutes) => {
        const completedAt = Date.now();
        const started = minutes !== null ? completedAt - minutes * 60000 : active.startedAt;
        const w = finalize({ ...active, startedAt: started }, completedAt, name, notes);
        try {
          await save('workouts', w);
          setActive(null); // Only clear the draft once the session is durably saved.
          nav(`/app/complete/${w.id}`, { replace: true });
        } catch { /* store already raised the error; the draft is still there */ }
      }} />}
    </div>
  );
}

function ReviewDialog({ active, onClose, onSave }: { active: ActiveWorkout; onClose: () => void; onSave: (name: string, notes: string | undefined, minutes: number | null) => Promise<void> }) {
  const [name, setName] = useState(active.name);
  const [notes, setNotes] = useState(active.notes ?? '');
  const elapsed = Math.max(1, Math.round((Date.now() - active.startedAt) / 60000));
  const [min, setMin] = useState(String(elapsed));
  const [saving, setSaving] = useState(false);
  const pending = countPending(active);
  const minutes = Number(min);
  const bad = !Number.isFinite(minutes) || minutes < 1 || minutes > 1440;
  return (
    <Dialog open onClose={onClose} title="Review session"
      footer={<><Button variant="ghost" onClick={onClose}>Keep training</Button><Button variant="primary" disabled={bad || saving} onClick={async () => { setSaving(true); await onSave(name, notes || undefined, minutes === elapsed ? null : minutes); setSaving(false); }} data-testid="save-workout">{saving ? 'Saving…' : 'Save session'}</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Duration (minutes)" error={bad ? 'Enter 1 to 1440 minutes.' : null} hint="Forgot to stop the timer? Fix it here."><input className="input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} data-testid="review-minutes" /></Field>
        <Field label="Notes"><textarea className="input min-h-20" maxLength={8000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-sm">{countDone(active)} completed set{countDone(active) === 1 ? '' : 's'} will be saved.</p>
        {pending > 0 && <p className="border-l-2 border-[#ffc24b] pl-2 text-sm text-[#ffc24b]">{pending} unchecked set{pending === 1 ? ' is' : 's are'} not counted and won't be saved.</p>}
      </div>
    </Dialog>
  );
}
