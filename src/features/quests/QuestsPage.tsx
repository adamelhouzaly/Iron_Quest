import { useState } from 'react';
import { Check, Plus, Target, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useAllExercises, useProgress } from '@/state/derived';
import { XP, overloadState, type QuestView } from '@/domain/progression';
import { inRange, totals, workoutVolume } from '@/domain/analytics';
import { e1rm } from '@/domain/records';
import type { Goal, GoalKind } from '@/domain/types';
import { fmt, monthKey, startOfWeek, toDisplay, toKg, uid } from '@/domain/util';
import { Bar, Button, Dialog, Empty, Field, PageHead, confirmAction, cx } from '@/ui/kit';

function Quest({ q }: { q: QuestView }) {
  return (
    <li className={cx('border p-3', q.done ? 'border-[var(--accent)]/60 bg-[#1a0f0a]' : 'border-line')} data-testid={`quest-${q.id}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="display min-w-0 text-xl">{q.title}</h3>
        <span className="num shrink-0 text-xs text-[var(--accent)]">{q.done ? <span className="inline-flex items-center gap-1"><Check size={13} /> Earned</span> : `+${q.xp} XP`}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{q.detail}</p>
      <Bar pct={(q.current / q.target) * 100} className="mt-2" label={q.title} />
      <div className="num mt-1 text-[11px] text-muted">{q.current} / {q.target}{q.unit ?? ''}</div>
    </li>
  );
}

export default function QuestsPage() {
  const p = useProgress();
  const goals = useStore((s) => s.goals);
  const [dlg, setDlg] = useState(false);
  const col = (scope: QuestView['scope']) => p.quests.filter((q) => q.scope === scope);
  return (
    <div className="page">
      <PageHead kicker="Quest board" title="Quests"><Button variant="primary" onClick={() => setDlg(true)} data-testid="new-goal"><Plus size={15} /> New goal</Button></PageHead>
      <p className="mb-5 max-w-2xl border-l-2 border-[var(--accent)] pl-3 text-sm">Quests pay out on their own when your log meets them. Nothing expires against you: a rest day costs nothing, and a missed week just means the next one starts fresh.</p>
      <div className="grid gap-6 lg:grid-cols-3">
        {(['daily', 'weekly', 'long'] as const).map((s) => (
          <section key={s}>
            <h2 className="display mb-2 text-3xl">{s === 'long' ? 'Long road' : s === 'daily' ? 'Today' : 'This week'}</h2>
            <ul className="m-0 list-none space-y-2 p-0">{col(s).map((q) => <Quest key={q.id} q={q} />)}</ul>
            {s === 'daily' && <p className="mt-2 text-xs text-muted">A different quest each day, only if you train. Resting is part of the plan.</p>}
          </section>
        ))}
      </div>
      <section className="mt-10">
        <h2 className="display mb-2 text-3xl">Your goals</h2>
        {!goals.length ? <Empty title="No goals set" art={<Target size={28} />} action={<Button onClick={() => setDlg(true)}>Set a goal</Button>}>Choose a lift to raise, a weekly rhythm, a body-weight target or a monthly volume. Progress is measured from your log.</Empty>
          : <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">{goals.map((g) => <GoalRow key={g.id} g={g} />)}</ul>}
      </section>
      <details className="mt-10 border-t border-line pt-3 text-sm">
        <summary className="hud cursor-pointer py-2">How XP works</summary>
        <ul className="mt-2 max-w-2xl list-disc space-y-1 pl-5 text-silver">
          <li>Working sets earn {XP.SET} XP each (sets past {XP.SET_FULL_LIMIT} earn {XP.SET_LATE}). Warm-ups earn {XP.WARMUP}, for the first {XP.WARMUP_CAP}.</li>
          <li>Finishing a session with {XP.COMPLETE_MIN_SETS}+ sets and {XP.COMPLETE_MIN_MINUTES}+ minutes earns {XP.COMPLETE} XP.</li>
          <li>Each personal record earns {XP.PR} XP, on up to {XP.PR_CAP} exercises a session. Jumps over 30% still count as records but earn no XP, since they're usually typos.</li>
          <li>To reward real sessions over rapid tapping: sets are credited at up to {XP.SETS_PER_MIN} per minute of session time and {XP.SET_CAP} per session. A second session in a day earns half; later ones earn 10%.</li>
          <li>Load doesn't change XP, so lifters of every size level at the same pace.</li>
          <li>Editing or deleting a session recalculates everything, so your character always matches your log.</li>
        </ul>
      </details>
      {dlg && <GoalDialog onClose={() => setDlg(false)} />}
    </div>
  );
}

function GoalRow({ g }: { g: Goal }) {
  const workouts = useStore((s) => s.workouts);
  const body = useStore((s) => s.body);
  const remove = useStore((s) => s.remove);
  const unit = useStore((s) => s.settings.unit);
  const exercises = useAllExercises();
  const now = Date.now();
  let pct = 0, status = '';
  if (g.kind === 'workouts-week') { const n = totals(inRange(workouts, startOfWeek(now).getTime())).workouts; pct = (n / (g.target ?? 1)) * 100; status = `${n} / ${g.target} this week`; }
  if (g.kind === 'volume-month') { const v = workouts.filter((w) => monthKey(w.completedAt) === monthKey(now)).reduce((n, w) => n + workoutVolume(w), 0); pct = (v / (g.target ?? 1)) * 100; status = `${fmt(toDisplay(v, unit))} / ${fmt(toDisplay(g.target ?? 0, unit))} ${unit} this month`; }
  if (g.kind === 'e1rm') { const best = Math.max(0, ...workouts.flatMap((w) => w.exercises.filter((e) => e.exerciseId === g.exerciseId).flatMap((e) => e.sets.filter((s) => s.done && s.type !== 'warmup').map((s) => e1rm(s.kg ?? 0, s.reps ?? 0))))); pct = (best / (g.target ?? 1)) * 100; status = `${fmt(toDisplay(best, unit), 1)} / ${fmt(toDisplay(g.target ?? 0, unit), 1)} ${unit} est. 1RM`; }
  if (g.kind === 'overload') { const s = overloadState(workouts, g); pct = s.pct; status = s.done ? 'Complete' : `${s.sessions} sessions, ${Math.round(s.pct)}%`; }
  if (g.kind === 'bodyweight') {
    const list = body.filter((b) => b.weightKg).sort((a, b) => a.date.localeCompare(b.date));
    const first = list[0]?.weightKg, last = list[list.length - 1]?.weightKg, t = g.target ?? 0;
    pct = first !== undefined && last !== undefined && first !== t ? ((first - last) / (first - t)) * 100 : 0;
    status = last ? `${fmt(toDisplay(last, unit), 1)} → ${fmt(toDisplay(t, unit), 1)} ${unit}` : 'Log your body weight to track this';
  }
  return (
    <li className="border border-line p-3" data-testid="goal">
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="display truncate text-xl">{g.title}</h3><p className="text-xs text-muted">{status}{g.exerciseId ? ` · ${exercises.find((e) => e.id === g.exerciseId)?.name ?? ''}` : ''}</p></div>
        <Button icon size="sm" variant="ghost" aria-label={`Delete goal ${g.title}`} onClick={async () => { if (await confirmAction({ title: 'Delete this goal?', confirm: 'Delete', danger: true })) await remove('goals', g.id); }}><Trash2 size={14} /></Button></div>
      <Bar pct={pct} className="mt-2" label={g.title} />
    </li>
  );
}

function GoalDialog({ onClose }: { onClose: () => void }) {
  const save = useStore((s) => s.save);
  const unit = useStore((s) => s.settings.unit);
  const exercises = useAllExercises();
  const [kind, setKind] = useState<GoalKind>('overload');
  const [exerciseId, setExerciseId] = useState(exercises.find((e) => e.id === 'barbell-squat')?.id ?? exercises[0].id);
  const [target, setTarget] = useState('');
  const needsEx = kind === 'e1rm' || kind === 'overload';
  const needsTarget = kind !== 'overload';
  const n = Number(target);
  const bad = needsTarget && (!Number.isFinite(n) || n <= 0 || n > 1_000_000);
  const ex = exercises.find((e) => e.id === exerciseId);
  const label = { 'workouts-week': 'Workouts per week', e1rm: `Target est. 1RM (${unit})`, bodyweight: `Target body weight (${unit})`, 'volume-month': `Volume per month (${unit})`, overload: '' }[kind];
  const submit = async () => {
    const now = Date.now();
    const value = kind === 'workouts-week' ? n : toKg(n, unit);
    const title = kind === 'overload' ? `Raise ${ex?.name} by 5%` : kind === 'e1rm' ? `${ex?.name}: ${n} ${unit}` : kind === 'bodyweight' ? `Reach ${n} ${unit}` : kind === 'volume-month' ? `${fmt(n)} ${unit} a month` : `${n} workouts a week`;
    await save('goals', { id: uid(), kind, title, exerciseId: needsEx ? exerciseId : undefined, target: needsTarget ? value : undefined, startedAt: now, updatedAt: now });
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="New goal" footer={<Button variant="primary" disabled={bad || (needsTarget && !target)} onClick={() => void submit()} data-testid="save-goal">Set goal</Button>}>
      <div className="space-y-3">
        <Field label="Type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} data-testid="goal-kind"><option value="overload">Chosen-lift quest: raise a lift by 5% (+{XP.OVERLOAD} XP)</option><option value="e1rm">Estimated 1RM target</option><option value="workouts-week">Workouts per week</option><option value="volume-month">Monthly volume</option><option value="bodyweight">Body weight target</option></select></Field>
        {needsEx && <Field label="Exercise"><select className="input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>{exercises.filter((e) => e.mode === 'strength' || e.mode === 'bodyweight').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>}
        {needsTarget && <Field label={label} error={target && bad ? 'Enter a positive number.' : null}><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} data-testid="goal-target" /></Field>}
        {kind === 'overload' && <p className="text-xs text-muted">Your first session after today sets the baseline. Finish when your estimated 1RM is 5% higher and you've logged it across at least 4 sessions.</p>}
        {kind !== 'overload' && <p className="text-xs text-muted">Personal goals track progress but don't award XP, so setting easy goals can't inflate your character.</p>}
      </div>
    </Dialog>
  );
}
