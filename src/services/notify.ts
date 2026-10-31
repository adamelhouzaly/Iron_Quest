export const notifySupported = () => typeof Notification !== 'undefined';
export const notifyPermission = () => (notifySupported() ? Notification.permission : 'denied');
export async function requestNotify() { if (!notifySupported()) return 'denied' as const; return Notification.requestPermission(); }

export async function notify(title: string, body: string, tag = 'iron-quest') {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  const opts: NotificationOptions = { body, tag, icon: `${import.meta.env.BASE_URL}icon-192.png`, badge: `${import.meta.env.BASE_URL}icon-192.png` };
  try {
    // Mobile browsers require notifications to go through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return true; }
    new Notification(title, opts);
    return true;
  } catch { return false; }
}

let audio: AudioContext | null = null;
export function beep() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    for (const [i, f] of [660, 880, 1100].entries()) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.13);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.15);
    }
  } catch { /* audio is a nicety */ }
}
export const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };
