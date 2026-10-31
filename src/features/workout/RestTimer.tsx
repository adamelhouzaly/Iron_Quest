import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { useStore } from '@/state/store';
import { fmtClock } from '@/domain/util';
import { Button, useNow } from '@/ui/kit';
import { beep, notify, vibrate } from '@/services/notify';

export function startRest(sec: number, label: string) {
  const { active, setActive } = useStore.getState();
  if (!active || sec <= 0) return;
  setActive({ ...active, rest: { endsAt: Date.now() + sec * 1000, total: sec, label } });
}

/** Fires exactly once per timer, even if the tab was asleep. Time is derived from `endsAt`, not ticks. */
export function useRestWatcher() {
  const rest = useStore((s) => s.active?.rest);
  const settings = useStore((s) => s.settings);
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!rest) return;
    const fire = () => {
      if (fired.current === rest.endsAt) return;
      fired.current = rest.endsAt;
      const stale = Date.now() - rest.endsAt > 60_000; // Reopened long after: clear quietly.
      if (!stale) {
        if (settings.restSound) beep();
        if (settings.restVibrate) vibrate([200, 100, 200]);
        if (document.visibilityState !== 'visible') void notify('Rest complete', `Next set: ${rest.label}`, 'rest');
        useStore.getState().toast({ kind: 'info', text: 'Rest complete', detail: rest.label });
      }
      const { active, setActive } = useStore.getState();
      if (active?.rest?.endsAt === rest.endsAt) setActive({ ...active, rest: null });
    };
    const left = rest.endsAt - Date.now();
    if (left <= 0) { fire(); return; }
    const t = setTimeout(fire, left);
    const onVis = () => { if (Date.now() >= rest.endsAt) fire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVis); };
  }, [rest, settings.restSound, settings.restVibrate]);
}

export function RestTimerBar() {
  const rest = useStore((s) => s.active?.rest);
  const now = useNow(250);
  if (!rest) return null;
  const left = Math.max(0, (rest.endsAt - now) / 1000);
  const adjust = (d: number) => {
    const { active, setActive } = useStore.getState();
    if (!active?.rest) return;
    const endsAt = Math.max(Date.now() + 1000, active.rest.endsAt + d * 1000);
    setActive({ ...active, rest: { ...active.rest, endsAt, total: Math.max(active.rest.total + d, 1) } });
  };
  const skip = () => { const { active, setActive } = useStore.getState(); if (active) setActive({ ...active, rest: null }); };
  return (
    <div className="glass relative border-t border-line" role="timer" aria-label="Rest timer">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent)]" style={{ width: `${(left / rest.total) * 100}%` }} />
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
        <Timer size={18} className="text-[var(--accent)]" aria-hidden />
        <div className="min-w-0 flex-1"><div className="num text-2xl font-semibold text-bone" data-testid="rest-left">{fmtClock(left)}</div><div className="hud truncate">Rest · {rest.label}</div></div>
        <Button size="sm" onClick={() => adjust(-15)} aria-label="Fifteen seconds less">−15</Button>
        <Button size="sm" onClick={() => adjust(15)} aria-label="Fifteen seconds more">+15</Button>
        <Button size="sm" variant="ghost" onClick={skip}>Skip</Button>
      </div>
    </div>
  );
}
