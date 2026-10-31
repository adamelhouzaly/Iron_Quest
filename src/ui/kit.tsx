import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { create } from 'zustand';
import { AlertTriangle, Check, CheckCircle2, Trophy, X } from 'lucide-react';
import { useStore } from '@/state/store';

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; icon?: boolean };
export function Button({ variant = 'default', size = 'md', icon, className, type = 'button', ...p }: BtnProps) {
  return <button type={type} className={cx('btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', icon && 'btn-icon', className)} {...p} />;
}

export function Plate({ className, hot, children, as: As = 'div', ...p }: { className?: string; hot?: boolean; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li'; [k: string]: unknown }) {
  return <As className={cx('plate', hot && 'plate-hot', className)} {...p}>{children}</As>;
}

/** Editorial page header: a big condensed title with a monospace kicker. */
export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <p className="hud mb-1 text-ember">{kicker}</p>
        <h1 className="display text-5xl md:text-6xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="display text-2xl">{children}</h2>{aside}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="hud truncate">{label}</div>
      <div className="stat mt-1 truncate">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="hud label">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-xs text-crimson">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Empty({ title, children, action, art }: { title: string; children?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="ticks relative overflow-hidden border border-dashed border-line px-6 py-10 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(255,107,44,.13),transparent)]" />
      {art && <div className="relative mb-3 flex justify-center text-muted">{art}</div>}
      <p className="display relative text-2xl">{title}</p>
      {children && <div className="relative mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="relative mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <div className="bar loading-bar w-40"><i style={{ width: '100%' }} /></div>
      <span className="hud">{label}</span>
    </div>
  );
}

export function Bar({ pct, className, label }: { pct: number; className?: string; label?: string }) {
  return <div className={cx('bar', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="scrollbar-none flex max-w-full gap-1 overflow-x-auto">
      {options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className="chip shrink-0" onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** Native <dialog>: gives focus trapping, Esc to close and inert background for free. */
export function Dialog({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title} className={cx('fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-hidden border border-line bg-char p-0', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <h2 className="display truncate text-2xl">{title}</h2>
            <Button variant="ghost" icon onClick={onClose} aria-label="Close"><X size={18} /></Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line p-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------- Confirmation: the only route to destructive actions ----------
interface ConfirmReq { title: string; body?: ReactNode; confirm?: string; danger?: boolean; resolve: (v: boolean) => void }
const useConfirmStore = create<{ req: ConfirmReq | null }>(() => ({ req: null }));
export function confirmAction(o: Omit<ConfirmReq, 'resolve'>) {
  return new Promise<boolean>((resolve) => useConfirmStore.setState({ req: { ...o, resolve } }));
}
export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const done = (v: boolean) => { req?.resolve(v); useConfirmStore.setState({ req: null }); };
  return (
    <Dialog open={!!req} onClose={() => done(false)} title={req?.title ?? 'Confirm'}
      footer={<><Button variant="ghost" onClick={() => done(false)}>Cancel</Button><Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => done(true)} data-testid="confirm-yes">{req?.confirm ?? 'Confirm'}</Button></>}>
      <div className="text-sm">{req?.body ?? 'Are you sure?'}</div>
    </Dialog>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-t)+.75rem)] z-[70] flex flex-col items-center gap-2 px-3" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={cx('glass pointer-events-auto flex w-full max-w-md items-start gap-3 border px-3 py-2 shadow-2xl', t.kind === 'pr' ? 'border-ember' : t.kind === 'error' ? 'border-crimson' : 'border-line')}>
          <span className="mt-0.5">
            {t.kind === 'pr' ? <Trophy size={18} className="text-ember" /> : t.kind === 'error' ? <AlertTriangle size={18} className="text-crimson" /> : t.kind === 'success' ? <CheckCircle2 size={18} className="text-good" /> : <Check size={18} className="text-muted" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cx('text-sm font-semibold text-bone', t.kind === 'pr' && 'display text-lg')}>{t.text}</p>
            {t.detail && <p className="text-xs text-muted">{t.detail}</p>}
          </div>
          {t.action && <button type="button" className="btn btn-sm" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button type="button" aria-label="Dismiss" className="p-1 text-muted hover:text-bone" onClick={() => dismiss(t.id)}><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function useReducedMotion() {
  const reduced = useStore((s) => s.settings.reducedEffects);
  const [sys, setSys] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const m = matchMedia('(prefers-reduced-motion: reduce)'); const f = () => setSys(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return reduced || sys;
}

/** Text that came from a person never goes through innerHTML anywhere in the app; React escapes it here. */
export function Multiline({ text }: { text?: string }) { return text ? <p className="whitespace-pre-wrap break-words text-sm text-silver">{text}</p> : null; }
