import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, Pencil, Plus, RotateCcw, Save, Scroll, Share2, Trash2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup, useProgress } from '@/state/derived';
import { workoutDuration, workoutSets, workoutVolume } from '@/domain/analytics';
import { PR_LABEL, e1rm } from '@/domain/records';
import { addExercises, routineFromWorkout } from '@/domain/workout-ops';
import type { ActiveWorkout, Workout } from '@/domain/types';
import { fmt, fmtClock, fmtDate, fmtDuration, fmtVolume, metersToDisplay, toDisplay, uid } from '@/domain/util';
import { Button, Dialog, Empty, Field, Multiline, PageHead, Stat, confirmAction } from '@/ui/kit';
import { WorkoutEditor } from '../workout/WorkoutEditor';
import { ExercisePicker } from '../workout/ExercisePicker';
import { cloudConfigured, useCloud } from '@/services/cloud';
import { useUnsavedGuard } from '@/ui/useUnsavedGuard';

const toLocalInput = (t: number) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function HistoryDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const stored = useStore((s) => s.workouts.find((x) => x.id === id));
  // A back-logged session exists only as a draft until it has real sets, so backing out leaves nothing behind.
  const isNew = id === 'new';
  const blank = useMemo<Workout>(() => { const now = Date.now(); return { id: uid(), name: 'Logged session', startedAt: now - 3600000, completedAt: now, exercises: [], updatedAt: now }; }, []);
  const w = isNew ? blank : stored;
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);
  const settings = useStore((s) => s.settings);
  const lookup = useLookup();
  const p = useProgress();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Workout | null>(null);
  const [picker, setPicker] = useState(false);
  const [sharing, setSharing] = useState(false);
  const unit = settings.unit;
  useUnsavedGuard(editing && !!draft && JSON.stringify(draft) !== JSON.stringify(w), 'Your edits to this session have not been saved.');

  const startEdit = () => { if (w) { setDraft(structuredClone(w)); setEditing(true); } };
  useEffect(() => { if (isNew) startEdit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isNew]);
  useEffect(() => {
    if (params.get('share') && w) { setSharing(true); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, w]);

  const prs = useMemo(() => (w ? p.records.byWorkout.get(w.id) ?? [] : []), [w, p]);
  const xp = w ? p.ledger.find((l) => l.workoutId === w.id) : undefined;
  if (!w) return <div className="page"><Empty title="Session not found" action={<Link to="/app/history" className="btn">Back to history</Link>}>It may have been deleted.</Empty></div>;

  const del = async () => {
    if (!(await confirmAction({ title: 'Delete this session?', body: 'Records, XP, quests and analytics will recalculate without it.', confirm: 'Delete', danger: true }))) return;
    const copy = w;
    await remove('workouts', w.id);
    toast({ kind: 'info', text: 'Session deleted', action: { label: 'Undo', run: () => void save('workouts', copy) } });
    nav('/app/history', { replace: true });
  };
  const repeat = async () => {
    if (active && !(await confirmAction({ title: 'A workout is in progress', body: `This replaces "${active.name}" and discards its logged sets.`, confirm: 'Replace it', danger: true }))) return;
    const now = Date.now();
    const a: ActiveWorkout = { id: uid(), name: w.name, startedAt: now, rest: null, updatedAt: now, routineId: w.routineId, exercises: w.exercises.map((e) => ({ ...e, id: uid(), sets: e.sets.map((s) => ({ id: uid(), type: s.type, done: false })) })) };
    setActive(a); nav('/app/workout');
  };
  const asRoutine = async () => { const r = routineFromWorkout(w, w.name); await save('routines', r); toast({ kind: 'success', text: 'Saved as a routine' }); nav(`/app/routines/${r.id}`); };

  if (editing && draft) {
    const duration = Math.round((draft.completedAt - draft.startedAt) / 60000);
    const bad = !draft.name.trim() || !Number.isFinite(draft.completedAt) || draft.completedAt > Date.now() + 60000 || duration < 0;
    const commit = async () => {
      // Sets that were unchecked while editing are removed, same as a live session.
      const clean: Workout = { ...draft, name: draft.name.trim(), exercises: draft.legacy ? [] : draft.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length) };
      if (!clean.exercises.length && !clean.legacy) { toast({ kind: 'error', text: 'Nothing to save', detail: 'Complete at least one set, or delete this session instead.' }); return; }
      await save('workouts', clean);
      flushSync(() => { setEditing(false); setDraft(null); }); // Clears the unsaved-changes guard before navigating.
      toast({ kind: 'success', text: isNew ? 'Session logged' : 'Session updated', detail: 'Records, XP and analytics have recalculated.' });
      if (isNew) nav(`/app/history/${clean.id}`, { replace: true });
    };
    return (
      <div className="page max-w-3xl">
        <PageHead kicker={isNew ? 'Logging a past session' : 'Editing session'} title={draft.name || 'Untitled'}>
          <Button variant="ghost" onClick={() => { if (isNew) nav('/app/history'); else setEditing(false); }}><X size={14} /> Cancel</Button>
          <Button variant="primary" disabled={bad} onClick={() => void commit()} data-testid="save-edit"><Save size={14} /> Save</Button>
        </PageHead>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><input className="input" maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="edit-name" /></Field>
          <Field label="Finished at" error={draft.completedAt > Date.now() + 60000 ? 'Cannot be in the future.' : null}><input type="datetime-local" className="input" value={toLocalInput(draft.completedAt)} max={toLocalInput(Date.now())} onChange={(e) => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) setDraft({ ...draft, completedAt: t, startedAt: t - duration * 60000 }); }} /></Field>
          {!draft.legacy && <Field label="Duration (minutes)"><input className="input" inputMode="numeric" value={duration} onChange={(e) => { const m = Math.max(0, Math.min(1440, Number(e.target.value) || 0)); setDraft({ ...draft, startedAt: draft.completedAt - m * 60000 }); }} data-testid="edit-minutes" /></Field>}
        </div>
        <div className="mt-3"><Field label="Notes"><textarea className="input min-h-16 text-sm" maxLength={8000} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value || undefined })} /></Field></div>
        {draft.legacy ? <p className="mt-4 border-l-2 border-line pl-3 text-sm text-muted">This session came from the original Iron Quest, which only kept totals, so there are no individual sets to edit.</p> : (
          <div className="mt-5"><p className="mb-3 text-xs text-muted">Unchecked sets are removed when you save.</p>
            <WorkoutEditor value={draft} onChange={setDraft} live={false} excludeId={draft.id} />
            <Button className="mt-3 w-full" onClick={() => setPicker(true)} data-testid="edit-add-exercise"><Plus size={15} /> Add exercise</Button>
            <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(list) => setDraft(addExercises(draft, list))} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page max-w-4xl">
      <PageHead kicker={fmtDate(w.completedAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} title={w.name}>
        <Button onClick={startEdit} data-testid="edit-workout"><Pencil size={14} /> Edit</Button>
        <Button variant="danger" onClick={() => void del()} data-testid="delete-workout"><Trash2 size={14} /> Delete</Button>
      </PageHead>
      <div className="grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-4">
        <Stat label="Volume" value={fmtVolume(workoutVolume(w), unit)} />
        <Stat label="Sets" value={workoutSets(w)} />
        <Stat label="Duration" value={workoutDuration(w) ? fmtDuration(workoutDuration(w)) : '—'} />
        <Stat label="XP" value={`+${xp?.total ?? 0}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!w.legacy && <><Button size="sm" onClick={() => void repeat()} data-testid="repeat"><RotateCcw size={13} /> Repeat</Button><Button size="sm" onClick={() => void asRoutine()}><Scroll size={13} /> Save as routine</Button></>}
        <Button size="sm" onClick={() => setSharing(true)} data-testid="share-workout"><Share2 size={13} /> Share</Button>
      </div>
      {w.notes && <div className="mt-4 border-l-2 border-line pl-3"><Multiline text={w.notes} /></div>}
      {w.legacy && (
        <div className="mt-6 border border-line p-4 text-sm">
          <p className="hud mb-1">Imported from Iron Quest v1</p>
          <p>The original app kept totals only, so this session has no per-set record. Its volume, sets and XP all still count.</p>
          {!!w.legacy.newPRs.length && <ul className="mt-2 list-disc pl-4">{w.legacy.newPRs.map((r) => <li key={r.name + r.e1rmKg}>{r.name}: {toDisplay(r.kg, unit)} {unit} × {r.reps}</li>)}</ul>}
        </div>
      )}
      <div className="mt-6 space-y-5">
        {w.exercises.map((e) => {
          const x = lookup(e.exerciseId);
          const exPrs = prs.filter((r) => r.exerciseId === e.exerciseId);
          return (
            <section key={e.id} data-testid="detail-exercise">
              <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1">
                <Link to={`/app/exercises/${e.exerciseId}`} className="display truncate text-2xl hover:text-[var(--accent)]">{x?.name ?? 'Deleted exercise'}</Link>
                {e.groupId && <span className="tag text-arc">{e.groupType}</span>}
              </div>
              {e.notes && <div className="mt-1 text-xs text-muted"><Multiline text={e.notes} /></div>}
              <table className="mt-1 w-full text-sm"><tbody>
                {e.sets.map((s, i) => {
                  const hit = exPrs.filter((r) => r.setId === s.id);
                  return (
                    <tr key={s.id} className="border-b border-line/40">
                      <td className="w-10 py-1.5 font-mono text-xs text-muted">{s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : i + 1}</td>
                      <td className="num py-1.5 text-bone">{s.seconds && !s.reps && !s.meters ? fmtClock(s.seconds) : s.meters || (x?.mode === 'cardio') ? `${metersToDisplay(s.meters ?? 0, settings.distance)} ${settings.distance}${s.seconds ? ` · ${fmtClock(s.seconds)}` : ''}` : s.kg ? `${toDisplay(s.kg, unit)} ${unit} × ${s.reps}` : `${s.reps} reps`}{s.rpe ? <span className="text-muted"> @{s.rpe}</span> : null}</td>
                      <td className="py-1.5 text-right text-xs">{hit.length ? <span className="text-[var(--accent)]">{hit.map((h) => PR_LABEL[h.kind]).join(' · ')}</span> : s.kg && s.reps && s.type !== 'warmup' ? <span className="num text-muted">{fmt(toDisplay(e1rm(s.kg, s.reps), unit))}</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody></table>
            </section>
          );
        })}
      </div>
      {xp && (xp.items.length > 0 || xp.notes.length > 0) && (
        <section className="mt-8">
          <h2 className="display mb-1 text-2xl">XP breakdown</h2>
          <ul className="m-0 list-none p-0 text-sm">{xp.items.map((i) => <li key={i.label} className="flex justify-between border-b border-line/50 py-1"><span>{i.label}</span><span className="num text-bone">+{i.xp}</span></li>)}</ul>
          {xp.notes.map((n) => <p key={n} className="mt-1 text-xs text-muted">{n}</p>)}
        </section>
      )}
      {sharing && <ShareWorkout w={w} prs={prs.filter((r) => r.kind === 'e1rm').length} onClose={() => setSharing(false)} />}
    </div>
  );
}

function ShareWorkout({ w, prs, onClose }: { w: Workout; prs: number; onClose: () => void }) {
  const unit = useStore((s) => s.settings.unit);
  const toast = useStore((s) => s.toast);
  const lookup = useLookup();
  const user = useCloud((s) => s.user);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'followers' | 'public'>('followers');
  const [busy, setBusy] = useState(false);
  const text = [`IRON QUEST: ${w.name}`, `${workoutSets(w)} sets · ${fmtVolume(workoutVolume(w), unit)}${workoutDuration(w) ? ` · ${fmtDuration(workoutDuration(w))}` : ''}${prs ? ` · ${prs} PR${prs === 1 ? '' : 's'}` : ''}`, ...w.exercises.map((e) => `${lookup(e.exerciseId)?.name}: ${e.sets.filter((s) => s.done).map((s) => (s.kg ? `${toDisplay(s.kg, unit)}×${s.reps}` : s.reps ? `${s.reps}` : s.seconds ? fmtClock(s.seconds) : '')).join(', ')}`)].join('\n');
  const copy = async () => {
    try {
      const canShare = 'share' in navigator;
      if (canShare) await navigator.share({ title: w.name, text }); else await navigator.clipboard.writeText(text);
      toast({ kind: 'success', text: canShare ? 'Shared' : 'Summary copied' });
    } catch (e) { if ((e as Error).name !== 'AbortError') toast({ kind: 'error', text: 'Could not share', detail: 'Select the text and copy it.' }); }
  };
  const publish = async () => {
    setBusy(true);
    try {
      const { publishWorkout } = await import('@/services/social');
      await publishWorkout(w, prs, lookup, caption.trim(), visibility);
      toast({ kind: 'success', text: 'Published to your feed' }); onClose();
    } catch (e) { toast({ kind: 'error', text: 'Could not publish', detail: e instanceof Error ? e.message : undefined }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Share this session" footer={<Button onClick={() => void copy()} data-testid="copy-summary"><Copy size={14} /> Copy summary</Button>}>
      <textarea className="input num min-h-32 text-xs" readOnly value={text} aria-label="Workout summary" data-testid="share-text" />
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="hud mb-2">Publish to the community</h3>
        {!cloudConfigured ? <p className="text-sm text-muted">Publishing needs the optional cloud backend, which isn't connected on this site. Copying the summary always works.</p>
          : !user ? <p className="text-sm text-muted"><Link to="/app/profile" className="underline">Sign in</Link> to publish. Nothing is shared unless you choose to.</p>
          : <div className="space-y-2">
            <Field label="Caption (optional)"><input className="input" maxLength={1000} value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
            <div className="flex gap-1">{(['followers', 'public'] as const).map((v) => <button key={v} type="button" className="chip" aria-pressed={visibility === v} onClick={() => setVisibility(v)}>{v}</button>)}</div>
            <Button variant="primary" disabled={busy} onClick={() => void publish()}>Publish</Button>
          </div>}
      </div>
    </Dialog>
  );
}
