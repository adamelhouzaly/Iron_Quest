/** 3D is an enhancement. Anything uncertain falls back to the drawn art. */
export function canRunWebGL() {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return false;
    if ((nav.deviceMemory ?? 8) < 3 || (navigator.hardwareConcurrency ?? 8) < 3) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
export const isSmallScreen = () => matchMedia('(max-width: 767px), (pointer: coarse)').matches;
