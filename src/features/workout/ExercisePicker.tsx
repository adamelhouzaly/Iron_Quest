import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { CATEGORY_LABEL, EQUIPMENT_LABEL } from '@/data/exercises';
import { MUSCLES, MUSCLE_LABEL } from '@/domain/analytics';
import type { Exercise } from '@/domain/types';
import { useAllExercises } from '@/state/derived';
import { Button, Dialog, cx } from '@/ui/kit';
import { Link } from 'react-router-dom';

export function matches(e: Exercise, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${e.name} ${e.primary.join(' ')} ${e.secondary.join(' ')} ${EQUIPMENT_LABEL[e.equipment] ?? ''} ${CATEGORY_LABEL[e.category] ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (list: Exercise[]) => void }) {
  const all = useAllExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const list = useMemo(() => all.filter((e) => (!q || matches(e, q)) && (!muscle || e.primary.includes(muscle as never) || e.secondary.includes(muscle as never))), [all, q, muscle]);
  const close = () => { setPicked([]); setQ(''); setMuscle(''); onClose(); };
  const add = () => { onPick(picked.map((id) => all.find((e) => e.id === id)!).filter(Boolean)); close(); };
  return (
    <Dialog open={open} onClose={close} title="Add exercises" wide
      footer={<><Link to="/app/exercises?new=1" className="btn btn-ghost mr-auto"><Plus size={14} /> Custom</Link><Button variant="primary" disabled={!picked.length} onClick={add} data-testid="picker-add">Add {picked.length || ''}</Button></>}>
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-2 flex gap-2 border-b border-line bg-char p-3">
        <input type="search" autoFocus className="input" placeholder="Search name, muscle, equipment" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-36" aria-label="Filter by muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          <option value="">All muscles</option>
          {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}
        </select>
      </div>
      {list.length === 0 && <p className="py-8 text-center text-sm text-muted">No match. You can create it as a custom exercise.</p>}
      <ul className="m-0 list-none p-0">
        {list.map((e) => {
          const on = picked.includes(e.id);
          return (
            <li key={e.id} className="lazy-row border-b border-line/60">
              <button type="button" aria-pressed={on} className={cx('flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left', on && 'bg-white/5')} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))}>
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center border', on ? 'border-[var(--accent)] bg-[var(--accent)] text-black' : 'border-line')}>{on && <Check size={14} />}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-bone">{e.name}</span>
                  <span className="block truncate text-xs text-muted">{e.primary.map((m) => MUSCLE_LABEL[m] ?? m).join(', ') || 'Custom'} · {EQUIPMENT_LABEL[e.equipment]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
