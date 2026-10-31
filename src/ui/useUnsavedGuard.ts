import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { confirmAction } from './kit';

/** Stops in-app navigation and tab closes from silently throwing away edits. */
export function useUnsavedGuard(dirty: boolean, body: string) {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirmAction({ title: 'Discard changes?', body, confirm: 'Discard', danger: true }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', f);
    return () => removeEventListener('beforeunload', f);
  }, [dirty]);
}
