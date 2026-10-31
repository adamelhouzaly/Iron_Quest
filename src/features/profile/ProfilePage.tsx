import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Cloud, CloudOff, Download, Plus, Trash2, Upload, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup, useProgress } from '@/state/derived';
import { fmtDate, toDisplay } from '@/domain/util';
import { Button, Dialog, Field, PageHead, confirmAction, cx } from '@/ui/kit';
import { commitImport, download, makeBackup, previewBackup, type ImportPreview } from '@/services/transfer';
import { csvToWorkouts, workoutsToCsv } from '@/domain/csv';
import { notifyPermission, notifySupported, requestNotify } from '@/services/notify';
import { cloudConfigured, confirmDeviceMerge, resetPassword, signIn, signOut, signUp, syncNow, useCloud } from '@/services/cloud';
import * as db from '@/services/db';
import { EXERCISE_BY_ID } from '@/data/exercises';
import { V1_KEY } from '@/domain/migration';

const Sec = ({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) => <section id={id} className="scroll-mt-20 border-t border-line py-5"><h2 className="display mb-3 text-3xl">{title}</h2>{children}</section>;

export default function ProfilePage() {
  const loc = useLocation();
  useEffect(() => { if (loc.hash) document.querySelector(loc.hash)?.scrollIntoView(); }, [loc.hash]);
  return (
    <div className="page max-w-3xl">
      <PageHead kicker="Settings" title="Profile" />
      <Identity />
      <Training />
      <Reminders />
      <Account />
      <DataSection />
      <About />
    </div>
  );
}

function Identity() {
  const profile = useStore((s) => s.profile);
  const save = useStore((s) => s.saveProfile);
  const p = useProgress();
  return (
    <Sec title="Character">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="input" maxLength={40} value={profile.name} onChange={(e) => void save({ name: e.target.value, onboarded: true })} data-testid="profile-name" /></Field>
        <Field label="Motto"><input className="input" maxLength={140} value={profile.motto ?? ''} onChange={(e) => void save({ motto: e.target.value || undefined })} /></Field>
      </div>
      <p className="mt-2 text-sm">Level {p.level.level} {p.title}. <Link to="/app/chamber" className="underline">Open the Chamber</Link></p>
    </Sec>
  );
}

function Training() {
  const settings = useStore((s) => s.settings);
  const save = useStore((s) => s.saveSettings);
  const [plates, setPlates] = useState(settings.plates.join(', '));
  return (
    <Sec title="Training">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><span className="hud label">Weight unit</span><div className="flex gap-1">{(['kg', 'lb'] as const).map((u) => <button key={u} type="button" className="chip" aria-pressed={settings.unit === u} onClick={() => void save({ unit: u })} data-testid={`unit-${u}`}>{u}</button>)}</div><p className="mt-1 text-xs text-muted">Switching only changes the display. Your data isn't altered.</p></div>
        <div><span className="hud label">Distance unit</span><div className="flex gap-1">{(['km', 'mi'] as const).map((u) => <button key={u} type="button" className="chip" aria-pressed={settings.distance === u} onClick={() => void save({ distance: u })}>{u}</button>)}</div></div>
        <Field label="Default rest (seconds)"><input className="input" inputMode="numeric" value={settings.defaultRestSec} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 3600) void save({ defaultRestSec: v }); }} data-testid="default-rest" /></Field>
        <Field label="Bar weight (kg)"><input className="input" inputMode="decimal" value={settings.barKg} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 60) void save({ barKg: v }); }} /></Field>
        <Field label="Plates available (kg)" hint="Comma separated. In lb mode, standard plates are used."><input className="input" value={plates} onChange={(e) => { setPlates(e.target.value); const list = e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => x > 0 && x <= 100); if (list.length) void save({ plates: list }); }} /></Field>
      </div>
      <div className="mt-4 space-y-1">
        {([['autoRest', 'Start rest timer when a set is completed'], ['restSound', 'Sound when rest ends'], ['restVibrate', 'Vibrate when rest ends (where supported)'], ['reducedEffects', 'Reduce visual effects (also follows your system setting)']] as const).map(([k, l]) => (
          <label key={k} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" style={{ accentColor: 'var(--accent)' }} checked={settings[k]} onChange={(e) => void save({ [k]: e.target.checked })} /> {l}</label>
        ))}
      </div>
    </Sec>
  );
}

function Reminders() {
  const settings = useStore((s) => s.settings);
  const save = useStore((s) => s.saveSettings);
  const toast = useStore((s) => s.toast);
  const [perm, setPerm] = useState(notifyPermission());
  const enable = async () => {
    const r = await requestNotify(); setPerm(r);
    if (r === 'granted') { void save({ remindersOn: true }); toast({ kind: 'success', text: 'Notifications on' }); }
    else toast({ kind: 'error', text: 'Notifications blocked', detail: 'Allow them in your browser\'s site settings to use reminders.' });
  };
  return (
    <Sec title="Reminders" id="reminders">
      <p className="mb-3 text-sm">Get a nudge on days a routine is scheduled, if you haven't trained yet. <span className="text-muted">Without a server, browsers can only show these while Iron Quest is open or running as an installed app. Rest-timer alerts work the same way.</span></p>
      {!notifySupported() ? <p className="text-sm text-muted">This browser doesn't support notifications.</p> : (
        <div className="flex flex-wrap items-end gap-3">
          {settings.remindersOn && perm === 'granted'
            ? <Button onClick={() => void save({ remindersOn: false })}><Bell size={14} /> Turn off</Button>
            : <Button variant="primary" onClick={() => void enable()} data-testid="enable-reminders"><Bell size={14} /> Enable</Button>}
          <Field label="Remind after"><select className="input" value={settings.reminderHour} onChange={(e) => void save({ reminderHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
        </div>
      )}
    </Sec>
  );
}

function Account() {
  const { user, status, lastSync, error } = useCloud();
  const toast = useStore((s) => s.toast);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!cloudConfigured) return (
    <Sec title="Account & sync">
      <div className="flex items-start gap-3"><CloudOff size={20} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-sm">You're in <b className="text-bone">local mode</b>: everything works, and everything stays on this device. Accounts and sync need the free Supabase backend to be connected to this site (see the README). Until then, use a backup file below to move data between devices.</p>
      </div>
    </Sec>
  );
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === 'up') { const r = await signUp(email.trim(), password); toast(r.needsConfirm ? { kind: 'info', text: 'Check your email', detail: 'Confirm your address, then sign in.' } : { kind: 'success', text: 'Account created' }); }
      else await signIn(email.trim(), password);
      setPassword('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setBusy(false); }
  };
  return (
    <Sec title="Account & sync">
      {user ? (
        <div>
          <div className="flex items-start gap-3"><Cloud size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" /><div className="min-w-0 text-sm"><p className="truncate text-bone">{user.email}</p><p className="text-muted" data-testid="sync-status">{status === 'syncing' ? 'Syncing…' : status === 'offline' ? 'Offline. Changes sync when you reconnect.' : status === 'error' ? `Sync problem: ${error}. Your data is safe here; it will retry.` : lastSync ? `Synced ${new Date(lastSync).toLocaleTimeString()}` : 'Ready'}</p></div></div>
          {status === 'needs-owner-confirm' && (
            <div className="mt-3 border border-[#ffc24b] p-3 text-sm"><p>This device holds data from a different account. Merge it into <b>{user.email}</b>? If this isn't your data, export it and clear this device first.</p><Button className="mt-2" onClick={() => void confirmDeviceMerge()}>Merge into this account</Button></div>
          )}
          <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void syncNow()} disabled={status === 'syncing' || status === 'needs-owner-confirm'}>Sync now</Button><Button variant="ghost" onClick={() => void signOut().catch((e) => toast({ kind: 'error', text: 'Sign out failed', detail: e.message }))}>Sign out</Button></div>
          <p className="mt-2 text-xs text-muted">Signing out keeps your data on this device. Progress photos never leave the device.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="max-w-sm space-y-3">
          <p className="text-sm">Optional. An account syncs your training between devices. Anything already on this device comes with you, and it's private unless you publish it.</p>
          <div className="flex gap-1"><button type="button" className="chip" aria-pressed={mode === 'in'} onClick={() => setMode('in')}>Sign in</button><button type="button" className="chip" aria-pressed={mode === 'up'} onClick={() => setMode('up')}>Create account</button></div>
          <Field label="Email"><input type="email" required className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}><input type="password" required minLength={mode === 'up' ? 8 : 1} className="input" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {err && <p role="alert" className="text-sm text-crimson">{err}</p>}
          <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}</Button>
            {mode === 'in' && <Button variant="ghost" disabled={!email} onClick={() => void resetPassword(email.trim()).then(() => toast({ kind: 'info', text: 'Reset email sent' })).catch((e) => setErr(e.message))}>Forgot password</Button>}</div>
        </form>
      )}
    </Sec>
  );
}

function DataSection() {
  const workouts = useStore((s) => s.workouts);
  const custom = useStore((s) => s.customExercises);
  const reload = useStore((s) => s.reload);
  const toast = useStore((s) => s.toast);
  const lookup = useLookup();
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<(ImportPreview & { fileName: string }) | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  const exportJson = async () => { download(`iron-quest-backup-${stamp}.json`, JSON.stringify(await makeBackup()), 'application/json'); toast({ kind: 'success', text: 'Backup downloaded' }); };
  const exportCsv = () => { download(`iron-quest-workouts-${stamp}.csv`, workoutsToCsv(workouts, (id) => lookup(id)?.name ?? id), 'text/csv'); toast({ kind: 'success', text: 'CSV downloaded' }); };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) { toast({ kind: 'error', text: 'That file is too large.' }); return; }
    const text = await f.text();
    try {
      if (f.name.toLowerCase().endsWith('.csv')) {
        const known = (id: string) => EXERCISE_BY_ID.has(id) || custom.some((c) => c.id === id);
        const r = csvToWorkouts(text, known);
        if (!r.workouts.length) throw new Error(r.errors[0] ?? 'No workouts found in that file.');
        setPreview({ fileName: f.name, photos: [], rejected: r.errors, counts: { workouts: r.workouts.length, exercises: r.customExercises.length },
          rows: [...r.workouts.map((w) => ({ collection: 'workouts' as const, id: w.id, updatedAt: w.updatedAt, data: w })), ...r.customExercises.map((e) => ({ collection: 'exercises' as const, id: e.id, updatedAt: e.updatedAt ?? 0, data: e }))] });
      } else setPreview({ ...(await previewBackup(text)), fileName: f.name });
    } catch (e) { toast({ kind: 'error', text: 'Import failed', detail: e instanceof Error ? e.message : undefined }); }
  };
  const commit = async () => {
    if (!preview) return;
    try { const n = await commitImport(preview); await reload(); toast({ kind: 'success', text: 'Import complete', detail: `${n} record${n === 1 ? '' : 's'} added or updated.` }); }
    catch { toast({ kind: 'error', text: 'Import failed', detail: 'Nothing was lost. The device may be out of storage.' }); }
    setPreview(null);
  };
  const reset = async () => {
    if (!(await confirmAction({ title: 'Erase everything on this device?', danger: true, confirm: 'Erase all data', body: <>Workouts, routines, body data, photos and your character will be erased from this browser. <b>This cannot be undone.</b> Download a backup first if you might want it.</> }))) return;
    await db.wipeAll();
    try { localStorage.removeItem(V1_KEY); localStorage.removeItem('ironQuest.draft.v2'); } catch { /* ignore */ }
    location.hash = '#/';
    location.reload();
  };
  return (
    <Sec title="Your data" id="data">
      <p className="mb-3 text-sm">It's yours. {workouts.length} workout{workouts.length === 1 ? '' : 's'} on this device. Everything's stored locally first and keeps working offline.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void exportJson()} data-testid="export-json"><Download size={14} /> Backup (JSON)</Button>
        <Button onClick={exportCsv} disabled={!workouts.length} data-testid="export-csv"><Download size={14} /> Workouts (CSV)</Button>
        <Button onClick={() => file.current?.click()} data-testid="import-open"><Upload size={14} /> Import</Button>
        <input ref={file} type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" aria-label="Import a backup or CSV file" data-testid="import-file" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <p className="mt-2 text-xs text-muted">Imports merge: for any record in both places, the most recently edited version wins, so an old backup can't overwrite newer work.</p>
      <div className="mt-5 border-t border-line/60 pt-4"><Button variant="danger" onClick={() => void reset()} data-testid="reset-data"><Trash2 size={14} /> Erase all data on this device</Button></div>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title="Review import" footer={<><Button variant="ghost" onClick={() => setPreview(null)}><X size={14} /> Cancel</Button><Button variant="primary" onClick={() => void commit()} data-testid="import-commit"><Plus size={14} /> Import</Button></>}>
        {preview && <div className="text-sm"><p className="mb-2 truncate text-muted">{preview.fileName}</p>
          <ul className="m-0 list-none p-0">{Object.entries(preview.counts).map(([k, v]) => <li key={k} className="flex justify-between border-b border-line/50 py-1 capitalize"><span>{k}</span><span className="num text-bone">{v}</span></li>)}{!!preview.photos.length && <li className="flex justify-between border-b border-line/50 py-1"><span>Photo files</span><span className="num text-bone">{preview.photos.length}</span></li>}</ul>
          {!!preview.rejected.length && <div className={cx('mt-3 border-l-2 border-[#ffc24b] pl-2 text-[#ffc24b]')}><p>{preview.rejected.length} item{preview.rejected.length === 1 ? ' was' : 's were'} invalid and will be skipped.</p><ul className="m-0 mt-1 max-h-24 list-none overflow-auto p-0 text-xs">{preview.rejected.slice(0, 20).map((r) => <li key={r}>{r}</li>)}</ul></div>}
        </div>}
      </Dialog>
    </Sec>
  );
}

function About() {
  const unit = useStore((s) => s.settings.unit);
  const legacy = useStore((s) => s.legacy);
  return (
    <Sec title="About">
      <p className="text-sm">Iron Quest is free, with no subscriptions or limits. It isn't medical advice: train with appropriate form and recovery, and get professional guidance when you need it.</p>
      {legacy && <p className="mt-2 text-xs text-muted">Earlier data imported {fmtDate(legacy.importedAt)} ({legacy.prs.length} records{legacy.prs[0] ? `, e.g. ${toDisplay(legacy.prs[0].kg, unit)} ${unit}` : ''}).</p>}
      <p className="mt-3 text-xs text-muted"><Link to="/" className="underline">View the opening sequence</Link></p>
    </Sec>
  );
}
