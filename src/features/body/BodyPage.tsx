import { useEffect, useMemo, useState } from 'react';
import { Camera, Scale, Trash2 } from 'lucide-react';
import { useStore } from '@/state/store';
import type { BodyEntry, MeasureSite, PhotoEntry } from '@/domain/types';
import { dayKey, fmt, fmtDate, parseDay, toDisplay, toKg, uid } from '@/domain/util';
import { Button, Dialog, Empty, Field, PageHead, Segmented, Stat, confirmAction } from '@/ui/kit';
import { LinesChart } from '@/ui/charts';
import { deleteBlob, getBlob, putBlob } from '@/services/db';

const SITES: MeasureSite[] = ['neck', 'chest', 'waist', 'hips', 'arm', 'forearm', 'thigh', 'calf'];
const parse = (s: string, lo: number, hi: number) => { if (!s.trim()) return undefined; const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n >= lo && n <= hi ? n : NaN; };

export default function BodyPage() {
  const [tab, setTab] = useState<'metrics' | 'photos'>('metrics');
  return (
    <div className="page">
      <PageHead kicker="The vessel" title="Body" />
      <div className="mb-5"><Segmented label="Body section" value={tab} onChange={setTab} options={[{ value: 'metrics', label: 'Metrics' }, { value: 'photos', label: 'Photos' }]} /></div>
      {tab === 'metrics' ? <Metrics /> : <Photos />}
    </div>
  );
}

function Metrics() {
  const body = useStore((s) => s.body);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const unit = useStore((s) => s.settings.unit);
  const toast = useStore((s) => s.toast);
  const list = useMemo(() => [...body].sort((a, b) => a.date.localeCompare(b.date)), [body]);
  const [date, setDate] = useState(dayKey(Date.now()));
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [m, setM] = useState<Partial<Record<MeasureSite, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const latest = list[list.length - 1];
  const latestW = [...list].reverse().find((e) => e.weightKg);
  const firstW = list.find((e) => e.weightKg);
  const submit = async () => {
    const w = parse(weight, unit === 'kg' ? 20 : 44, unit === 'kg' ? 400 : 880);
    const f = parse(fat, 2, 70);
    const measures: Partial<Record<MeasureSite, number>> = {};
    let bad = Number.isNaN(w) || Number.isNaN(f);
    for (const s of SITES) { const v = parse(m[s] ?? '', 5, 300); if (Number.isNaN(v)) bad = true; else if (v !== undefined) measures[s] = v; }
    if (bad) { setError('One of those values is out of range. Check the numbers.'); return; }
    if (w === undefined && f === undefined && !Object.keys(measures).length) { setError('Enter at least one value.'); return; }
    const existing = body.find((e) => e.date === date);
    const entry: BodyEntry = { id: existing?.id ?? uid(), date, weightKg: w !== undefined ? toKg(w, unit) : existing?.weightKg, bodyFat: f ?? existing?.bodyFat, measures: { ...existing?.measures, ...measures }, updatedAt: Date.now() };
    await save('body', entry);
    setWeight(''); setFat(''); setM({}); setError(null);
    toast({ kind: 'success', text: 'Entry saved', detail: 'Body metrics earn no XP. They are just for you.' });
  };
  const dt = (v: string | number) => fmtDate(parseDay(String(v)), { month: 'short', day: 'numeric' });
  const chart = (pick: (e: BodyEntry) => number | undefined) => list.flatMap((e) => { const v = pick(e); return v === undefined ? [] : [{ date: e.date, v }]; });
  const weightData = chart((e) => (e.weightKg ? toDisplay(e.weightKg, unit) : undefined));
  const fatData = chart((e) => e.bodyFat);
  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3 self-start border border-line p-4">
        <h2 className="display text-2xl">New entry</h2>
        <Field label="Date"><input type="date" className="input" value={date} max={dayKey(Date.now())} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Weight (${unit})`}><input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} data-testid="body-weight" /></Field>
          <Field label="Body fat (%)"><input className="input" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} /></Field>
        </div>
        <details><summary className="hud cursor-pointer py-2">Measurements (cm)</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">{SITES.map((s) => <Field key={s} label={s}><input className="input" inputMode="decimal" value={m[s] ?? ''} onChange={(e) => setM({ ...m, [s]: e.target.value })} /></Field>)}</div>
        </details>
        {error && <p role="alert" className="text-sm text-crimson">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" data-testid="body-save">Save entry</Button>
      </form>
      <div className="min-w-0 space-y-6">
        {!list.length ? <Empty title="No entries yet" art={<Scale size={28} />}>Log body weight, body fat or tape measurements whenever you like. Trends appear after two entries.</Empty> : (
          <>
            <div className="grid grid-cols-3 gap-4 border-y border-line py-4">
              <Stat label="Weight" value={latestW?.weightKg ? `${fmt(toDisplay(latestW.weightKg, unit), 1)} ${unit}` : '—'} hint={firstW && latestW && firstW !== latestW ? `${fmt(toDisplay(latestW.weightKg! - firstW.weightKg!, unit), 1)} ${unit} since start` : undefined} />
              <Stat label="Body fat" value={latest?.bodyFat ? `${latest.bodyFat}%` : '—'} />
              <Stat label="Entries" value={list.length} />
            </div>
            {weightData.length > 1 && <LinesChart area title="Body weight" data={weightData} x="date" xFormat={dt} series={[{ key: 'v', label: 'Weight', format: (v) => `${fmt(v, 1)} ${unit}` }]} />}
            {fatData.length > 1 && <LinesChart title="Body fat" data={fatData} x="date" xFormat={dt} series={[{ key: 'v', label: 'Body fat', format: (v) => `${v}%` }]} />}
            <section><h2 className="display mb-1 text-2xl">Log</h2>
              <ul className="m-0 list-none p-0">{[...list].reverse().slice(0, 40).map((e) => (
                <li key={e.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 text-sm" data-testid="body-row">
                  <span className="w-24 shrink-0 text-xs text-muted">{fmtDate(parseDay(e.date))}</span>
                  <span className="num min-w-0 flex-1 truncate text-xs text-bone">{[e.weightKg && `${fmt(toDisplay(e.weightKg, unit), 1)} ${unit}`, e.bodyFat && `${e.bodyFat}%`, ...Object.entries(e.measures ?? {}).map(([k, v]) => `${k} ${v}cm`)].filter(Boolean).join(' · ')}</span>
                  <Button icon size="sm" variant="ghost" aria-label={`Delete entry from ${e.date}`} onClick={async () => { if (await confirmAction({ title: 'Delete entry?', confirm: 'Delete', danger: true })) await remove('body', e.id); }}><Trash2 size={14} /></Button>
                </li>
              ))}</ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** Downscale on the device: keeps storage sane, and strips EXIF (including location). */
function compress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
    img.src = url;
  });
}

function PhotoThumb({ p, onOpen, selected }: { p: PhotoEntry; onOpen: () => void; selected?: boolean }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { void getBlob(p.id).then(setSrc); }, [p.id]);
  return (
    <button type="button" onClick={onOpen} aria-pressed={selected} aria-label={`Progress photo from ${p.date}, ${p.pose}`} className={`relative block aspect-[3/4] w-full overflow-hidden border bg-char ${selected ? 'border-[var(--accent)]' : 'border-line'}`} data-testid="photo">
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
      <span className="hud absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-0.5 text-[9px]">{p.date} · {p.pose}</span>
    </button>
  );
}

function Photos() {
  const photos = useStore((s) => s.photos);
  const save = useStore((s) => s.save);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const [pose, setPose] = useState<PhotoEntry['pose']>('front');
  const [date, setDate] = useState(dayKey(Date.now()));
  const [view, setView] = useState<{ p: PhotoEntry; src: string } | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  const sorted = useMemo(() => [...photos].sort((a, b) => b.date.localeCompare(a.date)), [photos]);
  const add = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try {
        const dataUrl = await compress(f);
        const id = uid();
        await putBlob(id, dataUrl);
        await save('photos', { id, date, pose, updatedAt: Date.now() });
      } catch (e) { toast({ kind: 'error', text: 'Photo not added', detail: e instanceof Error ? e.message : 'Storage may be full.' }); }
    }
  };
  useEffect(() => { for (const id of compare) if (!srcs[id]) void getBlob(id).then((s) => s && setSrcs((x) => ({ ...x, [id]: s }))); }, [compare, srcs]);
  const del = async (p: PhotoEntry) => {
    if (!(await confirmAction({ title: 'Delete this photo?', body: 'It cannot be recovered.', confirm: 'Delete', danger: true }))) return;
    await remove('photos', p.id); await deleteBlob(p.id); setView(null); setCompare((c) => c.filter((x) => x !== p.id));
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 border border-line p-3">
        <Field label="Date"><input type="date" className="input" value={date} max={dayKey(Date.now())} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Pose"><select className="input" value={pose} onChange={(e) => setPose(e.target.value as PhotoEntry['pose'])}><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option><option value="other">Other</option></select></Field>
        <label className="btn btn-primary cursor-pointer"><Camera size={15} /> Add photo<input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} data-testid="photo-input" /></label>
        <p className="w-full text-xs text-muted">Photos stay on this device. They never sync or get shared, and location data is stripped when they're added. They're included in your JSON backup file, so keep that file safe.</p>
      </div>
      {!photos.length && <Empty title="No photos yet" art={<Camera size={28} />}>Same light and same pose every few weeks makes change easier to see. Entirely optional.</Empty>}
      {compare.length === 2 && (
        <section className="mb-6"><h2 className="display mb-2 text-2xl">Compare</h2><div className="grid max-w-3xl grid-cols-2 gap-2">{compare.map((id) => <figure key={id} className="m-0">{srcs[id] && <img src={srcs[id]} alt={`Progress photo from ${photos.find((p) => p.id === id)?.date}`} className="w-full" />}<figcaption className="hud mt-1">{photos.find((p) => p.id === id)?.date}</figcaption></figure>)}</div></section>
      )}
      {!!photos.length && <p className="mb-2 text-xs text-muted">Tap a photo to open it. Use Compare inside to line up two.</p>}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6">
        {sorted.map((p) => <PhotoThumb key={p.id} p={p} selected={compare.includes(p.id)} onOpen={() => void getBlob(p.id).then((src) => src && setView({ p, src }))} />)}
      </div>
      <Dialog open={!!view} onClose={() => setView(null)} title={view ? `${view.p.date} · ${view.p.pose}` : 'Photo'} footer={view && <><Button variant="danger" className="mr-auto" onClick={() => void del(view.p)}><Trash2 size={14} /> Delete</Button><Button onClick={() => { setCompare((c) => (c.includes(view.p.id) ? c.filter((x) => x !== view.p.id) : [...c.slice(-1), view.p.id])); setView(null); }}>{view.p && compare.includes(view.p.id) ? 'Remove from compare' : 'Compare'}</Button></>}>
        {view && <img src={view.src} alt={`Progress photo, ${view.p.pose}, ${view.p.date}`} className="mx-auto max-h-[65dvh]" />}
      </Dialog>
    </div>
  );
}
