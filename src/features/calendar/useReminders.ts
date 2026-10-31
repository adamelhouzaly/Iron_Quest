import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { dayKey, weekday } from '@/domain/util';
import { notify, notifyPermission } from '@/services/notify';

/**
 * Browser-only reminders. With no push server they fire only while Iron Quest is open or running
 * as an installed app; Settings says so plainly rather than promising more than the platform allows.
 */
export function useReminders() {
  const on = useStore((s) => s.settings.remindersOn);
  const hour = useStore((s) => s.settings.reminderHour);
  useEffect(() => {
    if (!on) return;
    const check = () => {
      if (notifyPermission() !== 'granted') return;
      const now = new Date();
      if (now.getHours() < hour) return;
      const key = `ironQuest.reminded.${dayKey(now)}`;
      try { if (localStorage.getItem(key)) return; } catch { return; }
      const { routines, workouts, active } = useStore.getState();
      const today = dayKey(now);
      if (active || workouts.some((w) => dayKey(w.completedAt) === today)) return;
      const due = routines.find((r) => r.days.includes(weekday(now)));
      if (!due) return;
      try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
      void notify('Training scheduled today', `${due.name} is on your plan. Rest is fine too.`, 'reminder');
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [on, hour]);
}
