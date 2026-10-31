import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Download, FolderPlus, MoreHorizontal, Pencil, Play, Plus, Scroll, Share2, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLookup } from '@/state/derived';
import { PROGRAMS, instantiateProgram } from '@/data/templates';
import { WEEKDAYS, uid } from '@/domain/util';
import { workoutFromRoutine } from '@/domain/workout-ops';
import type { Folder, Routine } from '@/domain/types';
import { Button, Dialog, Empty, Field, PageHead, confirmAction } from '@/ui/kit';
import { decodeShare, encodeShare } from '@/services/transfer';

export default function RoutinesPage() {
  const routines = useStore((s) => s.routines);
  const folders = useStore((s) => s.folders);
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const nav = useNavigate();
  const [templates, setTemplates] = useState(false);
  const [folderDlg, setFolderDlg] = useState<Folder | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const newRoutine = async (folderId?: string) => {
    const r: Routine = { id: uid(), name: 'New routine', days: [], exercises: [], folderId, updatedAt: Date.now() };
    await save('routines', r);
    nav(`/app/routines/${r.id}`);
  };
  const install = async (key: string) => {
    const p = PROGRAMS.find((x) => x.key === key)!;
    const { folder, routines: list } = instantiateProgram(p);
    await save('folders', folder);
    for (const r of list) await save('routines', r);
    setTemplates(false);
    toast({ kind: 'success', text: `${p.name} added`, detail: `${list.length} routines, scheduled on suggested days. Change anything.` });
  };
  const loose = routines.filter((r) => !r.folderId || !folders.some((f) => f.id === r.folderId));
  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="page">
      <PageHead kicker="Battle plans" title="Routines">
        <Button onClick={() => setImporting(true)}><Download size={14} /> Import</Button>
        <Button onClick={() => setFolderDlg('new')} data-testid="new-folder"><FolderPlus size={14} /> Folder</Button>
        <Button onClick={() => setTemplates(true)} data-testid="open-templates"><Scroll size={14} /> Templates</Button>
        <Button variant="primary" onClick={() => void newRoutine()} data-testid="new-routine"><Plus size={15} /> New routine</Button>
      </PageHead>
      {!routines.length && !folders.length && <Empty title="No plans drawn" art={<Scroll size={28} />} action={<><Button variant="primary" onClick={() => setTemplates(true)}>Browse templates</Button><Button onClick={() => void newRoutine()}>Start from scratch</Button></>}>Install a proven split or build your own. There's no limit on routines or folders.</Empty>}
      {sortedFolders.map((f) => {
        const list = routines.filter((r) => r.folderId === f.id);
        return (
          <section key={f.id} className="mb-8" data-testid="folder">
            <div className="mb-2 flex items-center gap-2 border-b border-line pb-1">
              <div className="min-w-0 flex-1"><h2 className="display truncate text-3xl">{f.name}</h2>{f.description && <p className="truncate text-xs text-muted">{f.description}</p>}</div>
              <Button size="sm" onClick={() => void newRoutine(f.id)}><Plus size={13} /> Add</Button>
              <Button size="sm" icon variant="ghost" aria-label={`Edit folder ${f.name}`} onClick={() => setFolderDlg(f)}><Pencil size={14} /></Button>
            </div>
            {!list.length && <p className="py-3 text-sm text-muted">Empty folder.</p>}
            <RoutineGrid list={list} />
          </section>
        );
      })}
      {!!loose.length && <section className="mb-8">{!!folders.length && <h2 className="display mb-2 border-b border-line pb-1 text-3xl">Unfiled</h2>}<RoutineGrid list={loose} /></section>}

      <Dialog open={templates} onClose={() => setTemplates(false)} title="Program templates" wide>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {PROGRAMS.map((p) => (
            <li key={p.key} className="flex flex-col border border-line p-3">
              <h3 className="display text-2xl">{p.name}</h3>
              <p className="hud mt-0.5">{p.perWeek} · {p.level}</p>
              <p className="mt-2 flex-1 text-sm">{p.description}</p>
              <p className="mt-2 text-xs text-muted">{p.routines.map((r) => r.name).join(' · ')}</p>
              <Button className="mt-3" onClick={() => void install(p.key)} data-testid={`install-${p.key}`}>Add to my routines</Button>
            </li>
          ))}
        </ul>
      </Dialog>
      {folderDlg && <FolderDialog folder={folderDlg === 'new' ? null : folderDlg} onClose={() => setFolderDlg(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function RoutineGrid({ list }: { list: Routine[] }) {
  return <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">{[...list].sort((a, b) => a.name.localeCompare(b.name)).map((r) => <RoutineCard key={r.id} r={r} />)}</ul>;
}

function RoutineCard({ r }: { r: Routine }) {
  const lookup = useLookup();
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const start = async () => {
    if (active && !(await confirmAction({ title: 'A workout is in progress', body: `Starting ${r.name} replaces "${active.name}" and discards its logged sets. Resume instead if you want to keep it.`, confirm: 'Replace it', danger: true }))) return;
    setActive(workoutFromRoutine(r)); nav('/app/workout');
  };
  const dup = async () => { await save('routines', { ...r, id: uid(), name: `${r.name} copy`, days: [] }); setMenu(false); toast({ kind: 'success', text: 'Routine duplicated' }); };
  const del = async () => {
    setMenu(false);
    if (!(await confirmAction({ title: `Delete ${r.name}?`, body: 'Past workouts from this routine stay in your history.', confirm: 'Delete', danger: true }))) return;
    await remove('routines', r.id);
    toast({ kind: 'info', text: 'Routine deleted', action: { label: 'Undo', run: () => void save('routines', r) } });
  };
  return (
    <li className="flex flex-col border border-line p-3 transition-colors hover:border-[#48525d]" data-testid="routine-card">
      <div className="flex items-start gap-1">
        <Link to={`/app/routines/${r.id}`} className="min-w-0 flex-1"><h3 className="display truncate text-2xl hover:text-[var(--accent)]">{r.name}</h3></Link>
        <Button icon size="sm" variant="ghost" aria-label={`Options for ${r.name}`} onClick={() => setMenu(true)} data-testid="routine-menu"><MoreHorizontal size={16} /></Button>
      </div>
      <p className="mt-1 line-clamp-2 flex-1 text-xs text-muted">{r.exercises.map((e) => lookup(e.exerciseId)?.name ?? 'Deleted exercise').join(', ') || 'No exercises yet'}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="hud text-[10px]">{r.days.length ? r.days.slice().sort().map((d) => WEEKDAYS[d]).join(' ') : 'Unscheduled'}</span>
        <Button size="sm" variant="primary" disabled={!r.exercises.length} onClick={() => void start()} data-testid="routine-start"><Play size={13} /> Start</Button>
      </div>
      <Dialog open={menu} onClose={() => setMenu(false)} title={r.name}>
        <div className="grid gap-2">
          <Link to={`/app/routines/${r.id}`} className="btn"><Pencil size={14} /> Edit or rename</Link>
          <Button onClick={() => void dup()} data-testid="routine-duplicate"><Copy size={14} /> Duplicate</Button>
          <Button onClick={() => { setMenu(false); setShare(true); }} data-testid="routine-share"><Share2 size={14} /> Share</Button>
          <Button variant="danger" onClick={() => void del()} data-testid="routine-delete"><Trash2 size={14} /> Delete</Button>
        </div>
      </Dialog>
      {share && <ShareDialog r={r} code={encodeShare(r, lookup)} onClose={() => setShare(false)} />}
    </li>
  );
}

function ShareDialog({ r, code, onClose }: { r: Routine; code: string; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const copy = async () => { try { await navigator.clipboard.writeText(code); toast({ kind: 'success', text: 'Share code copied' }); } catch { toast({ kind: 'error', text: 'Could not access the clipboard', detail: 'Select the code and copy it manually.' }); } };
  return (
    <Dialog open onClose={onClose} title={`Share ${r.name}`} footer={<Button variant="primary" onClick={() => void copy()}>Copy code</Button>}>
      <p className="mb-2 text-sm">Anyone can import this with Routines → Import. The routine travels inside the code: no account needed and nothing is uploaded. It contains only this routine, not your workout history.</p>
      <textarea className="input num min-h-28 text-xs" readOnly value={code} aria-label="Share code" onFocus={(e) => e.target.select()} data-testid="share-code" />
    </Dialog>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const custom = useStore((s) => s.customExercises);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    try {
      const { routine, exercises } = await decodeShare(code);
      for (const e of exercises) if (!custom.some((c) => c.id === e.id)) await save('exercises', { ...e, custom: true });
      await save('routines', routine);
      toast({ kind: 'success', text: `Imported ${routine.name}` });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'That code is not valid.'); }
  };
  return (
    <Dialog open onClose={onClose} title="Import a routine" footer={<Button variant="primary" disabled={!code.trim()} onClick={() => void run()} data-testid="import-go">Import</Button>}>
      <Field label="Share code" error={err}><textarea className="input num min-h-28 text-xs" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} data-testid="import-code" /></Field>
    </Dialog>
  );
}

function FolderDialog({ folder, onClose }: { folder: Folder | null; onClose: () => void }) {
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const routines = useStore((s) => s.routines);
  const [name, setName] = useState(folder?.name ?? '');
  const [description, setDescription] = useState(folder?.description ?? '');
  const [isProgram, setIsProgram] = useState(folder?.isProgram ?? false);
  const submit = async () => { await save('folders', { id: folder?.id ?? uid(), name: name.trim(), description: description.trim() || undefined, isProgram, updatedAt: Date.now() }); onClose(); };
  const del = async () => {
    const inside = routines.filter((r) => r.folderId === folder!.id);
    if (!(await confirmAction({ title: `Delete ${folder!.name}?`, body: inside.length ? `${inside.length} routine${inside.length === 1 ? '' : 's'} will move to Unfiled. None are deleted.` : 'The folder is empty.', confirm: 'Delete folder', danger: true }))) return;
    for (const r of inside) await save('routines', { ...r, folderId: undefined });
    await remove('folders', folder!.id);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={folder ? 'Edit folder' : 'New folder'} footer={<>{folder && <Button variant="danger" className="mr-auto" onClick={() => void del()}><Trash2 size={14} /> Delete</Button>}<Button variant="primary" disabled={!name.trim()} onClick={() => void submit()} data-testid="save-folder">Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><input className="input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} data-testid="folder-name" /></Field>
        <Field label="Description (optional)"><input className="input" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" style={{ accentColor: 'var(--accent)' }} checked={isProgram} onChange={(e) => setIsProgram(e.target.checked)} /> This is a training program</label>
      </div>
    </Dialog>
  );
}
