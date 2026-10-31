import { useEffect, useRef } from 'react';
import { Stage } from './stage';
import { isSmallScreen } from './support';

export default function ChamberScene({ tier, accent, relic, onSlow }: { tier: number; accent: string; relic: string; onSlow: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = useRef({ tier, accent, relic });
  look.current = { tier, accent, relic };
  const stage = useRef<Stage | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let s: Stage | null = null;
    const onResize = () => s?.resize();
    const onMove = (e: PointerEvent) => s?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    // Shader setup can take a moment; let the page paint and become usable first.
    const t = setTimeout(() => {
      try { s = new Stage(canvas, { mode: 'chamber', small: isSmallScreen(), tier: look.current.tier, accent: look.current.accent, relic: look.current.relic, onSlow }); stage.current = s; }
      catch (e) { console.warn('3D unavailable', e); onSlow(); }
    }, 120);
    addEventListener('resize', onResize);
    addEventListener('pointermove', onMove, { passive: true });
    return () => { clearTimeout(t); removeEventListener('resize', onResize); removeEventListener('pointermove', onMove); s?.dispose(); stage.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { stage.current?.setLook(tier, accent, relic); }, [tier, accent, relic]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" role="img" aria-label="Your armored character in the Chamber" />;
}
