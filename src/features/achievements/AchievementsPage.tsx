import { useState } from 'react';
import { useProgress } from '@/state/derived';
import { ACHIEVEMENTS } from '@/domain/progression';
import { fmt, fmtDate } from '@/domain/util';
import { Bar, PageHead, cx } from '@/ui/kit';
import { Sigil } from '@/ui/art';

export default function AchievementsPage() {
  const p = useProgress();
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const earned = ACHIEVEMENTS.filter((a) => p.achievements.has(a.id)).length;
  const list = ACHIEVEMENTS.filter((a) => (filter === 'all' ? true : filter === 'earned' ? p.achievements.has(a.id) : !p.achievements.has(a.id)));
  return (
    <div className="page">
      <PageHead kicker="Honors" title="Achievements"><span className="stat" data-testid="ach-count">{earned}<span className="text-muted"> / {ACHIEVEMENTS.length}</span></span></PageHead>
      <div className="mb-4 flex gap-1">{(['all', 'earned', 'locked'] as const).map((f) => <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
      {!list.length && <p className="text-sm text-muted">Nothing here yet. Your first set unlocks the first one.</p>}
      <ul className="m-0 grid list-none gap-x-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => {
          const at = p.achievements.get(a.id);
          const pr = a.progress?.(p.running);
          return (
            <li key={a.id} className={cx('flex items-center gap-3 border-b border-line py-3', !at && 'opacity-80')} data-testid={at ? 'ach-earned' : 'ach-locked'}>
              <Sigil glyph={a.glyph} tier={a.tier} locked={!at} />
              <div className="min-w-0 flex-1">
                <h2 className={cx('display text-xl', !at && 'text-silver')}>{a.name}</h2>
                <p className="text-xs text-muted">{a.description}</p>
                {at ? <p className="hud mt-1 text-[var(--accent)]">Earned {fmtDate(at)}</p> : pr && <div className="mt-1"><Bar pct={(pr[0] / pr[1]) * 100} label={a.name} /><div className="num mt-0.5 text-[10px] text-muted">{fmt(pr[0])} / {fmt(pr[1])}</div></div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
